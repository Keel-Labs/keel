import {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  Tray,
  Menu,
  nativeImage,
  dialog,
  Notification,
  net,
} from 'electron';
import OpenAI from 'openai';
import * as path from 'path';
import * as fs from 'fs';
// chokidar v5 is ESM-only — loaded via dynamic import in startFileWatcher()
import { FileManager, TeamFileManager } from '../src/core/fileManager';
import { LLMClient } from '../src/core/llmClient';
import { ContextAssembler } from '../src/core/contextAssembler';
import { loadSettings, saveSettings as saveSettingsToFile } from '../src/core/settings';
import { embedFile } from '../src/core/embeddings';
import { upsertChunks } from '../src/core/vectorStore';
import {
  getDb,
  closeDb,
  getFileIndex,
  updateFileIndex,
  removeFileIndex,
  logActivity,
  saveChatSession,
  loadChatSession,
  getLatestSessionId,
  listChatSessions,
  createReminder,
  getDueReminders,
  markReminderFired,
  rescheduleRecurring,
  listUpcomingReminders,
  deleteReminder,
} from '../src/core/db';
import { capture } from '../src/core/workflows/capture';
import { autoCapture } from '../src/core/workflows/autoCapture';
import { dailyBrief } from '../src/core/workflows/dailyBrief';
import { eod } from '../src/core/workflows/eod';
import { extractAndSaveMemory } from '../src/core/workflows/memoryExtract';
import { ingestWikiSource } from '../src/core/workflows/wikiIngest';
import { createWikiBase } from '../src/core/workflows/wikiBase';
import { compileWikiBase, runWikiHealthCheck } from '../src/core/workflows/wikiMaintenance';
import {
  startOAuthFlow,
  saveTokens,
  isGoogleConnected,
  disconnectGoogle,
  type GoogleOAuthConfig,
} from '../src/core/connectors/googleAuth';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_SCOPES } from '../src/core/connectors/googleConfig';
import { syncCalendar, getUpcomingEventsFormatted, createCalendarEvent } from '../src/core/connectors/googleCalendar';
import { exportToGoogleDoc, readGoogleDoc, extractDocId } from '../src/core/connectors/googleDocs';
import type { Message, Settings, UtilityWindowKind, WikiJob, WikiSourceInput } from '../src/shared/types';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const utilityWindows = new Map<UtilityWindowKind, BrowserWindow>();
const wikiJobs = new Map<string, WikiJob>();

const settings = loadSettings();
const fileManager = new FileManager(settings.brainPath);
const llmClient = new LLMClient();
const contextAssembler = new ContextAssembler(fileManager, false, settings.timezone || undefined);
let teamFileManager: TeamFileManager | null = settings.teamBrainPath
  ? new TeamFileManager(settings.teamBrainPath)
  : null;

const isDev = process.env.NODE_ENV === 'development';

