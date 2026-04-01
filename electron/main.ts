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
} from 'electron';
import * as path from 'path';
import * as fs from 'fs';
// chokidar v5 is ESM-only — loaded via dynamic import in startFileWatcher()
import { FileManager } from '../src/core/fileManager';
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
import { dailyBrief } from '../src/core/workflows/dailyBrief';
import { eod } from '../src/core/workflows/eod';
import { extractAndSaveMemory } from '../src/core/workflows/memoryExtract';
import {
  startOAuthFlow,
  saveTokens,
  isGoogleConnected,
  disconnectGoogle,
  type GoogleOAuthConfig,
} from '../src/core/connectors/googleAuth';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_SCOPES } from '../src/core/connectors/googleConfig';
import { syncCalendar } from '../src/core/connectors/googleCalendar';
import { exportToGoogleDoc } from '../src/core/connectors/googleDocs';
import type { Message, Settings } from '../src/shared/types';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const settings = loadSettings();
const fileManager = new FileManager(settings.brainPath);
const llmClient = new LLMClient();
const contextAssembler = new ContextAssembler(fileManager, false);

const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 900,
    minHeight: 700,
    title: 'Keel',
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }

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
    llmClient.reload();
  });

  ipcMain.handle('keel:chat', async (_event, messages: Message[]) => {
    const lastMessage = messages[messages.length - 1]?.content;
    const systemPrompt = await contextAssembler.assembleContext(lastMessage);
    logActivity(settings.brainPath, 'chat', lastMessage?.slice(0, 200));
    return llmClient.chat(messages, systemPrompt);
  });

  ipcMain.handle('keel:chat-stream', async (event, messages: Message[]) => {
    const lastMessage = messages[messages.length - 1]?.content;
    const systemPrompt = await contextAssembler.assembleContext(lastMessage);
    const sender = event.sender;

    logActivity(settings.brainPath, 'chat', lastMessage?.slice(0, 200));

    try {
      let fullResponse = '';
      let buffer = '';
      let flushTimer: ReturnType<typeof setTimeout> | null = null;

      const flush = () => {
        if (buffer && !sender.isDestroyed()) {
          sender.send('keel:chat-stream-chunk', buffer);
          buffer = '';
        }
        flushTimer = null;
      };

      await llmClient.chatStream(messages, systemPrompt, (chunk: string) => {
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
        sender.send('keel:chat-stream-done');
      }

      // Extract and save memory in background (don't block the response)
      const allMessages = [...messages, { role: 'assistant' as const, content: fullResponse, timestamp: Date.now() }];
      extractAndSaveMemory(allMessages, fileManager, llmClient).catch(() => {});
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (!sender.isDestroyed()) {
        sender.send('keel:chat-stream-error', message);
      }
    }
  });

  ipcMain.handle('keel:capture', async (_event, input: string) => {
    return capture(input, fileManager, llmClient);
  });

  ipcMain.handle('keel:daily-brief', async () => {
    return dailyBrief(fileManager, llmClient);
  });

  ipcMain.handle('keel:eod', async (_event, chatHistory: Message[]) => {
    return eod(fileManager, llmClient, chatHistory);
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

  // --- Knowledge Browser file operations ---

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
      throw new Error('Google integration is not configured. Set KEEL_GOOGLE_CLIENT_ID and KEEL_GOOGLE_CLIENT_SECRET environment variables.');
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
    return { connected: isGoogleConnected(settings.brainPath) };
  });

  ipcMain.handle('keel:google-sync-calendar', async () => {
    const config = getGoogleConfig();
    return syncCalendar(fileManager, settings.brainPath, config);
  });

  ipcMain.handle('keel:google-export-doc', async (_event, markdownContent: string, title?: string) => {
    const config = getGoogleConfig();
    return exportToGoogleDoc(settings.brainPath, config, markdownContent, title);
  });
}

// --- Scheduler for Timed Briefs/EOD ---

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let lastTriggered: { brief?: string; eod?: string } = {};

function getCurrentHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

async function runScheduledBrief(): Promise<void> {
  try {
    const result = await dailyBrief(fileManager, llmClient);
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
    const result = await eod(fileManager, llmClient, []);
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
