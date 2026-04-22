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
import OpenAI, { toFile } from 'openai';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
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
  listIncomingTasksDb,
  deleteIncomingTask,
  getRecentActivity,
  recordXPublishFailure as recordXPublishFailureHistory,
  recordXPublishSuccess as recordXPublishSuccessHistory,
  listScheduledJobs,
  upsertScheduledJob,
  deleteScheduledJob,
  markScheduledJobRan,
  getSyncState,
  upsertSyncState,
  type ScheduledJobRow,
} from '../src/core/db';
import { listAllTasks, toggleTask, moveTask, acceptIncomingTask, appendTask, createProject, renameProject, deleteProject } from '../src/core/tasks';
import { capture } from '../src/core/workflows/capture';
import { synthesizeMeeting, formatMeetingNote, formatDailyLogEntry } from '../src/core/workflows/meetingTranscription';
import { autoCapture } from '../src/core/workflows/autoCapture';
import { dailyBrief } from '../src/core/workflows/dailyBrief';
import { eod } from '../src/core/workflows/eod';
import { extractAndSaveMemory } from '../src/core/workflows/memoryExtract';
import { extractFileSource, ingestWikiSource } from '../src/core/workflows/wikiIngest';
import { createWikiBase } from '../src/core/workflows/wikiBase';
import { compileWikiBase, runWikiHealthCheck } from '../src/core/workflows/wikiMaintenance';
import { listWikiBaseSummaries } from '../src/core/wikiBaseSummaries';
import { assembleWikiChatContext } from '../src/core/wikiChatContext';
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
import {
  startXOAuthFlow,
  saveXTokens,
  getXStatus,
  disconnectX,
  getValidXAccessToken,
  recordXPublishError,
  recordXPublishSuccess,
  setXSyncing,
  recordXSyncError,
  type XOAuthConfig,
} from '../src/core/connectors/xAuth';
import { X_CLIENT_ID, X_CONFIG } from '../src/core/connectors/xConfig';
import { syncXBookmarksToWiki } from '../src/core/connectors/xBookmarks';
import { publishXPost } from '../src/core/connectors/xPublish';
import type {
  ChatDocumentAttachment,
  ChatRequest,
  Message,
  Settings,
  StoredChatSession,
  UtilityWindowKind,
  WikiJob,
  WikiSourceInput,
  XAccountProfile,
  XPublishRequest,
  XPublishResult,
} from '../src/shared/types';
import type { NewsItem, WeatherInfo } from '../src/shared/types';