function createWikiJob(type: WikiJob['type'], basePath: string, detail: string): WikiJob {
  const now = Date.now();
  const id = `wiki-job-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const title = type === 'compile' ? 'Compile wiki base' : 'Run health check';

  const job: WikiJob = {
    id,
    type,
    basePath,
    status: 'queued',
    title,
    detail,
    startedAt: now,
    updatedAt: now,
  };

  wikiJobs.set(id, job);
  return job;
}

function updateWikiJob(id: string, patch: Partial<WikiJob>): WikiJob | null {
  const current = wikiJobs.get(id);
  if (!current) return null;

  const next: WikiJob = {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  };
  wikiJobs.set(id, next);
  return next;
}

function listWikiJobsForBase(basePath?: string): WikiJob[] {
  return Array.from(wikiJobs.values())
    .filter((job) => !basePath || job.basePath === basePath)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function loadRendererWindow(targetWindow: BrowserWindow, query?: Record<string, string>) {
  if (isDev) {
    const url = new URL('http://localhost:5173');
    if (query) {
      Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
    }
    targetWindow.loadURL(url.toString());
    return;
  }

  targetWindow.loadFile(path.join(__dirname, '../../renderer/index.html'), {
    query,
  });
}

function createWindow() {
  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: 1220,
    height: 830,
    minWidth: 1080,
    minHeight: 760,
    title: 'Keel',
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  if (process.platform === 'darwin') {
    windowOptions.titleBarStyle = 'hidden';
    windowOptions.titleBarOverlay = true;
    windowOptions.trafficLightPosition = { x: 14, y: 14 };
  }

  mainWindow = new BrowserWindow(windowOptions);

  loadRendererWindow(mainWindow);

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const { shell } = require('electron');
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://') && !url.startsWith('http://localhost')) {
      event.preventDefault();
      const { shell } = require('electron');
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createUtilityWindow(kind: UtilityWindowKind, query?: Record<string, string>) {
  const existingWindow = utilityWindows.get(kind);
  if (existingWindow && !existingWindow.isDestroyed()) {
    loadRendererWindow(existingWindow, { window: kind, ...(query || {}) });
    existingWindow.show();
    existingWindow.focus();
    return existingWindow;
  }

  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: kind === 'settings' ? 1120 : 780,
    height: kind === 'settings' ? 820 : 720,
    minWidth: kind === 'settings' ? 960 : 680,
    minHeight: kind === 'settings' ? 720 : 620,
    title: kind === 'settings' ? 'Settings' : 'Add Source',
    backgroundColor: '#1a1a1a',
    parent: mainWindow ?? undefined,
    modal: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  if (process.platform === 'darwin') {
    windowOptions.titleBarStyle = 'hidden';
    windowOptions.titleBarOverlay = true;
    windowOptions.trafficLightPosition = { x: 14, y: 14 };
  }

  const utilityWindow = new BrowserWindow(windowOptions);
  utilityWindows.set(kind, utilityWindow);
  loadRendererWindow(utilityWindow, { window: kind, ...(query || {}) });

  utilityWindow.once('ready-to-show', () => {
    utilityWindow.show();
    utilityWindow.focus();
  });

  utilityWindow.on('closed', () => {
    utilityWindows.delete(kind);
  });

  return utilityWindow;
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setTitle('⚓');
  tray.setToolTip('Keel');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Keel',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function registerShortcuts() {
  globalShortcut.register('CommandOrControl+Shift+K', () => {
    if (!mainWindow) {
      createWindow();
      return;
    }
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function filterOpenAIChatModels(modelIds: string[]): string[] {
  const excludedFragments = [
    'audio',
    'realtime',
    'transcribe',
    'tts',
    'whisper',
    'embedding',
    'moderation',
    'omni-moderation',
    'dall-e',
    'image',
    'search',
    'computer-use',
  ];

  const preferredOrder = [
    'gpt-5.4',
    'gpt-5.4-mini',
    'gpt-5.4-nano',
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4o',
    'gpt-4o-mini',
    'o4-mini',
    'o3',
    'o1',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
  ];

  const preferredRank = new Map(preferredOrder.map((model, index) => [model, index]));

  return [...new Set(modelIds)]
    .filter((id) => /^(gpt-|o\d|chatgpt-)/.test(id))
    .filter((id) => !excludedFragments.some((fragment) => id.includes(fragment)))
    .sort((left, right) => {
      const leftRank = preferredRank.get(left) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = preferredRank.get(right) ?? Number.MAX_SAFE_INTEGER;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return left.localeCompare(right);
    });
}

function getElectronAwareFetch(): typeof fetch {
  if (net?.fetch) {
    return ((input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      return net.fetch(url, init as any) as unknown as Promise<Response>;
    }) as typeof fetch;
  }

  return fetch;
}

// --- File Watcher & Indexing ---

let debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
// Self-write flag: prevents Keel's own file writes from triggering re-indexing
let selfWriting = false;
let selfWriteTimer: ReturnType<typeof setTimeout> | null = null;

export function setSelfWriting(): void {
  selfWriting = true;
  if (selfWriteTimer) clearTimeout(selfWriteTimer);
  selfWriteTimer = setTimeout(() => { selfWriting = false; }, 500);
}

async function indexFile(filePath: string): Promise<void> {
  try {
    // Hash check: skip if content unchanged since last index
    const fullPath = path.join(settings.brainPath, filePath);
    const raw = fs.readFileSync(fullPath, 'utf-8');
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    const existing = getFileIndex(settings.brainPath, filePath);
    if (existing && (existing as any).hash === hash) return;

    const chunks = await embedFile(fileManager, filePath);
    if (chunks.length > 0) {
      await upsertChunks(settings.brainPath, chunks);
      updateFileIndex(settings.brainPath, filePath, chunks.length, hash);
    }
  } catch (error) {
    // Embedding service might not be available — that's ok
    console.error(`Failed to index ${filePath}:`, error);
  }
}

function handleFileChange(fullPath: string): void {
  // Skip if Keel itself is writing this file
  if (selfWriting) return;

  const relativePath = path.relative(settings.brainPath, fullPath);
  if (!relativePath.endsWith('.md')) return;
  if (relativePath.startsWith('.')) return;

  const existing = debounceTimers.get(relativePath);
  if (existing) clearTimeout(existing);

  debounceTimers.set(
    relativePath,
    setTimeout(() => {
      debounceTimers.delete(relativePath);
      indexFile(relativePath);
    }, 2000)
  );
}

function handleFileDelete(fullPath: string): void {
  const relativePath = path.relative(settings.brainPath, fullPath);
  if (!relativePath.endsWith('.md') || relativePath.startsWith('.')) return;

  removeFileIndex(settings.brainPath, relativePath);
  // Vector store deletion is handled by upsertChunks on next index
}

async function startupIndex(): Promise<void> {
  try {
    const allMdFiles = await fileManager.listFiles('**/*.md');

    for (const file of allMdFiles) {
      const existing = getFileIndex(settings.brainPath, file);
      if (!existing) {
        await indexFile(file);
      } else {
        // Check if file was modified since last index
        try {
          const fullPath = path.join(settings.brainPath, file);
          const stat = fs.statSync(fullPath);
          if (stat.mtimeMs > existing.lastIndexedAt) {
            await indexFile(file);
          }
        } catch {
          // File might have been deleted
        }
      }
    }

    // Enable semantic search once indexing is done
    contextAssembler.enableSemanticSearch();
    console.log(`Startup indexing complete: ${allMdFiles.length} files checked`);
  } catch (error) {
    console.error('Startup indexing failed:', error);
  }
}

async function startFileWatcher(): Promise<void> {
  const chokidar = await import('chokidar');
  const watcher = chokidar.watch(path.join(settings.brainPath, '**/*.md'), {
    ignoreInitial: true,
    ignored: [/node_modules/, /\.config/],
  });

  watcher.on('add', handleFileChange);
  watcher.on('change', handleFileChange);
  watcher.on('unlink', handleFileDelete);
}

// --- Team Brain Indexing & Watcher ---

async function teamIndexFile(filePath: string): Promise<void> {
  if (!teamFileManager) return;
  try {
    const fullPath = path.join(settings.teamBrainPath, filePath);
    const raw = fs.readFileSync(fullPath, 'utf-8');
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    const existing = getFileIndex(settings.teamBrainPath, filePath);
    if (existing && (existing as any).hash === hash) return;

    const chunks = await embedFile(teamFileManager, filePath);
    if (chunks.length > 0) {
      await upsertChunks(settings.teamBrainPath, chunks);
      updateFileIndex(settings.teamBrainPath, filePath, chunks.length, hash);
    }
  } catch (error) {
    console.error(`Failed to index team file ${filePath}:`, error);
  }
}

async function teamStartupIndex(): Promise<void> {
  if (!teamFileManager) return;
  try {
    const allMdFiles = await teamFileManager.listFiles('**/*.md');
    for (const file of allMdFiles) {
      const existing = getFileIndex(settings.teamBrainPath, file);
      if (!existing) {
        await teamIndexFile(file);
      } else {
        try {
          const fullPath = path.join(settings.teamBrainPath, file);
          const stat = fs.statSync(fullPath);
          if (stat.mtimeMs > existing.lastIndexedAt) {
            await teamIndexFile(file);
          }
        } catch {
          // File might have been deleted
        }
      }
    }
    console.log(`Team brain indexing complete: ${allMdFiles.length} files checked`);
  } catch (error) {
    console.error('Team brain indexing failed:', error);
  }
}

async function startTeamFileWatcher(): Promise<void> {
  if (!teamFileManager || !settings.teamBrainPath) return;
  const chokidar = await import('chokidar');
  const watcher = chokidar.watch(path.join(settings.teamBrainPath, '**/*.md'), {
    ignoreInitial: true,
    ignored: [/node_modules/, /\.config/],
  });

  watcher.on('add', (fullPath: string) => {
    const relativePath = path.relative(settings.teamBrainPath, fullPath);
    if (!relativePath.endsWith('.md') || relativePath.startsWith('.')) return;
    teamIndexFile(relativePath);
  });
  watcher.on('change', (fullPath: string) => {
    const relativePath = path.relative(settings.teamBrainPath, fullPath);
    if (!relativePath.endsWith('.md') || relativePath.startsWith('.')) return;
    teamIndexFile(relativePath);
  });
}

// --- PDF Export ---

async function exportToPdf(markdownContent: string, title?: string): Promise<string> {
  const { marked } = await import('marked');
  const htmlBody = await marked.parse(markdownContent);
  const docTitle = title || 'Keel Export';
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${docTitle}</title>
  <style>
    @page { margin: 60px 50px; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
      font-size: 13px;
      line-height: 1.7;
      color: #1a1a1a;
      max-width: 100%;
    }
    .header {
      border-bottom: 2px solid #2563eb;
      padding-bottom: 12px;
      margin-bottom: 24px;
    }
    .header h1 {
      font-size: 22px;
      font-weight: 600;
      color: #1a1a1a;
      margin: 0 0 4px 0;
    }
    .header .meta {
      font-size: 11px;
      color: #6b7280;
    }
    h1 { font-size: 20px; margin-top: 24px; }
    h2 { font-size: 16px; margin-top: 20px; color: #1e40af; }
    h3 { font-size: 14px; margin-top: 16px; }
    p { margin-bottom: 10px; }
    ul, ol { padding-left: 24px; margin-bottom: 10px; }
    li { margin-bottom: 4px; }
    code {
      background: #f3f4f6;
      padding: 2px 5px;
      border-radius: 3px;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 12px;
    }
    pre {
      background: #f8f9fa;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 12px 16px;
      overflow-x: auto;
      margin-bottom: 12px;
    }
    pre code { background: none; padding: 0; font-size: 11.5px; }
    blockquote {
      border-left: 3px solid #2563eb;
      padding-left: 14px;
      color: #4b5563;
      margin: 12px 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 12px;
      font-size: 12px;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 8px 12px;
      text-align: left;
    }
    th { background: #f3f4f6; font-weight: 600; }
    strong { color: #111827; }
    a { color: #2563eb; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 16px 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${docTitle}</h1>
    <div class="meta">Generated by Keel &middot; ${dateStr}</div>
  </div>
  ${htmlBody}
</body>
</html>`;

  // Render in a hidden window and print to PDF
  const pdfWindow = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: { offscreen: true },
  });

  await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  // Wait for content to render
  await new Promise((resolve) => setTimeout(resolve, 500));

  const pdfData = await pdfWindow.webContents.printToPDF({
    printBackground: true,
    margins: { marginType: 'default' },
  });

  pdfWindow.close();

  // Show save dialog
  const defaultName = `${docTitle.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.pdf`;
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Save PDF',
    defaultPath: defaultName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });

  if (result.canceled || !result.filePath) {
    return 'PDF export cancelled.';
  }

  fs.writeFileSync(result.filePath, pdfData);
  logActivity(settings.brainPath, 'export-pdf', result.filePath);

  // Open the PDF immediately
  const { shell } = await import('electron');
  shell.openPath(result.filePath);

  return `PDF saved and opened: **${result.filePath}**`;
}