const AI_NEWS_FEEDS = [
  { url: 'https://techcrunch.com/category/artificial-intelligence/feed/', source: 'TechCrunch' },
  { url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', source: 'The Verge' },
];

let weatherCache: { data: WeatherInfo; fetchedAt: number } | null = null;
const WEATHER_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

async function fetchWeather(): Promise<WeatherInfo | null> {
  if (weatherCache && Date.now() - weatherCache.fetchedAt < WEATHER_CACHE_TTL) {
    return weatherCache.data;
  }

  try {
    const res = await fetch('https://wttr.in/?format=j1', {
      headers: { 'User-Agent': 'Keel/1.0' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();

    const current = data.current_condition?.[0];
    const area = data.nearest_area?.[0];
    if (!current) return null;

    const tempF = current.temp_F;
    const tempC = current.temp_C;
    const condition = current.weatherDesc?.[0]?.value || '';
    const city = area?.areaName?.[0]?.value || '';

    // Map weather codes to simple emoji-like text icons
    const code = parseInt(current.weatherCode, 10);
    let icon = '☀';
    if (code === 113) icon = '☀';
    else if (code === 116) icon = '⛅';
    else if (code === 119 || code === 122) icon = '☁';
    else if ([176, 263, 266, 293, 296, 299, 302, 305, 308, 311, 314, 353, 356, 359].includes(code)) icon = '🌧';
    else if ([200, 386, 389, 392, 395].includes(code)) icon = '⛈';
    else if ([179, 182, 185, 227, 230, 317, 320, 323, 326, 329, 332, 335, 338, 350, 362, 365, 368, 371, 374, 377].includes(code)) icon = '❄';
    else if ([143, 248, 260].includes(code)) icon = '🌫';

    const info: WeatherInfo = {
      temp: `${tempF}°F / ${tempC}°C`,
      condition,
      icon,
      location: city,
    };

    weatherCache = { data: info, fetchedAt: Date.now() };
    return info;
  } catch {
    return null;
  }
}

let newsCache: { items: NewsItem[]; fetchedAt: number } | null = null;
const NEWS_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

async function fetchAiNewsRss(): Promise<NewsItem[]> {
  if (newsCache && Date.now() - newsCache.fetchedAt < NEWS_CACHE_TTL) {
    return newsCache.items;
  }

  const allItems: NewsItem[] = [];

  for (const feed of AI_NEWS_FEEDS) {
    try {
      const res = await fetch(feed.url, {
        headers: { 'User-Agent': 'Keel/1.0' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const xml = await res.text();

      // Simple RSS/Atom XML parsing — extract <item> or <entry> elements
      const itemRegex = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/g;
      let match;
      while ((match = itemRegex.exec(xml)) !== null) {
        const block = match[1];
        const title = block.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1]?.trim();
        const link = block.match(/<link[^>]*href="([^"]+)"/)?.[1]
          || block.match(/<link[^>]*>(.*?)<\/link>/)?.[1]?.trim();
        const pubDate = block.match(/<(?:pubDate|published|updated)>(.*?)<\/(?:pubDate|published|updated)>/)?.[1];

        if (title && link) {
          allItems.push({
            title: title
              .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
              .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&apos;/g, "'"),
            url: link,
            source: feed.source,
            publishedAt: pubDate ? new Date(pubDate).getTime() : Date.now(),
          });
        }
      }
    } catch {
      // Feed unavailable — skip
    }
  }

  // Sort by date descending, take top 8
  allItems.sort((a, b) => b.publishedAt - a.publishedAt);
  const items = allItems.slice(0, 8);

  newsCache = { items, fetchedAt: Date.now() };
  return items;
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const utilityWindows = new Map<UtilityWindowKind, BrowserWindow>();
const wikiJobs = new Map<string, WikiJob>();

const settings = loadSettings();
const fileManager = new FileManager(settings.brainPath);
const llmClient = new LLMClient();
const contextAssembler = new ContextAssembler(fileManager, false, settings.timezone || undefined, settings.personality || 'default');
// Team Brain is deprecated — always null until the feature is rebuilt
let teamFileManager: TeamFileManager | null = null;

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

function normalizeChatRequest(request: ChatRequest | Message[]): ChatRequest {
  if (Array.isArray(request)) {
    return { messages: request };
  }

  if (request && typeof request === 'object' && Array.isArray(request.messages)) {
    return request;
  }

  return { messages: [] };
}

function buildWikiCitationBlock(citations: string[]): string {
  if (citations.length === 0) return '';
  const lines = citations.map((citation) => `- [${citation}]`);
  return `\n\n**Wiki citations**\n${lines.join('\n')}`;
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
    width: 780,
    height: 720,
    minWidth: 680,
    minHeight: 620,
    title: 'Add Source',
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
  const tbPath = teamFileManager.getBrainPath();
  try {
    const fullPath = path.join(tbPath, filePath);
    const raw = fs.readFileSync(fullPath, 'utf-8');
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    const existing = getFileIndex(tbPath, filePath);
    if (existing && (existing as any).hash === hash) return;

    const chunks = await embedFile(teamFileManager, filePath);
    if (chunks.length > 0) {
      await upsertChunks(tbPath, chunks);
      updateFileIndex(tbPath, filePath, chunks.length, hash);
    }
  } catch (error) {
    console.error(`Failed to index team file ${filePath}:`, error);
  }
}

async function teamStartupIndex(): Promise<void> {
  if (!teamFileManager) return;
  const tbPath = teamFileManager.getBrainPath();
  try {
    const allMdFiles = await teamFileManager.listFiles('**/*.md');
    for (const file of allMdFiles) {
      const existing = getFileIndex(tbPath, file);
      if (!existing) {
        await teamIndexFile(file);
      } else {
        try {
          const fullPath = path.join(tbPath, file);
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
  if (!teamFileManager) return;
  const tbPath = teamFileManager.getBrainPath();
  const chokidar = await import('chokidar');
  const watcher = chokidar.watch(path.join(tbPath, '**/*.md'), {
    ignoreInitial: true,
    ignored: [/node_modules/, /\.config/],
  });

  watcher.on('add', (fullPath: string) => {
    const relativePath = path.relative(tbPath, fullPath);
    if (!relativePath.endsWith('.md') || relativePath.startsWith('.')) return;
    teamIndexFile(relativePath);
  });
  watcher.on('change', (fullPath: string) => {
    const relativePath = path.relative(tbPath, fullPath);
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
    saveSettingsToFile(newSettings);
    Object.assign(settings, newSettings);
    llmClient.reload();
    contextAssembler.setTimezone(newSettings.timezone || '');
    contextAssembler.setPersonality(newSettings.personality || 'default');
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

  ipcMain.handle('keel:chat', async (_event, request: ChatRequest | Message[]) => {
    const normalizedRequest = normalizeChatRequest(request);
    const enrichedMessages = await enrichMessages(normalizedRequest.messages);
    const lastMessage = enrichedMessages[enrichedMessages.length - 1]?.content;
    const retrievalQuery = normalizedRequest.messages[normalizedRequest.messages.length - 1]?.displayContent?.trim() || lastMessage;
    let systemPrompt = await contextAssembler.assembleContext(retrievalQuery, () => {});
    let wikiCitations: string[] = [];

    if (normalizedRequest.sessionMetadata?.wikiBasePath && retrievalQuery) {
      const wikiContext = await assembleWikiChatContext({
        fileManager,
        basePath: normalizedRequest.sessionMetadata.wikiBasePath,
        query: retrievalQuery,
        digDeep: !!normalizedRequest.sessionMetadata.digDeep,
      });
      if (wikiContext.context) {
        systemPrompt += `\n\n--- Selected Wiki Context ---\n\n${wikiContext.context}`;
        wikiCitations = wikiContext.citations;
      }
    }

    logActivity(settings.brainPath, 'chat', lastMessage?.slice(0, 200));
    const response = await llmClient.chat(enrichedMessages, systemPrompt);
    const citationBlock = buildWikiCitationBlock(wikiCitations);
    return citationBlock ? `${response}${citationBlock}` : response;
  });

  // Track active stream AbortControllers for cancellation
  const activeStreamControllers = new Map<string, AbortController>();

  ipcMain.handle('keel:cancel-stream', (_event, requestId: string) => {
    const controller = activeStreamControllers.get(requestId);
    if (controller) {
      controller.abort();
      activeStreamControllers.delete(requestId);
    }
  });

  ipcMain.handle('keel:chat-stream', async (event, request: ChatRequest | Message[], requestId: string) => {
    const sender = event.sender;
    const streamRequestId = requestId || `request-${Date.now()}`;
    const normalizedRequest = normalizeChatRequest(request);
    const abortController = new AbortController();
    activeStreamControllers.set(streamRequestId, abortController);
    const emitThinking = (step: string) => {
      if (!sender.isDestroyed()) {
        sender.send('keel:thinking-step', { requestId: streamRequestId, step });
      }
    };
    const enrichedMessages = await enrichMessages(normalizedRequest.messages, emitThinking);
    const lastMessage = enrichedMessages[enrichedMessages.length - 1]?.content;
    const retrievalQuery = normalizedRequest.messages[normalizedRequest.messages.length - 1]?.displayContent?.trim() || lastMessage;
    let systemPrompt = await contextAssembler.assembleContext(retrievalQuery, emitThinking);
    let wikiCitations: string[] = [];

    if (normalizedRequest.sessionMetadata?.wikiBasePath && retrievalQuery) {
      emitThinking('Searching selected wiki base');
      const wikiContext = await assembleWikiChatContext({
        fileManager,
        basePath: normalizedRequest.sessionMetadata.wikiBasePath,
        query: retrievalQuery,
        digDeep: !!normalizedRequest.sessionMetadata.digDeep,
      });
      if (wikiContext.context) {
        systemPrompt += `\n\n--- Selected Wiki Context ---\n\n${wikiContext.context}`;
        wikiCitations = wikiContext.citations;
      } else {
        emitThinking('Selected wiki base has no strong match');
      }
    }
    emitThinking('Generating answer');

    logActivity(settings.brainPath, 'chat', lastMessage?.slice(0, 200));

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

    try {
      await llmClient.chatStream(enrichedMessages, systemPrompt, (chunk: string) => {
        if (abortController.signal.aborted) return;
        fullResponse += chunk;
        buffer += chunk;
        // Flush immediately if buffer hits 100 chars, otherwise batch at 50ms
        if (buffer.length >= 100) {
          if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
          flush();
        } else if (!flushTimer) {
          flushTimer = setTimeout(flush, 50);
        }
      }, abortController.signal);

      const citationBlock = buildWikiCitationBlock(wikiCitations);
      if (citationBlock) {
        fullResponse += citationBlock;
        buffer += citationBlock;
      }

      // Final flush
      if (flushTimer) clearTimeout(flushTimer);
      flush();
      activeStreamControllers.delete(streamRequestId);

      if (!sender.isDestroyed()) {
        sender.send('keel:chat-stream-done', { requestId: streamRequestId });
      }

      // Extract and save memory in background (don't block the response)
      const allMessages = [...normalizedRequest.messages, { role: 'assistant' as const, content: fullResponse, timestamp: Date.now() }];
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
      activeStreamControllers.delete(streamRequestId);
      // If aborted, treat as a graceful stop — send done instead of error
      if (abortController.signal.aborted) {
        if (flushTimer) clearTimeout(flushTimer);
        flush();
        if (!sender.isDestroyed()) {
          sender.send('keel:chat-stream-done', { requestId: streamRequestId });
        }
        return;
      }
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

  // Synthesis-only path: transcript comes from the renderer (Web Speech API),
  // so no OpenAI key is needed — just use the configured LLM provider.
  ipcMain.handle('keel:synthesize-meeting', async (event, transcript: string) => {
    if (!transcript || !transcript.trim()) {
      return { ok: false, error: 'No transcript to synthesize.' };
    }

    const brainPath = fileManager.getBrainPath();

    try {
      event.sender.send('keel:meeting-progress', { step: 'Synthesizing notes…' });

      let synthesis;
      try {
        synthesis = await synthesizeMeeting(transcript.trim(), llmClient);
      } catch {
        synthesis = { title: 'Meeting', summary: '', decisions: [], actionItems: [] };
      }

      event.sender.send('keel:meeting-progress', { step: 'Saving to brain…' });

      const now = new Date();
      const date = now.toISOString().split('T')[0];
      const timeParts = now.toTimeString().split(':');
      const time = `${timeParts[0]}-${timeParts[1]}-${Math.floor(Number(timeParts[2] || '00')).toString().padStart(2, '0')}`;
      const meetingPath = `meetings/${date}/${time}.md`;
      const logPath = `daily-log/${date}.md`;

      const noteContent = formatMeetingNote(synthesis, transcript, date, time);
      await fileManager.writeFile(meetingPath, noteContent);

      const logEntry = formatDailyLogEntry(synthesis, meetingPath);
      if (await fileManager.fileExists(logPath)) {
        setSelfWriting();
        await fileManager.appendToFile(logPath, logEntry);
      } else {
        setSelfWriting();
        await fileManager.writeFile(logPath, `# Daily Log — ${date}\n${logEntry}`);
      }

      logActivity(brainPath, 'meeting-transcribe', synthesis.title);

      return {
        ok: true,
        title: synthesis.title,
        summary: synthesis.summary,
        actionItems: synthesis.actionItems,
        meetingPath,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to synthesize meeting notes.',
      };
    }
  });

  ipcMain.handle('keel:transcribe-meeting', async (event, audioBuffer: ArrayBuffer) => {
    if (!settings.openaiApiKey) {
      return {
        ok: false,
        error: 'Transcription requires an OpenAI API key. Add one in Settings → Model.',
      };
    }

    const brainPath = fileManager.getBrainPath();
    const tmpPath = path.join(os.tmpdir(), `keel-meeting-${Date.now()}.webm`);

    try {
      event.sender.send('keel:meeting-progress', { step: 'Transcribing audio…' });

      // Write audio buffer to temp file
      const buffer = Buffer.from(audioBuffer);
      fs.writeFileSync(tmpPath, buffer);

      // Call OpenAI Whisper
      const openaiClient = new OpenAI({
        apiKey: settings.openaiApiKey,
        fetch: getElectronAwareFetch(),
      });
      const transcription = await openaiClient.audio.transcriptions.create({
        file: await toFile(fs.createReadStream(tmpPath), 'recording.webm', { type: 'audio/webm' }),
        model: 'whisper-1',
      });
      const transcript = transcription.text.trim();

      event.sender.send('keel:meeting-progress', { step: 'Synthesizing notes…' });

      // Synthesize with LLM
      let synthesis;
      try {
        synthesis = await synthesizeMeeting(transcript, llmClient);
      } catch {
        synthesis = { title: 'Meeting', summary: '', decisions: [], actionItems: [] };
      }

      event.sender.send('keel:meeting-progress', { step: 'Saving to brain…' });

      // Determine file paths
      const now = new Date();
      const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const timeParts = now.toTimeString().split(':');
      const time = `${timeParts[0]}-${timeParts[1]}-${Math.floor(Number(timeParts[2] || '00')).toString().padStart(2, '0')}`;
      const meetingPath = `meetings/${date}/${time}.md`;
      const logPath = `daily-log/${date}.md`;

      // Save meeting note
      const noteContent = formatMeetingNote(synthesis, transcript, date, time);
      await fileManager.writeFile(meetingPath, noteContent);

      // Append to daily log
      const logEntry = formatDailyLogEntry(synthesis, meetingPath);
      if (await fileManager.fileExists(logPath)) {
        setSelfWriting();
        await fileManager.appendToFile(logPath, logEntry);
      } else {
        setSelfWriting();
        await fileManager.writeFile(logPath, `# Daily Log — ${date}\n${logEntry}`);
      }

      logActivity(brainPath, 'meeting-transcribe', synthesis.title);

      return {
        ok: true,
        title: synthesis.title,
        summary: synthesis.summary,
        actionItems: synthesis.actionItems,
        meetingPath,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Transcription failed',
      };
    } finally {
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    }
  });

  ipcMain.handle('keel:list-meetings', async () => {
    try {
      const files = await fileManager.listFiles('meetings/**/*.md');
      const meetings = [];
      for (const filePath of files.sort().reverse()) {
        // Extract date from path: meetings/YYYY-MM-DD/HH-MM-SS.md
        const match = filePath.match(/meetings\/(\d{4}-\d{2}-\d{2})\//);
        const date = match ? match[1] : '';
        let title = 'Meeting';
        try {
          const content = await fileManager.readFile(filePath);
          const h1 = content.match(/^#\s+(.+)$/m);
          if (h1) title = h1[1].trim();
        } catch { /* use default */ }
        meetings.push({ path: filePath, date, title });
      }
      return meetings;
    } catch {
      return [];
    }
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

  ipcMain.handle('keel:save-chat', async (_event, sessionId: string, session: StoredChatSession) => {
    saveChatSession(settings.brainPath, sessionId, session);
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
        const session = JSON.parse(
          (getDb(settings.brainPath)
            .prepare('SELECT messages FROM chat_sessions WHERE id = ?')
            .get(s.id) as any)?.messages || '[]'
        );
        const messages = Array.isArray(session) ? session : session.messages || [];

        // Prefer first user message as title
        const firstUser = messages.find((m: any) => m.role === 'user');
        const visibleContent = firstUser?.displayContent || firstUser?.content;
        if (visibleContent) {
          title = visibleContent.slice(0, 60);
        } else {
          // Fallback: extract first # heading from assistant message content
          // e.g. "# Keel App - Status Summary\n\n..." → "Keel App - Status Summary"
          const firstAssistant = messages.find((m: any) => m.role === 'assistant');
          const assistantContent = firstAssistant?.content || '';
          const headingMatch = assistantContent.match(/^#+ (.+)$/m);
          if (headingMatch) {
            title = headingMatch[1].trim().slice(0, 60);
          } else {
            // Last resort: first non-empty line of content
            const firstLine = assistantContent.split('\n').find((l: string) => l.trim());
            if (firstLine) title = firstLine.replace(/^[#*\s]+/, '').trim().slice(0, 60);
          }
        }
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

  ipcMain.handle('keel:pick-chat-documents', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose Document',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Supported Documents', extensions: ['md', 'markdown', 'txt', 'pdf', 'docx', 'pptx'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) return [];

    const documents: ChatDocumentAttachment[] = [];
    for (const filePath of result.filePaths) {
      const extracted = await extractFileSource(filePath, path.basename(filePath));
      documents.push({
        name: path.basename(filePath),
        mimeType: extracted.mimeType,
        content: extracted.normalizedContent,
        warning: extracted.warning,
      });
    }

    return documents;
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

  ipcMain.handle('keel:open-path', async (_event, filePath: string) => {
    const { shell } = await import('electron');

    // URLs → open in default browser
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      await shell.openExternal(filePath);
      return '';
    }

    if (filePath.includes('..') || filePath.startsWith('.config')) {
      throw new Error('Access denied');
    }

    const fullPath = path.join(settings.brainPath, filePath);

    // Try Obsidian first for markdown files
    if (fullPath.endsWith('.md')) {
      try {
        await shell.openExternal('obsidian://open?path=' + encodeURIComponent(fullPath));
        return '';
      } catch {
        // Obsidian not installed — fall through to system default
      }
    }

    return shell.openPath(fullPath);
  });

  // --- Knowledge Browser file operations ---

  ipcMain.handle('keel:wiki-ingest-source', async (_event, basePath: string, input: WikiSourceInput) => {
    if (basePath.includes('..') || basePath.startsWith('.config')) {
      throw new Error('Access denied');
    }

    const result = await ingestWikiSource(basePath, input, fileManager);
    logActivity(settings.brainPath, 'wiki-ingest', `${result.title} -> ${result.pagePath}`);

    // Auto-compile after successful ingest
    const job = createWikiJob('compile', basePath, 'Auto-compiling after new source.');
    void (async () => {
      updateWikiJob(job.id, { status: 'running', detail: 'Compiling wiki pages and synthesis outputs.' });
      try {
        const compileResult = await compileWikiBase(basePath, fileManager, llmClient);
        updateWikiJob(job.id, {
          status: 'completed',
          detail: compileResult.message,
          finishedAt: Date.now(),
          outputPath: compileResult.synthesisPath,
        });
        logActivity(settings.brainPath, 'wiki-compile', `${basePath} -> ${compileResult.synthesisPath}`);
      } catch (error) {
        updateWikiJob(job.id, {
          status: 'failed',
          detail: 'Auto-compile failed.',
          finishedAt: Date.now(),
          error: error instanceof Error ? error.message : 'Unknown compile error',
        });
      }
    })();

    return result;
  });

  ipcMain.handle('keel:delete-wiki-source', async (_event, basePath: string, sourceSlug: string) => {
    if (basePath.includes('..') || basePath.startsWith('.config') || sourceSlug.includes('..') || sourceSlug.includes('/')) {
      throw new Error('Access denied');
    }

    const wikiSourcePath = path.join(settings.brainPath, basePath, 'wiki', 'sources', `${sourceSlug}.md`);
    const rawSourceDir = path.join(settings.brainPath, basePath, 'raw', sourceSlug);

    // Delete the wiki source page
    if (fs.existsSync(wikiSourcePath)) {
      fs.unlinkSync(wikiSourcePath);
    }

    // Delete the raw source directory
    if (fs.existsSync(rawSourceDir)) {
      fs.rmSync(rawSourceDir, { recursive: true, force: true });
    }

    // Remove from file index
    const relSourcePath = `${basePath}/wiki/sources/${sourceSlug}.md`;
    removeFileIndex(settings.brainPath, relSourcePath);

    logActivity(settings.brainPath, 'wiki-delete-source', `${sourceSlug} from ${basePath}`);
    return { deleted: sourceSlug };
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

  ipcMain.handle('keel:list-wiki-bases', async () => {
    return listWikiBaseSummaries(settings.brainPath);
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
    const fullPath = path.join(teamFileManager!.getBrainPath(), dirPath);
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

  // --- Tasks ---

  ipcMain.handle('keel:list-tasks', async () => {
    return listAllTasks(fileManager);
  });

  ipcMain.handle('keel:toggle-task', async (_event, filePath: string, taskText: string, completed: boolean) => {
    await toggleTask(fileManager, filePath, taskText, completed);
    logActivity(settings.brainPath, 'task-toggled', `${completed ? 'Completed' : 'Reopened'}: ${taskText}`);
  });

  ipcMain.handle('keel:move-task', async (_event, sourceFilePath: string, targetFilePath: string, taskText: string, completed: boolean) => {
    await moveTask(fileManager, sourceFilePath, targetFilePath, taskText, completed);
    logActivity(settings.brainPath, 'task-moved', `Moved "${taskText}" from ${sourceFilePath} to ${targetFilePath}`);
  });

  ipcMain.handle('keel:create-task', async (_event, filePath: string, text: string) => {
    await appendTask(fileManager, filePath, text);
    logActivity(settings.brainPath, 'task-created', text);
  });

  ipcMain.handle('keel:list-incoming-tasks', async () => {
    return listIncomingTasksDb(settings.brainPath);
  });

  ipcMain.handle('keel:accept-incoming-task', async (_event, id: number) => {
    await acceptIncomingTask(fileManager, settings.brainPath, id);
    logActivity(settings.brainPath, 'task-accepted', `Accepted incoming task #${id}`);
  });

  ipcMain.handle('keel:dismiss-incoming-task', async (_event, id: number) => {
    deleteIncomingTask(settings.brainPath, id);
    logActivity(settings.brainPath, 'task-dismissed', `Dismissed incoming task #${id}`);
  });

  // --- Projects ---

  ipcMain.handle('keel:create-project', async (_event, name: string) => {
    const slug = await createProject(fileManager, name);
    logActivity(settings.brainPath, 'project-created', name);
    return slug;
  });

  ipcMain.handle('keel:rename-project', async (_event, oldSlug: string, newName: string) => {
    const newSlug = await renameProject(fileManager, oldSlug, newName);
    logActivity(settings.brainPath, 'project-renamed', `${oldSlug} → ${newName}`);
    return newSlug;
  });

  ipcMain.handle('keel:delete-project', async (_event, slug: string, moveTasks: boolean) => {
    await deleteProject(fileManager, slug, moveTasks);
    logActivity(settings.brainPath, 'project-deleted', slug);
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

  // --- Scheduled Jobs ---

  ipcMain.handle('keel:list-scheduled-jobs', async () => {
    return listScheduledJobs(settings.brainPath);
  });

  ipcMain.handle('keel:upsert-scheduled-job', async (_event, job) => {
    const id = upsertScheduledJob(settings.brainPath, job);
    logActivity(settings.brainPath, 'scheduled-job-saved', job.name);
    return id;
  });

  ipcMain.handle('keel:delete-scheduled-job', async (_event, id: number) => {
    deleteScheduledJob(settings.brainPath, id);
  });

  // --- Activity ---

  ipcMain.handle('keel:get-recent-activity', async (_event, limit?: number) => {
    return getRecentActivity(settings.brainPath, limit ?? 20);
  });

  ipcMain.handle('keel:fetch-weather', async () => {
    return fetchWeather();
  });

  ipcMain.handle('keel:fetch-ai-news', async () => {
    return fetchAiNewsRss();
  });

  ipcMain.handle('keel:get-daily-quote', async () => {
    const todayKey = getTodayKey();
    // Check cache first
    const cached = getSyncState(settings.brainPath, 'daily-quote');
    if (cached?.meta) {
      try {
        const parsed = JSON.parse(cached.meta) as { date: string; text: string; author: string };
        if (parsed.date === todayKey) return { text: parsed.text, author: parsed.author };
      } catch {}
    }
    // Generate a new one via LLM
    try {
      const raw = await llmClient.chat(
        [{ role: 'user', content: 'Generate one short, memorable quote — under 20 words — about focus, leadership, execution, or personal growth. It can be a real quote or original. Respond with ONLY valid JSON, no markdown: {"text": "...", "author": "..."}. If original, use an empty string for author.', timestamp: Date.now() }],
        'You are a quote generator. Output only valid JSON with no explanation or formatting.'
      );
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const quote = JSON.parse(match[0]) as { text: string; author: string };
        upsertSyncState(settings.brainPath, 'daily-quote', { meta: JSON.stringify({ date: todayKey, ...quote }) });
        return quote;
      }
    } catch (err) {
      console.error('Daily quote generation failed:', err);
    }
    // Fallback
    return { text: 'Make today count.', author: '' };
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

  function getXConfig(): XOAuthConfig {
    if (!X_CLIENT_ID.trim()) {
      throw new Error('X integration is not available yet. X OAuth credentials have not been bundled with this build.');
    }

    return X_CONFIG;
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

  // --- X Integration ---

  ipcMain.handle('keel:x-connect', async (): Promise<XAccountProfile> => {
    try {
      const config = getXConfig();
      const tokens = await startXOAuthFlow(config, BrowserWindow);
      saveXTokens(settings.brainPath, tokens);
      logActivity(settings.brainPath, 'x-connect', tokens.account?.username || 'Connected to X');
      return tokens.account as XAccountProfile;
    } catch (error) {
      recordXSyncError(settings.brainPath, error instanceof Error ? error.message : 'X connection failed.');
      throw error;
    }
  });

  ipcMain.handle('keel:x-disconnect', async () => {
    const config = X_CLIENT_ID.trim() ? getXConfig() : undefined;
    await disconnectX(settings.brainPath, config);
    logActivity(settings.brainPath, 'x-disconnect', 'Disconnected from X');
  });

  ipcMain.handle('keel:x-status', async () => {
    return getXStatus(settings.brainPath, X_CLIENT_ID);
  });

  ipcMain.handle('keel:x-sync-bookmarks', async () => {
    try {
      const config = getXConfig();
      setXSyncing(settings.brainPath);
      const accessToken = await getValidXAccessToken(settings.brainPath, config);
      const status = getXStatus(settings.brainPath, X_CLIENT_ID);
      if (!status.account?.id) {
        throw new Error('The connected X account could not be resolved. Disconnect and reconnect the account.');
      }

      const result = await syncXBookmarksToWiki(settings.brainPath, accessToken, status.account.id, fileManager);
      logActivity(settings.brainPath, 'x-sync-bookmarks', `${result.syncedCount} posts -> ${result.targetBasePath}`);
      return result;
    } catch (error) {
      recordXSyncError(settings.brainPath, error instanceof Error ? error.message : 'X bookmark sync failed.');
      throw error;
    }
  });

  ipcMain.handle('keel:x-publish-post', async (_event, request: XPublishRequest): Promise<XPublishResult> => {
    try {
      const config = getXConfig();
      const status = getXStatus(settings.brainPath, X_CLIENT_ID);
      if (!status.account) {
        throw new Error('Connect your X account before publishing.');
      }

      const accessToken = await getValidXAccessToken(settings.brainPath, config);
      const result = await publishXPost(accessToken, status.account, request);
      recordXPublishSuccessHistory(settings.brainPath, {
        externalPostId: result.id,
        text: result.text,
        url: result.url,
        publishedAt: result.publishedAt,
      });
      recordXPublishSuccess(settings.brainPath, result.url, result.publishedAt);
      logActivity(settings.brainPath, 'x-publish-post', result.url);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'X publish failed.';
      recordXPublishFailureHistory(settings.brainPath, {
        text: typeof request?.text === 'string' ? request.text : '',
        error: message,
      });
      recordXPublishError(settings.brainPath, message);
      throw error;
    }
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

// --- Scheduler ---

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

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

async function runScheduledJob(job: ScheduledJobRow): Promise<void> {
  try {
    // Build context from profile
    const contextParts: string[] = [];
    try {
      const keelMd = await fileManager.readFile('keel.md');
      if (keelMd.trim()) contextParts.push(`## About Me\n${keelMd}`);
    } catch {}

    // Try to include today's tasks
    try {
      const taskGroups = await listAllTasks(fileManager);
      const taskLines: string[] = [];
      for (const group of taskGroups) {
        const open = group.tasks.filter((t) => !t.completed);
        if (open.length > 0) {
          taskLines.push(`**${group.project}:** ${open.map((t) => t.text).join(', ')}`);
        }
      }
      if (taskLines.length > 0) {
        contextParts.push(`## Open Tasks\n${taskLines.join('\n')}`);
      }
    } catch {}

    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const systemPrompt = `Today is ${today}. You are a personal AI assistant helping with productivity and work management. Be concise and actionable. Do not add a title, heading, or label at the top of your response — begin directly with the content.`;
    const userMessage = contextParts.length > 0
      ? `${contextParts.join('\n\n')}\n\n---\n\n${job.prompt}`
      : job.prompt;

    const result = await llmClient.chat([{ role: 'user', content: userMessage, timestamp: Date.now() }], systemPrompt);

    // Append to daily log
    const dateStr = getTodayKey();
    try {
      await fileManager.appendToFile(
        `daily-log/${dateStr}.md`,
        `\n## ${job.name}\n\n${result.trim()}\n`,
      );
    } catch {}

    logActivity(settings.brainPath, 'scheduled-job', job.name);

    if (Notification.isSupported()) {
      const notif = new Notification({
        title: `Keel — ${job.name}`,
        body: result.slice(0, 200).replace(/[#*_`]/g, ''),
      });
      notif.on('click', () => { mainWindow?.show(); mainWindow?.focus(); });
      notif.show();
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('keel:scheduled-notification', {
        type: 'scheduled-job',
        jobName: job.name,
        content: result,
      });
    }
  } catch (error) {
    console.error(`Scheduled job "${job.name}" failed:`, error);
  }
}

function checkScheduledJobs(): void {
  try {
    const jobs = listScheduledJobs(settings.brainPath);
    const now = getCurrentHHMM();
    const todayKey = getTodayKey();
    const todayDow = new Date().getDay(); // 0=Sun..6=Sat

    for (const job of jobs) {
      if (!job.enabled) continue;
      if (job.time !== now) continue;
      if (job.lastRunDate === todayKey) continue;

      // For weekly jobs, check day of week
      if (job.scheduleType === 'weekly' && job.dayOfWeek !== null && job.dayOfWeek !== todayDow) continue;

      // For weekdays jobs, skip Sat (6) and Sun (0)
      if (job.scheduleType === 'weekdays' && (todayDow === 0 || todayDow === 6)) continue;

      // Mark ran first to prevent duplicate fires within same minute
      markScheduledJobRan(settings.brainPath, job.id, todayKey);
      runScheduledJob(job);
    }
  } catch (error) {
    console.error('Scheduled jobs check failed:', error);
  }
}

function startScheduler(): void {
  if (schedulerInterval) clearInterval(schedulerInterval);

  // Check every 30 seconds
  schedulerInterval = setInterval(() => {
    // Check for due reminders
    checkDueReminders();

    // Check custom scheduled jobs
    checkScheduledJobs();
  }, 30_000);
}

// --- App Lifecycle ---

app.setName('Keel');

app.whenReady().then(async () => {
  // Set dock icon in dev mode
  if (process.platform === 'darwin' && !app.isPackaged) {
    const iconPath = path.join(__dirname, '..', 'build', 'icon.icns');
    const dockIcon = nativeImage.createFromPath(iconPath);
    if (!dockIcon.isEmpty()) app.dock?.setIcon(dockIcon);
  }

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

  // Team Brain is deprecated — skipping init until feature is rebuilt

  // Start scheduler
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