// --- IPC Handlers ---

function registerIpcHandlers() {
  ipcMain.handle('keel:ensure-brain', async () => {
    await fileManager.ensureDirectoryStructure();
  });

  ipcMain.handle('keel:reset-profile', async () => {
    await fileManager.resetProfile();
    logActivity(settings.brainPath, 'reset', 'Profile and daily logs reset to clean state');
  });

  ipcMain.handle('keel:get-settings', () => {
    return loadSettings();
  });

  ipcMain.handle('keel:save-settings', async (_event, newSettings: Settings) => {
    const teamPathChanged = newSettings.teamBrainPath !== settings.teamBrainPath;
    saveSettingsToFile(newSettings);
    Object.assign(settings, newSettings);
    llmClient.reload();
    contextAssembler.setTimezone(newSettings.timezone || '');

    // Reinitialize team brain if path changed
    if (teamPathChanged) {
      if (newSettings.teamBrainPath) {
        teamFileManager = new TeamFileManager(newSettings.teamBrainPath);
        await teamFileManager.ensureTeamStructure();
        contextAssembler.setTeamFileManager(teamFileManager);
        teamStartupIndex().catch(() => {});
        startTeamFileWatcher().catch(() => {});
      } else {
        teamFileManager = null;
        contextAssembler.setTeamFileManager(null);
      }
    }
  });

  // Enrich messages: auto-fetch Google Docs and Calendar events
  async function enrichMessages(
    messages: Message[],
    emitThinking: (step: string) => void = () => {},
  ): Promise<Message[]> {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return messages;
    if (!isGoogleConnected(settings.brainPath)) return messages;

    const enriched = [...messages];
    const last = enriched[enriched.length - 1];
    if (!last || last.role !== 'user') return enriched;

    const config = { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, scopes: GOOGLE_SCOPES };
    const appendParts: string[] = [];

    // 1. Auto-fetch Google Doc URLs
    const docUrlPattern = /https?:\/\/docs\.google\.com\/document\/d\/[a-zA-Z0-9_-]+[^\s)"]*/g;
    const urls = last.content.match(docUrlPattern);
    if (urls) {
      for (const url of urls) {
        const docId = extractDocId(url);
        if (!docId) continue;
        emitThinking('Reading Google Doc');
        try {
          const { title, content } = await readGoogleDoc(settings.brainPath, config, docId);
          emitThinking(`Read "${title}" (${content.length.toLocaleString()} chars)`);
          appendParts.push(`\n\n--- Google Doc: "${title}" ---\n\n${content.slice(0, 50000)}`);
        } catch (err) {
          emitThinking(`Failed to read Google Doc: ${err instanceof Error ? err.message : 'unknown error'}`);
          appendParts.push(`\n\n[Could not read Google Doc: ${err instanceof Error ? err.message : 'unknown error'}]`);
        }
      }
    }

    // 2. Auto-fetch Calendar events when user asks about schedule/meetings
    const msg = last.content.toLowerCase();
    const calendarKeywords = /\b(meeting|meetings|calendar|schedule|scheduled|agenda|event|events|busy|free|available|appointment|appointments)\b/;
    const timeKeywords = /\b(today|tomorrow|this week|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/;
    if (calendarKeywords.test(msg) && (timeKeywords.test(msg) || /\b(what|when|do i have|check|show|any)\b/.test(msg))) {
      const daysAhead = /tomorrow/.test(msg) ? 2 : /this week|next week/.test(msg) ? 7 : 1;
      emitThinking('Fetching Google Calendar');
      try {
        const events = await getUpcomingEventsFormatted(settings.brainPath, config, daysAhead);
        emitThinking(`Fetched calendar events for next ${daysAhead} day(s)`);
        appendParts.push(`\n\n--- Google Calendar (next ${daysAhead} day${daysAhead > 1 ? 's' : ''}) ---\n\n${events}`);
      } catch (err) {
        emitThinking(`Failed to fetch calendar: ${err instanceof Error ? err.message : 'unknown error'}`);
        appendParts.push(`\n\n[Could not fetch calendar: ${err instanceof Error ? err.message : 'unknown error'}]`);
      }
    }

    if (appendParts.length > 0) {
      enriched[enriched.length - 1] = {
        ...last,
        content: last.content + appendParts.join(''),
      };
    }

    return enriched;
  }

  ipcMain.handle('keel:chat', async (_event, messages: Message[]) => {
    const enrichedMessages = await enrichMessages(messages);
    const lastMessage = enrichedMessages[enrichedMessages.length - 1]?.content;
    const systemPrompt = await contextAssembler.assembleContext(lastMessage, () => {});
    logActivity(settings.brainPath, 'chat', lastMessage?.slice(0, 200));
    return llmClient.chat(enrichedMessages, systemPrompt);
  });

  ipcMain.handle('keel:chat-stream', async (event, messages: Message[], requestId: string) => {
    const sender = event.sender;
    const streamRequestId = requestId || `request-${Date.now()}`;
    const emitThinking = (step: string) => {
      if (!sender.isDestroyed()) {
        sender.send('keel:thinking-step', { requestId: streamRequestId, step });
      }
    };
    const enrichedMessages = await enrichMessages(messages, emitThinking);
    const lastMessage = enrichedMessages[enrichedMessages.length - 1]?.content;
    const systemPrompt = await contextAssembler.assembleContext(lastMessage, emitThinking);
    emitThinking('Generating answer');

    logActivity(settings.brainPath, 'chat', lastMessage?.slice(0, 200));

    try {
      let fullResponse = '';
      let buffer = '';
      let flushTimer: ReturnType<typeof setTimeout> | null = null;

      const flush = () => {
        if (buffer && !sender.isDestroyed()) {
          sender.send('keel:chat-stream-chunk', { requestId: streamRequestId, chunk: buffer });
          buffer = '';
        }
        flushTimer = null;
      };

      await llmClient.chatStream(enrichedMessages, systemPrompt, (chunk: string) => {
        fullResponse += chunk;
        buffer += chunk;
        // Flush immediately if buffer hits 100 chars, otherwise batch at 50ms
        if (buffer.length >= 100) {
          if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
          flush();
        } else if (!flushTimer) {
          flushTimer = setTimeout(flush, 50);
        }
      });

      // Final flush
      if (flushTimer) clearTimeout(flushTimer);
      flush();

      if (!sender.isDestroyed()) {
        sender.send('keel:chat-stream-done', { requestId: streamRequestId });
      }

      // Extract and save memory in background (don't block the response)
      const allMessages = [...messages, { role: 'assistant' as const, content: fullResponse, timestamp: Date.now() }];
      extractAndSaveMemory(allMessages, fileManager, llmClient).then((result) => {
        setSelfWriting();
        if (result?.updated && !sender.isDestroyed()) {
          sender.send('keel:memory-updated', {
            requestId: streamRequestId,
            summary: result.summary,
          });
        }
      }).catch((err) => {
        console.error('[main] Memory extraction failed:', err);
      });

      // Auto-capture substantial context from user messages
      const googleConfig = (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET)
        ? { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, scopes: GOOGLE_SCOPES }
        : undefined;
      autoCapture(allMessages, fileManager, llmClient, googleConfig).then((result) => {
        if (result.captured && result.summary && !sender.isDestroyed()) {
          sender.send('keel:auto-capture-done', {
            requestId: streamRequestId,
            summary: result.summary,
          });
        }
      }).catch((err) => {
        console.error('[main] Auto-capture failed:', err);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (!sender.isDestroyed()) {
        sender.send('keel:chat-stream-error', { requestId: streamRequestId, error: message });
      }
    }
  });

  ipcMain.handle('keel:capture', async (_event, input: string) => {
    const googleConfig = (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET)
      ? { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, scopes: GOOGLE_SCOPES }
      : undefined;
    return capture(input, fileManager, llmClient, googleConfig);
  });

  ipcMain.handle('keel:daily-brief', async () => {
    const result = await dailyBrief(fileManager, llmClient, {
      teamFileManager: teamFileManager || undefined,
    });
    // Update pulse.md async
    const today = new Date().toISOString().split('T')[0];
    setSelfWriting();
    fileManager.writeFile('pulse.md', `# Pulse\nLast updated: ${today} (morning brief)\n\n## Active Focus\n- See today's priorities in morning brief\n\n## Recent Activity\n- Daily brief generated ${today}\n`).catch(() => {});
    return result;
  });

  ipcMain.handle('keel:eod', async (_event, chatHistory: Message[]) => {
    const result = await eod(fileManager, llmClient, chatHistory, {
      teamFileManager: teamFileManager || undefined,
      userName: settings.userName || undefined,
    });
    // Update pulse.md async
    const today = new Date().toISOString().split('T')[0];
    setSelfWriting();
    fileManager.writeFile('pulse.md', `# Pulse\nLast updated: ${today} (EOD)\n\n## Active Focus\n- See tomorrow's priorities in EOD summary\n\n## Recent Activity\n- EOD completed ${today}\n`).catch(() => {});
    return result;
  });

  ipcMain.handle('keel:export-pdf', async (_event, markdownContent: string, title?: string) => {
    return exportToPdf(markdownContent, title);
  });

  ipcMain.handle('keel:save-chat', async (_event, sessionId: string, messages: Message[]) => {
    saveChatSession(settings.brainPath, sessionId, messages);
  });

  ipcMain.handle('keel:load-chat', async (_event, sessionId: string) => {
    return loadChatSession(settings.brainPath, sessionId);
  });

  ipcMain.handle('keel:get-latest-session', async () => {
    return getLatestSessionId(settings.brainPath);
  });

  ipcMain.handle('keel:list-sessions', async () => {
    const sessions = listChatSessions(settings.brainPath, 50);
    return sessions.map((s) => {
      let title = 'New Chat';
      try {
        const msgs = JSON.parse(
          (getDb(settings.brainPath)
            .prepare('SELECT messages FROM chat_sessions WHERE id = ?')
            .get(s.id) as any)?.messages || '[]'
        );
        const firstUser = msgs.find((m: any) => m.role === 'user');
        if (firstUser) title = firstUser.content.slice(0, 60);
      } catch {}
      return { id: s.id, title, updatedAt: s.updatedAt };
    });
  });

  // --- Folder Picker ---

  ipcMain.handle('keel:pick-folder', async (_event, defaultPath?: string) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose Brain Folder',
      defaultPath: defaultPath || undefined,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('keel:open-utility-window', async (_event, kind: UtilityWindowKind, query?: Record<string, string>) => {
    createUtilityWindow(kind, query);
  });

  ipcMain.handle('keel:close-window', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window && window !== mainWindow) {
      window.close();
    }
  });

  ipcMain.handle('keel:pick-wiki-files', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose Source File',
      properties: ['openFile'],
      filters: [
        { name: 'Supported Source Files', extensions: ['md', 'markdown', 'txt', 'pdf', 'docx', 'pptx'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) return [];

    return result.filePaths.map((filePath) => ({
      name: path.basename(filePath),
      path: filePath,
    }));
  });

  ipcMain.handle('keel:create-wiki-base', async (_event, title: string, description?: string) => {
    const result = await createWikiBase(title, fileManager, { description });
    logActivity(settings.brainPath, 'wiki-base-create', `${result.title} -> ${result.basePath}`);
    return result;
  });

  // --- Knowledge Browser file operations ---

  ipcMain.handle('keel:wiki-ingest-source', async (_event, basePath: string, input: WikiSourceInput) => {
    if (basePath.includes('..') || basePath.startsWith('.config')) {
      throw new Error('Access denied');
    }

    const result = await ingestWikiSource(basePath, input, fileManager);
    logActivity(settings.brainPath, 'wiki-ingest', `${result.title} -> ${result.pagePath}`);
    return result;
  });

  ipcMain.handle('keel:start-wiki-compile', async (_event, basePath: string) => {
    if (basePath.includes('..') || basePath.startsWith('.config')) {
      throw new Error('Access denied');
    }

    const job = createWikiJob('compile', basePath, 'Preparing source packages for compile.');

    void (async () => {
      updateWikiJob(job.id, { status: 'running', detail: 'Compiling wiki pages and synthesis outputs.' });
      try {
        const result = await compileWikiBase(basePath, fileManager, llmClient);
        updateWikiJob(job.id, {
          status: 'completed',
          detail: result.message,
          finishedAt: Date.now(),
          outputPath: result.synthesisPath,
        });
        logActivity(settings.brainPath, 'wiki-compile', `${basePath} -> ${result.synthesisPath}`);
      } catch (error) {
        updateWikiJob(job.id, {
          status: 'failed',
          detail: 'Compile failed.',
          finishedAt: Date.now(),
          error: error instanceof Error ? error.message : 'Unknown compile error',
        });
      }
    })();

    return job;
  });

  ipcMain.handle('keel:start-wiki-health-check', async (_event, basePath: string) => {
    if (basePath.includes('..') || basePath.startsWith('.config')) {
      throw new Error('Access denied');
    }

    const job = createWikiJob('health', basePath, 'Inspecting wiki coverage and provenance.');

    void (async () => {
      updateWikiJob(job.id, { status: 'running', detail: 'Running health checks across sources, concepts, and outputs.' });
      try {
        const result = await runWikiHealthCheck(basePath, fileManager);
        updateWikiJob(job.id, {
          status: 'completed',
          detail: result.message,
          finishedAt: Date.now(),
          outputPath: result.reportPath,
        });
        logActivity(settings.brainPath, 'wiki-health', `${basePath} -> ${result.reportPath}`);
      } catch (error) {
        updateWikiJob(job.id, {
          status: 'failed',
          detail: 'Health check failed.',
          finishedAt: Date.now(),
          error: error instanceof Error ? error.message : 'Unknown health check error',
        });
      }
    })();

    return job;
  });

  ipcMain.handle('keel:list-wiki-jobs', async (_event, basePath?: string) => {
    if (basePath && (basePath.includes('..') || basePath.startsWith('.config'))) {
      throw new Error('Access denied');
    }

    return listWikiJobsForBase(basePath);
  });

  ipcMain.handle('keel:list-files', async (_event, dirPath: string) => {
    // Security: reject paths that escape brain directory
    if (dirPath.includes('..') || dirPath.startsWith('.config')) {
      throw new Error('Access denied');
    }
    const fullPath = path.join(settings.brainPath, dirPath);
    try {
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      return entries
        .filter((e) => !e.name.startsWith('.'))
        .map((e) => {
          const filePath = path.join(fullPath, e.name);
          const stat = fs.statSync(filePath);
          return {
            name: e.name,
            path: dirPath ? `${dirPath}/${e.name}` : e.name,
            isDirectory: e.isDirectory(),
            updatedAt: stat.mtimeMs,
          };
        })
        .sort((a, b) => {
          // Directories first, then alphabetical
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
    } catch {
      return [];
    }
  });

  ipcMain.handle('keel:read-file', async (_event, filePath: string) => {
    if (filePath.includes('..') || filePath.startsWith('.config')) {
      throw new Error('Access denied');
    }
    const fullPath = path.join(settings.brainPath, filePath);
    return fs.readFileSync(fullPath, 'utf-8');
  });

  ipcMain.handle('keel:write-file', async (_event, filePath: string, content: string) => {
    if (filePath.includes('..') || filePath.startsWith('.config')) {
      throw new Error('Access denied');
    }
    const fullPath = path.join(settings.brainPath, filePath);
    fs.writeFileSync(fullPath, content, 'utf-8');
  });

  // --- Team Brain file operations ---

  ipcMain.handle('keel:list-team-files', async (_event, dirPath: string) => {
    if (!teamFileManager) return [];
    if (dirPath.includes('..') || dirPath.startsWith('.config')) {
      throw new Error('Access denied');
    }
    const fullPath = path.join(settings.teamBrainPath, dirPath);
    try {
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      return entries
        .filter((e) => !e.name.startsWith('.'))
        .map((e) => {
          const filePath = path.join(fullPath, e.name);
          const stat = fs.statSync(filePath);
          return {
            name: e.name,
            path: dirPath ? `${dirPath}/${e.name}` : e.name,
            isDirectory: e.isDirectory(),
            updatedAt: stat.mtimeMs,
          };
        })
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
    } catch {
      return [];
    }
  });

  ipcMain.handle('keel:read-team-file', async (_event, filePath: string) => {
    if (!teamFileManager) throw new Error('Team brain not configured');
    if (filePath.includes('..') || filePath.startsWith('.config')) {
      throw new Error('Access denied');
    }
    return teamFileManager.readFile(filePath);
  });

  ipcMain.handle('keel:write-team-file', async (_event, filePath: string, content: string) => {
    if (!teamFileManager) throw new Error('Team brain not configured');
    if (filePath.includes('..') || filePath.startsWith('.config')) {
      throw new Error('Access denied');
    }
    await teamFileManager.writeFile(filePath, content);
  });

  // --- Reminders ---

  ipcMain.handle('keel:create-reminder', async (_event, message: string, dueAt: number, recurring?: string) => {
    const id = createReminder(settings.brainPath, message, dueAt, recurring);
    logActivity(settings.brainPath, 'reminder-created', message);
    return id;
  });

  ipcMain.handle('keel:list-reminders', async () => {
    return listUpcomingReminders(settings.brainPath);
  });

  ipcMain.handle('keel:delete-reminder', async (_event, id: number) => {
    deleteReminder(settings.brainPath, id);
  });

  // --- Google Integration ---

  function getGoogleConfig(): GoogleOAuthConfig {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      throw new Error('Google integration is not available yet. Google OAuth credentials have not been bundled with this build.');
    }
    return {
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      scopes: GOOGLE_SCOPES,
    };
  }

  ipcMain.handle('keel:google-connect', async () => {
    const config = getGoogleConfig();
    const tokens = await startOAuthFlow(config, BrowserWindow);
    saveTokens(settings.brainPath, tokens);
    logActivity(settings.brainPath, 'google-connect', 'Connected to Google');
  });

  ipcMain.handle('keel:google-disconnect', async () => {
    disconnectGoogle(settings.brainPath);
    logActivity(settings.brainPath, 'google-disconnect', 'Disconnected from Google');
  });

  ipcMain.handle('keel:google-status', async () => {
    return {
      connected: isGoogleConnected(settings.brainPath),
      configured: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
    };
  });

  ipcMain.handle('keel:google-sync-calendar', async () => {
    const config = getGoogleConfig();
    return syncCalendar(fileManager, settings.brainPath, config);
  });

  ipcMain.handle('keel:google-export-doc', async (_event, markdownContent: string, title?: string) => {
    const config = getGoogleConfig();
    return exportToGoogleDoc(settings.brainPath, config, markdownContent, title);
  });

  ipcMain.handle('keel:google-create-event', async (_event, eventData: {
    summary: string;
    startTime: string;
    endTime: string;
    description?: string;
    attendees?: string[];
  }) => {
    const config = getGoogleConfig();
    return createCalendarEvent(settings.brainPath, config, {
      ...eventData,
      timeZone: settings.timezone || undefined,
    });
  });

  ipcMain.handle('keel:openai-list-models', async () => {
    if (!settings.openaiApiKey) {
      return { models: [], error: 'OpenAI API key not configured.' };
    }

    try {
      const client = new OpenAI({
        apiKey: settings.openaiApiKey,
        fetch: getElectronAwareFetch(),
      });
      const page = await client.models.list();
      const models: string[] = [];

      for await (const model of page) {
        models.push(model.id);
      }

      return {
        models: filterOpenAIChatModels(models),
        error: null,
      };
    } catch (err) {
      console.error('[openai-list-models] SDK fetch failed:', err);

      try {
        const response = await getElectronAwareFetch()('https://api.openai.com/v1/models', {
          headers: {
            Authorization: `Bearer ${settings.openaiApiKey}`,
          },
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`HTTP ${response.status}: ${body.slice(0, 240)}`);
        }

        const data = await response.json() as { data?: Array<{ id: string }> };
        const modelIds = (data.data || []).map((model) => model.id);
        return {
          models: filterOpenAIChatModels(modelIds),
          error: null,
        };
      } catch (fallbackErr) {
        console.error('[openai-list-models] HTTP fallback failed:', fallbackErr);
        return {
          models: [],
          error: fallbackErr instanceof Error ? fallbackErr.message : 'Could not fetch OpenAI models',
        };
      }
    }
  });

  ipcMain.handle('keel:ollama-list-models', async () => {
    try {
      const { Ollama } = await import('ollama');
      const ollama = new Ollama();
      const response = await ollama.list();
      const models = response.models.map((m: any) => ({
        name: m.name,
        size: m.size,
        parameterSize: m.details?.parameter_size || '',
        quantizationLevel: m.details?.quantization_level || '',
        family: m.details?.family || '',
      }));
      return { models, error: null };
    } catch (err) {
      return {
        models: [],
        error: err instanceof Error ? err.message : 'Could not connect to Ollama',
      };
    }
  });

  // --- Cloud Migration ---
  ipcMain.handle('keel:migrate-to-cloud', async (_event, serverUrl: string, accessToken: string) => {
    const { migrateToCloud } = await import('./migrate-to-cloud.js');
    return migrateToCloud(settings.brainPath, serverUrl, accessToken, (progress) => {
      mainWindow?.webContents.send('keel:migration-progress', progress);
    });
  });

  ipcMain.handle('keel:export-local-data', async () => {
    const { exportLocalData } = await import('./migrate-to-cloud.js');
    return exportLocalData(settings.brainPath, (progress) => {
      mainWindow?.webContents.send('keel:migration-progress', progress);
    });
  });
}

// --- Scheduler for Timed Briefs/EOD ---

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let lastTriggered: { brief?: string; eod?: string } = {};

function getCurrentHHMM(): string {
  const now = new Date();
  const tz = settings.timezone || undefined;
  const h = parseInt(now.toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: tz }));
  const m = parseInt(now.toLocaleString('en-US', { minute: '2-digit', timeZone: tz }));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getTodayKey(): string {
  const tz = settings.timezone || undefined;
  return new Date().toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD format
}

async function runScheduledBrief(): Promise<void> {
  try {
    const result = await dailyBrief(fileManager, llmClient, {
      teamFileManager: teamFileManager || undefined,
    });
    logActivity(settings.brainPath, 'scheduled-brief', 'Auto-triggered daily brief');

    if (Notification.isSupported()) {
      const notif = new Notification({
        title: 'Keel — Daily Brief',
        body: result.slice(0, 200).replace(/[#*_`]/g, ''),
      });
      notif.on('click', () => {
        mainWindow?.show();
        mainWindow?.focus();
      });
      notif.show();
    }

    // Send to renderer if window is open
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('keel:scheduled-notification', {
        type: 'daily-brief',
        content: result,
      });
    }
  } catch (error) {
    console.error('Scheduled brief failed:', error);
  }
}

async function runScheduledEod(): Promise<void> {
  try {
    const result = await eod(fileManager, llmClient, [], {
      teamFileManager: teamFileManager || undefined,
      userName: settings.userName || undefined,
    });
    logActivity(settings.brainPath, 'scheduled-eod', 'Auto-triggered EOD summary');

    if (Notification.isSupported()) {
      const notif = new Notification({
        title: 'Keel — End of Day',
        body: result.slice(0, 200).replace(/[#*_`]/g, ''),
      });
      notif.on('click', () => {
        mainWindow?.show();
        mainWindow?.focus();
      });
      notif.show();
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('keel:scheduled-notification', {
        type: 'eod',
        content: result,
      });
    }
  } catch (error) {
    console.error('Scheduled EOD failed:', error);
  }
}

function checkDueReminders(): void {
  try {
    const due = getDueReminders(settings.brainPath);
    for (const reminder of due) {
      // Fire system notification
      if (Notification.isSupported()) {
        const notif = new Notification({
          title: 'Keel — Reminder',
          body: reminder.message,
        });
        notif.on('click', () => {
          mainWindow?.show();
          mainWindow?.focus();
        });
        notif.show();
      }

      // Send to renderer chat
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('keel:scheduled-notification', {
          type: 'reminder',
          content: `**Reminder:** ${reminder.message}`,
        });
      }

      markReminderFired(settings.brainPath, reminder.id);
      logActivity(settings.brainPath, 'reminder-fired', reminder.message);

      // Reschedule if recurring
      if (reminder.recurring) {
        rescheduleRecurring(settings.brainPath, reminder.id);
      }
    }
  } catch (error) {
    console.error('Reminder check failed:', error);
  }
}

function startScheduler(): void {
  if (schedulerInterval) clearInterval(schedulerInterval);

  // Check every 30 seconds
  schedulerInterval = setInterval(() => {
    const currentSettings = loadSettings();
    const now = getCurrentHHMM();
    const todayKey = getTodayKey();

    // Daily brief
    if (currentSettings.dailyBriefTime && now === currentSettings.dailyBriefTime) {
      if (lastTriggered.brief !== todayKey) {
        lastTriggered.brief = todayKey;
        runScheduledBrief();
      }
    }

    // EOD
    if (currentSettings.eodTime && now === currentSettings.eodTime) {
      if (lastTriggered.eod !== todayKey) {
        lastTriggered.eod = todayKey;
        runScheduledEod();
      }
    }

    // Check for due reminders
    checkDueReminders();
  }, 30_000);
}

// --- App Lifecycle ---

app.whenReady().then(async () => {
  // Ensure brain directory structure exists
  await fileManager.ensureDirectoryStructure();

  // Initialize SQLite
  getDb(settings.brainPath);

  createWindow();
  createTray();
  registerShortcuts();
  registerIpcHandlers();

  // Start file watcher
  startFileWatcher();

  // Initialize team brain if configured
  if (teamFileManager) {
    teamFileManager.ensureTeamStructure().then(() => {
      getDb(settings.teamBrainPath);
      contextAssembler.setTeamFileManager(teamFileManager);
      startTeamFileWatcher();
      teamStartupIndex();
    }).catch((err) => console.error('Team brain init failed:', err));
  }

  // Start scheduler for timed briefs/EOD
  startScheduler();

  // Run startup indexing in background
  startupIndex();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  closeDb();
});
