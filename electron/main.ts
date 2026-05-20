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
import { getToolsForContext } from '../src/core/tools/schemas';
import { toolsSystemAddendum } from '../src/core/tools/format';
import { makeToolExecutor, googleAvailable, xAvailable } from './toolExecutor';
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
import { startInboxWatcher, stopInboxWatcher } from './inboxWatcher';
import * as cloudAuth from '../src/core/cloud/cloudAuth';
import * as cloudTokenStore from '../src/core/cloud/tokenStore';
import * as cloudRefreshScheduler from '../src/core/cloud/refreshScheduler';
import { startCloudCaptureDrain, stopCloudCaptureDrain } from '../src/core/cloud/cloudCaptureDrain';
import { mirrorReminder } from '../src/core/cloud/cloudReminderMirror';
import { synthesizeMeeting, formatMeetingNote, formatDailyLogEntry } from '../src/core/workflows/meetingTranscription';
import { isWhisperAvailable, getWhisperBinary, downloadWhisperBinary, transcribeAudioBuffer } from './transcriptionService';
import { initLogger, logger, buildDiagnostics } from './logger';
import { describeLlmError } from '../src/core/llmErrors';
import { autoUpdater } from 'electron-updater';
import { isModelDownloaded, getAvailableModels, downloadModel } from './modelManager';
import { autoCapture } from '../src/core/workflows/autoCapture';
import { dailyBrief } from '../src/core/workflows/dailyBrief';
import { eod } from '../src/core/workflows/eod';
import { extractAndSaveMemory } from '../src/core/workflows/memoryExtract';
import { extractFileSource, ingestWikiSource } from '../src/core/workflows/wikiIngest';
import { createWikiBase } from '../src/core/workflows/wikiBase';
import { compileWikiBase, runWikiHealthCheck } from '../src/core/workflows/wikiMaintenance';
import {
  ensureProjectKB,
  refreshProjectKB,
  getProjectKBStatus,
  resolveProjectSlugByName,
  listProjectKBs,
  findProjectSlugByWikiBaseSlug,
  setProjectKBAutoRefresh,
  recordAutoRefreshError,
} from '../src/core/workflows/projectKnowledgeBase';
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
import { exportToGoogleDoc, isGoogleDocUrl, READ_EXISTING_DOC_UNSUPPORTED } from '../src/core/connectors/googleDocs';
import { checkExportMarkdown } from '../src/core/tools/exportGuard';
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
  ProjectKBEntry,
  Settings,
  StoredChatSession,
  UtilityWindowKind,
  WikiJob,
  WikiSourceInput,
  XAccountProfile,
  XPublishRequest,
  XPublishResult,
} from '../src/shared/types';
import type { NewsItem, WeatherInfo, UpdateState } from '../src/shared/types';

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

let updateState: UpdateState = {
  status: 'idle',
  version: null,
  downloadPercent: null,
  lastCheckedAt: null,
  error: null,
};
let updateCheckTimer: NodeJS.Timeout | null = null;
const UPDATE_RECHECK_MS = 4 * 60 * 60 * 1000;

function broadcastUpdateState() {
  mainWindow?.webContents.send('keel:update-state', updateState);
}

function setUpdateState(patch: Partial<UpdateState>) {
  updateState = { ...updateState, ...patch };
  broadcastUpdateState();
}

function setupAutoUpdater() {
  (autoUpdater as unknown as { logger: typeof logger }).logger = logger;
  // We manage notification + restart UI ourselves; don't auto-download
  // until we know the user wants it (keep default behavior: download
  // automatically, install on quit). Just disable the OS-level notification.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    setUpdateState({ status: 'checking', error: null });
  });
  autoUpdater.on('update-available', (info) => {
    setUpdateState({
      status: 'downloading',
      version: info?.version ?? null,
      downloadPercent: 0,
      lastCheckedAt: Date.now(),
    });
  });
  autoUpdater.on('update-not-available', () => {
    setUpdateState({
      status: 'not-available',
      lastCheckedAt: Date.now(),
      downloadPercent: null,
    });
  });
  autoUpdater.on('download-progress', (progress) => {
    setUpdateState({
      status: 'downloading',
      downloadPercent: typeof progress?.percent === 'number' ? Math.round(progress.percent) : null,
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    setUpdateState({
      status: 'downloaded',
      version: info?.version ?? updateState.version,
      downloadPercent: 100,
      lastCheckedAt: Date.now(),
    });
  });
  autoUpdater.on('error', (err) => {
    logger.error('autoUpdater error:', err);
    setUpdateState({
      status: 'error',
      error: err?.message || String(err),
      lastCheckedAt: Date.now(),
    });
  });

  const runCheck = () => {
    autoUpdater.checkForUpdates().catch((err) => {
      logger.error('autoUpdater check failed:', err);
      setUpdateState({ status: 'error', error: err?.message || String(err), lastCheckedAt: Date.now() });
    });
  };

  runCheck();
  updateCheckTimer = setInterval(runCheck, UPDATE_RECHECK_MS);
}
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
  } else if (process.platform === 'win32') {
    windowOptions.titleBarStyle = 'hidden';
    windowOptions.titleBarOverlay = {
      color: '#00000000',
      symbolColor: '#8a8178',
      height: 54,
    };
    windowOptions.autoHideMenuBar = true;
  } else {
    windowOptions.autoHideMenuBar = true;
  }

  mainWindow = new BrowserWindow(windowOptions);
  if (process.platform !== 'darwin') {
    mainWindow.setMenu(null);
    mainWindow.setMenuBarVisibility(false);
  }

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
  } else if (process.platform === 'win32') {
    windowOptions.titleBarStyle = 'hidden';
    windowOptions.titleBarOverlay = {
      color: '#00000000',
      symbolColor: '#8a8178',
      height: 54,
    };
    windowOptions.autoHideMenuBar = true;
  } else {
    windowOptions.autoHideMenuBar = true;
  }

  const utilityWindow = new BrowserWindow(windowOptions);
  if (process.platform !== 'darwin') {
    utilityWindow.setMenu(null);
    utilityWindow.setMenuBarVisibility(false);
  }
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
  const icon = process.platform === 'darwin'
    ? nativeImage.createEmpty()
    : nativeImage.createFromPath(
      app.isPackaged
        ? path.join(process.resourcesPath, 'build', 'icon.png')
        : path.join(__dirname, '../../build/icon.png')
    );
  tray = new Tray(icon);
  if (process.platform === 'darwin') {
    tray.setTitle('⚓');
  }
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

function configureApplicationMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
  }
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

function describeTranscriptionError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Transcription failed';
  if (/unable to get local issuer certificate|ERR_CERT|certificate|issuer/i.test(message)) {
    return 'Network certificate validation failed while contacting the transcription or AI provider. Download the local whisper model to transcribe offline, or install your organization root certificate in Windows Trusted Root Certification Authorities.';
  }
  return message;
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

// --- KB Auto-Refresh Watcher ---
//
// Watches every project folder that has a `.keel-kb.json` manifest. When files
// in the source folder change, debounces and then runs the same refresh +
// compile pipeline that `/refresh-kb` uses. Skips when a manual compile or
// health job is already in flight for that base, and surfaces failures to the
// activity feed and the wiki job stream (no notifications, to avoid spam).

const KB_AUTO_REFRESH_DEBOUNCE_MS = 30_000;
const KB_AUTO_REFRESH_BUSY_RETRY_MS = 15_000;
const SUPPORTED_KB_EXTS = new Set(['.md', '.markdown', '.txt', '.pdf', '.docx', '.pptx']);
const kbRefreshTimers = new Map<string, NodeJS.Timeout>();
const kbRefreshInFlight = new Set<string>();

function isBusyForKB(basePath: string): boolean {
  for (const job of wikiJobs.values()) {
    if (job.basePath !== basePath) continue;
    if (job.status === 'queued' || job.status === 'running') return true;
  }
  return false;
}

function scheduleKBAutoRefresh(projectSlug: string, delayMs: number = KB_AUTO_REFRESH_DEBOUNCE_MS): void {
  const existing = kbRefreshTimers.get(projectSlug);
  if (existing) clearTimeout(existing);
  kbRefreshTimers.set(
    projectSlug,
    setTimeout(() => {
      kbRefreshTimers.delete(projectSlug);
      void runKBAutoRefresh(projectSlug);
    }, delayMs)
  );
}

async function runKBAutoRefresh(projectSlug: string): Promise<void> {
  if (kbRefreshInFlight.has(projectSlug)) return;

  // Re-read the manifest each time — toggle state and target slug may have changed.
  let entry: ProjectKBEntry | undefined;
  try {
    const all = await listProjectKBs(fileManager);
    entry = all.find((e) => e.projectSlug === projectSlug);
  } catch (error) {
    console.error('KB auto-refresh: failed to read manifests', error);
    return;
  }
  if (!entry) return;
  if (!entry.autoRefreshEnabled) return;

  if (isBusyForKB(entry.basePath)) {
    // A manual compile/health job is in flight; back off and try again later.
    scheduleKBAutoRefresh(projectSlug, KB_AUTO_REFRESH_BUSY_RETRY_MS);
    return;
  }

  kbRefreshInFlight.add(projectSlug);
  const job = createWikiJob('compile', entry.basePath, 'Auto-refresh: scanning project folder for changes.');
  updateWikiJob(job.id, { status: 'running', detail: 'Auto-refresh: re-ingesting changed sources.' });

  try {
    const refresh = await refreshProjectKB(projectSlug, fileManager);

    if (refresh.added === 0) {
      updateWikiJob(job.id, {
        status: 'completed',
        detail: `Auto-refresh: no changes detected (${refresh.skipped} unchanged).`,
        finishedAt: Date.now(),
      });
      await recordAutoRefreshError(projectSlug, null, fileManager);
      logActivity(settings.brainPath, 'project-kb-auto-refresh', `${projectSlug} no-op (~${refresh.skipped})`);
      return;
    }

    updateWikiJob(job.id, { detail: 'Auto-refresh: compiling wiki pages and synthesis outputs.' });
    const compileResult = await compileWikiBase(entry.basePath, fileManager, llmClient);
    updateWikiJob(job.id, {
      status: 'completed',
      detail: `Auto-refresh: +${refresh.added} ~${refresh.skipped}. ${compileResult.message}`,
      finishedAt: Date.now(),
      outputPath: compileResult.synthesisPath,
    });
    await recordAutoRefreshError(projectSlug, null, fileManager);
    logActivity(
      settings.brainPath,
      'project-kb-auto-refresh',
      `${projectSlug} +${refresh.added} ~${refresh.skipped}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown auto-refresh error';
    updateWikiJob(job.id, {
      status: 'failed',
      detail: 'Auto-refresh failed.',
      finishedAt: Date.now(),
      error: message,
    });
    try {
      await recordAutoRefreshError(projectSlug, message, fileManager);
    } catch {
      // best-effort
    }
    logActivity(settings.brainPath, 'project-kb-auto-refresh-failed', `${projectSlug}: ${message}`);
  } finally {
    kbRefreshInFlight.delete(projectSlug);
  }
}

async function startKBAutoRefreshWatcher(): Promise<void> {
  const chokidar = await import('chokidar');
  const projectsRoot = path.join(settings.brainPath, 'projects');

  // Watch every file inside every project folder. We filter inside the handler
  // because (a) chokidar globs over many extensions are awkward to express
  // safely on different platforms, and (b) we need to look up the manifest for
  // the matched project anyway.
  const watcher = chokidar.watch(projectsRoot, {
    ignoreInitial: true,
    ignored: [/(^|[/\\])\../, /node_modules/], // dotfiles + node_modules
    depth: 99,
  });

  const handle = (fullPath: string) => {
    if (selfWriting) return;
    const rel = path.relative(projectsRoot, fullPath);
    if (!rel || rel.startsWith('..')) return;

    const segments = rel.split(path.sep);
    if (segments.length < 2) return; // only react to files inside a project, not project dir itself
    const projectSlug = segments[0];

    // Ignore the manifest itself and other dotfiles.
    const fileName = segments[segments.length - 1];
    if (fileName === '.keel-kb.json' || fileName.startsWith('.')) return;

    const ext = path.extname(fileName).toLowerCase();
    if (!SUPPORTED_KB_EXTS.has(ext)) return;

    // Cheap existence check up front so we don't churn the watcher for projects
    // without a KB. The full toggle/manifest check happens when the timer fires.
    const manifestPath = path.join(projectsRoot, projectSlug, '.keel-kb.json');
    if (!fs.existsSync(manifestPath)) return;

    scheduleKBAutoRefresh(projectSlug);
  };

  watcher.on('add', handle);
  watcher.on('change', handle);
  watcher.on('unlink', handle);
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

  ipcMain.handle('keel:get-app-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('keel:update-get-state', () => updateState);

  ipcMain.handle('keel:update-check', () => {
    if (!app.isPackaged) {
      setUpdateState({ status: 'disabled' });
      return;
    }
    setUpdateState({ status: 'checking', error: null });
    autoUpdater.checkForUpdates().catch((err) => {
      logger.error('manual update check failed:', err);
      setUpdateState({ status: 'error', error: err?.message || String(err), lastCheckedAt: Date.now() });
    });
  });

  ipcMain.handle('keel:update-restart', () => {
    if (updateState.status === 'downloaded') {
      autoUpdater.quitAndInstall();
    }
  });

  // Dev-only: let the renderer push fake update states for UI testing.
  // Gated so this never ships in packaged builds.
  if (!app.isPackaged) {
    ipcMain.handle('keel:update-debug-set-state', (_event, patch: Partial<UpdateState>) => {
      setUpdateState(patch);
      return updateState;
    });
  }

  ipcMain.handle('keel:get-diagnostics', () => {
    return buildDiagnostics();
  });

  ipcMain.handle('keel:log-renderer-error', (_event, payload: { message?: string; stack?: string; componentStack?: string }) => {
    const { message, stack, componentStack } = payload || {};
    logger.error('renderer error:', message || '(no message)', stack || '', componentStack ? `\ncomponentStack:${componentStack}` : '');
  });

  ipcMain.handle('keel:save-settings', async (_event, newSettings: Settings) => {
    saveSettingsToFile(newSettings);
    Object.assign(settings, newSettings);
    llmClient.reload();
    contextAssembler.setTimezone(newSettings.timezone || '');
    contextAssembler.setPersonality(newSettings.personality || 'default');
  });

  ipcMain.handle('keel:relaunch', async () => {
    app.relaunch();
    app.quit();
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

    // 1. Detect Google Doc URLs in the user message and explain that reading
    // existing docs isn't supported under our current OAuth scope. We surface
    // one note per message regardless of how many doc URLs appear, so the
    // model has the context to respond helpfully without flooding the prompt.
    const docUrlPattern = /https?:\/\/docs\.google\.com\/document\/d\/[a-zA-Z0-9_-]+/;
    if (docUrlPattern.test(last.content)) {
      emitThinking('Skipping Google Doc fetch (unsupported scope)');
      appendParts.push(`\n\n[${READ_EXISTING_DOC_UNSUPPORTED}]`);
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
    // Expose tools the assistant can invoke. The set depends on which
    // integrations the user has connected — if Google isn't connected we
    // don't show export_to_google_doc, which kills that hallucination
    // class entirely.
    const toolsForChat = getToolsForContext({
      googleConnected: googleAvailable(settings.brainPath),
      xConnected: xAvailable(settings.brainPath),
    });
    systemPrompt += '\n' + toolsSystemAddendum(toolsForChat);

    const executeTool = makeToolExecutor({
      fileManager,
      llmClient,
      brainPath: settings.brainPath,
      timezone: settings.timezone || undefined,
      onCompileKb: (wikiBaseSlug) => compileProjectKbInBackground(wikiBaseSlug),
      exportPdf: (markdown, title) => exportToPdf(markdown, title),
    });

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
      await llmClient.chatWithTools(enrichedMessages, systemPrompt, {
        tools: toolsForChat,
        executeTool,
        signal: abortController.signal,
        onToolStart: (call) => {
          console.log(`[tool] start: ${call.name} input=${JSON.stringify(call.input).slice(0, 300)}`);
          emitThinking(`Calling ${call.name}`);
        },
        onToolEnd: (result) => {
          console.log(`[tool] end: ${result.name} isError=${result.isError} content=${String(result.content).slice(0, 300)}`);
          emitThinking(result.isError ? `${result.name} failed` : `${result.name} done`);
        },
        onChunk: (chunk: string) => {
          if (abortController.signal.aborted) return;
          fullResponse += chunk;
          buffer += chunk;
          if (buffer.length >= 100) {
            if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
            flush();
          } else if (!flushTimer) {
            flushTimer = setTimeout(flush, 50);
          }
        },
      });

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

      // Run memory extraction and auto-capture in parallel, then emit ONE
      // combined system-event so the renderer renders a single row instead of
      // two racing events.
      const allMessages = [...normalizedRequest.messages, { role: 'assistant' as const, content: fullResponse, timestamp: Date.now() }];
      const googleConfig = (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET)
        ? { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, scopes: GOOGLE_SCOPES }
        : undefined;

      Promise.allSettled([
        extractAndSaveMemory(allMessages, fileManager, llmClient),
        autoCapture(allMessages, fileManager, llmClient, googleConfig),
      ]).then(([memoryOutcome, captureOutcome]) => {
        setSelfWriting();
        if (sender.isDestroyed()) return;

        const parts: string[] = [];
        let memorySummary: string | null = null;

        if (captureOutcome.status === 'fulfilled') {
          const r = captureOutcome.value;
          if (r?.captured && r.summary) parts.push(r.summary);
        } else {
          console.error('[main] Auto-capture failed:', captureOutcome.reason);
        }
        if (memoryOutcome.status === 'fulfilled') {
          const r = memoryOutcome.value;
          if (r?.updated && r.summary) {
            parts.push(r.summary);
            memorySummary = r.summary;
          }
        } else {
          console.error('[main] Memory extraction failed:', memoryOutcome.reason);
        }

        // Combined system-event row in chat (auto-capture + memory in one).
        if (parts.length > 0) {
          sender.send('keel:auto-capture-done', {
            requestId: streamRequestId,
            summary: parts.join(' · '),
          });
        }

        // Keep emitting keel:memory-updated separately — Dashboard.tsx and
        // Inbox.tsx subscribe to it for view refresh, independent of the
        // chat's combined row.
        if (memorySummary) {
          sender.send('keel:memory-updated', {
            requestId: streamRequestId,
            summary: memorySummary,
          });
        }
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
      const message = describeLlmError(error, settings.provider as any);
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
        synthesis = { title: 'Meeting', summary: '', keyPoints: [], decisions: [], actionItems: [], myActionItems: [], othersActionItems: [] };
      }

      event.sender.send('keel:meeting-progress', { step: 'Saving to brain…' });

      const now = new Date();
      const date = now.toISOString().split('T')[0];
      const timeParts = now.toTimeString().split(':');
      const time = `${timeParts[0]}-${timeParts[1]}-${parseInt(timeParts[2] ?? '0', 10).toString().padStart(2, '0')}`;
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
        keyPoints: synthesis.keyPoints,
        decisions: synthesis.decisions,
        actionItems: synthesis.actionItems,
        myActionItems: synthesis.myActionItems,
        othersActionItems: synthesis.othersActionItems,
        meetingPath,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to synthesize meeting notes.',
      };
    }
  });

  // Check whether local whisper.cpp transcription is available
  ipcMain.handle('keel:check-whisper', async () => {
    return {
      binaryAvailable: isWhisperAvailable(),
      binaryPath: getWhisperBinary(),
      modelDownloaded: isModelDownloaded('base.en'),
      models: getAvailableModels(),
    };
  });

  // Download whisper.cpp itself when a packaged build is missing the binary.
  ipcMain.handle('keel:download-whisper-binary', async (event) => {
    try {
      await downloadWhisperBinary((percent) => {
        event.sender.send('keel:binary-download-progress', { percent });
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Download failed' };
    }
  });

  // Download a whisper model with progress events
  ipcMain.handle('keel:download-whisper-model', async (event, model = 'base.en') => {
    try {
      await downloadModel(model, (percent) => {
        event.sender.send('keel:model-download-progress', { percent });
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Download failed' };
    }
  });

  // Lightweight transcribe — returns raw text only. Used by the chat mic button.
  ipcMain.handle('keel:transcribe-audio', async (_event, audioBuffer: ArrayBuffer) => {
    // Reject empty / near-empty buffers up front so we never feed malformed
    // webm to ffmpeg (which dumps a multi-line stderr trace as the error).
    if (!audioBuffer || audioBuffer.byteLength < 4096) {
      return { ok: false, error: 'no_audio' };
    }
    try {
      if (isWhisperAvailable() && isModelDownloaded('base.en')) {
        const text = await transcribeAudioBuffer(audioBuffer, 'base.en', () => {});
        return { ok: true, text: (text || '').trim() };
      }
      if (settings.openaiApiKey) {
        const tmpPath = path.join(os.tmpdir(), `keel-voice-${Date.now()}.webm`);
        try {
          fs.writeFileSync(tmpPath, Buffer.from(audioBuffer));
          const openaiClient = new OpenAI({ apiKey: settings.openaiApiKey, baseURL: settings.openaiBaseUrl || undefined, fetch: getElectronAwareFetch() });
          const result = await openaiClient.audio.transcriptions.create({
            file: await toFile(fs.createReadStream(tmpPath), 'voice.webm', { type: 'audio/webm' }),
            model: 'whisper-1',
          });
          return { ok: true, text: (result.text || '').trim() };
        } finally {
          try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        }
      }
      return { ok: false, error: 'no_transcription_available' };
    } catch (error) {
      const message = describeTranscriptionError(error);
      // ffmpeg dumps its full stderr into the error message when it can't parse
      // the webm (e.g. empty/silent recording). Surface a clean error instead.
      if (/EBML header parsing failed|Invalid data found when processing input|matroska,webm/i.test(message)) {
        return { ok: false, error: 'no_audio' };
      }
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('keel:transcribe-meeting', async (event, audioBuffer: ArrayBuffer) => {
    const brainPath = fileManager.getBrainPath();
    let transcript = '';

    try {
      // ── Path A: local whisper.cpp (preferred, no API key needed) ──────────
      if (isWhisperAvailable() && isModelDownloaded('base.en')) {
        transcript = await transcribeAudioBuffer(audioBuffer, 'base.en', (step, pct) => {
          event.sender.send('keel:meeting-progress', { step });
          if (pct !== undefined) event.sender.send('keel:transcription-progress', { percent: pct });
        });

      // ── Path B: OpenAI Whisper API ────────────────────────────────────────
      } else if (settings.openaiApiKey) {
        event.sender.send('keel:meeting-progress', { step: 'Transcribing audio…' });
        const tmpPath = path.join(os.tmpdir(), `keel-meeting-${Date.now()}.webm`);
        try {
          fs.writeFileSync(tmpPath, Buffer.from(audioBuffer));
          const openaiClient = new OpenAI({ apiKey: settings.openaiApiKey, baseURL: settings.openaiBaseUrl || undefined, fetch: getElectronAwareFetch() });
          const result = await openaiClient.audio.transcriptions.create({
            file: await toFile(fs.createReadStream(tmpPath), 'recording.webm', { type: 'audio/webm' }),
            model: 'whisper-1',
          });
          transcript = result.text.trim();
        } finally {
          try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        }

      // ── No transcription available ────────────────────────────────────────
      } else {
        return {
          ok: false,
          error: 'no_transcription_available',
        };
      }

      if (!transcript) {
        return { ok: false, error: 'Transcription returned empty text.' };
      }

      // ── Synthesize ────────────────────────────────────────────────────────
      event.sender.send('keel:meeting-progress', { step: 'Synthesizing notes…' });
      let synthesis;
      try {
        synthesis = await synthesizeMeeting(transcript, llmClient);
      } catch {
        synthesis = { title: 'Meeting', summary: '', keyPoints: [], decisions: [], actionItems: [], myActionItems: [], othersActionItems: [] };
      }

      // ── Save ──────────────────────────────────────────────────────────────
      event.sender.send('keel:meeting-progress', { step: 'Saving to brain…' });
      const now = new Date();
      const date = now.toISOString().split('T')[0];
      const timeParts = now.toTimeString().split(':');
      const time = `${timeParts[0]}-${timeParts[1]}-${parseInt(timeParts[2] ?? '0', 10).toString().padStart(2, '0')}`;
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
        keyPoints: synthesis.keyPoints,
        decisions: synthesis.decisions,
        actionItems: synthesis.actionItems,
        myActionItems: synthesis.myActionItems,
        othersActionItems: synthesis.othersActionItems,
        meetingPath,
      };
    } catch (err) {
      return {
        ok: false,
        error: describeTranscriptionError(err),
      };
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

  ipcMain.handle('keel:scan-folder', async (_event, folderPath: string) => {
    const PARA_NAMES = new Set(['projects', 'areas', 'resources', 'archive']);
    const KEEL_FILES = new Set(['keel.md', 'tasks.md', '.keel']);
    try {
      const stat = await fs.promises.stat(folderPath).catch(() => null);
      if (!stat || !stat.isDirectory()) {
        return {
          exists: false,
          isEmpty: true,
          fileCount: 0,
          dirCount: 0,
          topLevel: [],
          hasParaDirs: false,
          hasKeelFiles: false,
        };
      }
      const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
      const topLevel = entries.map((e) => ({
        name: e.name,
        isDir: e.isDirectory(),
        isHidden: e.name.startsWith('.'),
      }));
      const visible = topLevel.filter((e) => !e.isHidden);
      const fileCount = visible.filter((e) => !e.isDir).length;
      const dirCount = visible.filter((e) => e.isDir).length;
      const lowerNames = new Set(visible.map((e) => e.name.toLowerCase()));
      const hasParaDirs = ['projects', 'areas', 'resources', 'archive'].every((n) =>
        lowerNames.has(n),
      );
      const hasKeelFiles = topLevel.some((e) => KEEL_FILES.has(e.name));
      // Sort dirs first, then alphabetical, cap displayed list at 50
      const sorted = topLevel
        .filter((e) => !e.isHidden)
        .sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
          return a.name.localeCompare(b.name);
        })
        .slice(0, 50);
      return {
        exists: true,
        isEmpty: visible.length === 0,
        fileCount,
        dirCount,
        topLevel: sorted,
        hasParaDirs,
        hasKeelFiles,
      };
    } catch (error) {
      return {
        exists: false,
        isEmpty: true,
        fileCount: 0,
        dirCount: 0,
        topLevel: [],
        hasParaDirs: false,
        hasKeelFiles: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('keel:pick-files', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose Documents',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Supported Documents', extensions: ['md', 'markdown', 'txt', 'pdf', 'docx', 'pptx'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return [];
    return result.filePaths;
  });

  ipcMain.handle('keel:onboarding-ingest', async (_event, input: {
    name: string;
    role: string;
    projects: Array<{ name: string; description: string; docRefs: string[] }>;
    people: string;
    context: string;
  }) => {
    const result = {
      projectsCreated: 0,
      docsFetched: 0,
      docsFailed: [] as Array<{ ref: string; error: string }>,
    };

    // Ensure brain dirs exist before any writes
    await fileManager.ensureDirectoryStructure();

    // 1. Write keel.md profile
    const lines: string[] = ['# About Me', ''];
    if (input.name) lines.push(`- **Name:** ${input.name}`);
    if (input.role) lines.push(`- **Role:** ${input.role}`);
    lines.push('');

    if (input.projects.length > 0) {
      lines.push('## Active Projects', '');
      for (const p of input.projects) {
        if (!p.name.trim()) continue;
        lines.push(`- **${p.name.trim()}**${p.description.trim() ? ` — ${p.description.trim()}` : ''}`);
      }
      lines.push('');
    }

    const peopleLines = input.people.split('\n').map((l) => l.trim()).filter(Boolean);
    if (peopleLines.length > 0) {
      lines.push('## Key People', '');
      for (const person of peopleLines) {
        lines.push(`- ${person}`);
      }
      lines.push('');
    }

    if (input.context.trim()) {
      lines.push('## Context', '', input.context.trim(), '');
    }

    lines.push('## Priorities', '');

    try {
      await fileManager.writeFile('keel.md', lines.join('\n'));
    } catch (err) {
      // Non-fatal — continue
    }

    // 2. Create each project + ingest doc refs
    const googleConfig = (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET)
      ? { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, scopes: GOOGLE_SCOPES }
      : null;
    const googleAvailable = googleConfig != null && isGoogleConnected(fileManager.getBrainPath());

    for (const project of input.projects) {
      const projectName = project.name.trim();
      if (!projectName) continue;
      try {
        const slug = await createProject(fileManager, projectName);
        result.projectsCreated++;

        const contextPath = `projects/${slug}/context.md`;
        const sections: string[] = [];

        // Re-read existing context.md created by createProject and replace placeholder
        const header = `# ${projectName}\n`;
        const descBlock = project.description.trim()
          ? `\n${project.description.trim()}\n`
          : '\nProject context and notes.\n';
        sections.push(header + descBlock);

        // Fetch each doc ref
        for (const rawRef of project.docRefs) {
          const ref = rawRef.trim();
          if (!ref) continue;

          try {
            // Google Doc URL? Reading pre-existing Docs is no longer
            // supported — Keel's OAuth scope (`drive.file`) only covers
            // files Keel itself creates. Fail this ref with a helpful
            // message and continue with the other refs.
            if (isGoogleDocUrl(ref)) {
              result.docsFailed.push({ ref, error: READ_EXISTING_DOC_UNSUPPORTED });
              continue;
            }

            // Local file path?
            if (ref.startsWith('/') || ref.startsWith('~')) {
              const expanded = ref.startsWith('~') ? path.join(os.homedir(), ref.slice(1)) : ref;
              const extracted = await extractFileSource(expanded, path.basename(expanded));
              const truncated = extracted.normalizedContent.slice(0, 50000);
              sections.push(`\n## Source: ${extracted.title}\n\n_Imported from: ${ref}_\n\n${truncated}\n`);
              result.docsFetched++;
              continue;
            }

            // Unknown ref type
            result.docsFailed.push({ ref, error: 'Unrecognized link. Use a Google Doc URL or local file path.' });
          } catch (err) {
            result.docsFailed.push({
              ref,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        await fileManager.writeFile(contextPath, sections.join(''));
      } catch (err) {
        // Skip this project on error, continue with rest
      }
    }

    return result;
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

  ipcMain.handle('keel:delete-wiki-base', async (_event, basePath: string) => {
    if (!basePath || basePath.includes('..') || basePath.startsWith('.config') || basePath.startsWith('/')) {
      throw new Error('Access denied');
    }
    if (!basePath.startsWith('knowledge-bases/')) {
      throw new Error('Only knowledge-bases/* paths can be deleted');
    }

    const fullPath = path.join(settings.brainPath, basePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error('Base not found');
    }

    const { shell } = await import('electron');
    // Send to system Trash so it's recoverable
    await shell.trashItem(fullPath);

    logActivity(settings.brainPath, 'wiki-base-delete', basePath);
    return { deleted: basePath };
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

  // --- Project Knowledge Base ---
  const resolveProjectSlugOrThrow = async (input: string): Promise<string> => {
    const slug = await resolveProjectSlugByName(input, fileManager);
    if (!slug) {
      throw new Error(`No project matched "${input}". Check the project name.`);
    }
    return slug;
  };

  const compileProjectKbInBackground = (wikiBaseSlug: string) => {
    const basePath = `knowledge-bases/${wikiBaseSlug}`;
    const job = createWikiJob('compile', basePath, 'Compiling project knowledge base.');
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
          detail: 'Project KB compile failed.',
          finishedAt: Date.now(),
          error: error instanceof Error ? error.message : 'Unknown compile error',
        });
      }
    })();
  };

  ipcMain.handle('keel:project-kb-status', async (_event, projectInput: string) => {
    const slug = await resolveProjectSlugOrThrow(projectInput);
    return getProjectKBStatus(slug, fileManager);
  });

  ipcMain.handle('keel:project-kb-create', async (_event, projectInput: string) => {
    let slug = await resolveProjectSlugByName(projectInput, fileManager);
    let projectCreated = false;
    if (!slug) {
      slug = await createProject(fileManager, projectInput);
      projectCreated = true;
      logActivity(settings.brainPath, 'project-created', projectInput);
    }
    const result = await ensureProjectKB(slug, fileManager);
    logActivity(settings.brainPath, 'project-kb-create', `${slug} -> knowledge-bases/${result.wikiBaseSlug}`);
    if (result.added > 0) compileProjectKbInBackground(result.wikiBaseSlug);
    return { ...result, projectSlug: slug, projectCreated };
  });

  ipcMain.handle('keel:project-kb-refresh', async (_event, projectInput: string) => {
    const slug = await resolveProjectSlugOrThrow(projectInput);
    const result = await refreshProjectKB(slug, fileManager);
    logActivity(settings.brainPath, 'project-kb-refresh', `${slug} +${result.added} ~${result.skipped}`);
    if (result.added > 0) compileProjectKbInBackground(result.wikiBaseSlug);
    return { ...result, projectSlug: slug };
  });

  ipcMain.handle('keel:list-project-kbs', async () => {
    return listProjectKBs(fileManager);
  });

  ipcMain.handle('keel:set-kb-auto-refresh', async (_event, basePath: string, enabled: boolean) => {
    if (!basePath || basePath.includes('..') || !basePath.startsWith('knowledge-bases/')) {
      throw new Error('Access denied');
    }
    const wikiBaseSlug = basePath.slice('knowledge-bases/'.length);
    const projectSlug = await findProjectSlugByWikiBaseSlug(wikiBaseSlug, fileManager);
    if (!projectSlug) {
      throw new Error('Auto-refresh is only available for project-backed knowledge bases.');
    }
    await setProjectKBAutoRefresh(projectSlug, enabled, fileManager);
    logActivity(
      settings.brainPath,
      'project-kb-auto-refresh-toggle',
      `${projectSlug} -> ${enabled ? 'on' : 'off'}`
    );
    return { projectSlug, enabled };
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

  ipcMain.handle('keel:delete-file', async (_event, filePath: string) => {
    if (!filePath || filePath.includes('..') || filePath.startsWith('.config')) {
      throw new Error('Access denied');
    }
    const fullPath = path.join(settings.brainPath, filePath);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(fullPath);
    }
  });

  ipcMain.handle('keel:rename-file', async (_event, oldPath: string, newName: string) => {
    if (!oldPath || oldPath.includes('..') || oldPath.startsWith('.config')) {
      throw new Error('Access denied');
    }
    if (!newName || newName.includes('/') || newName.includes('..') || newName.startsWith('.')) {
      throw new Error('Invalid name');
    }
    const fullOld = path.join(settings.brainPath, oldPath);
    const dir = path.dirname(oldPath);
    const newRelPath = dir === '.' ? newName : `${dir}/${newName}`;
    const fullNew = path.join(settings.brainPath, newRelPath);
    if (fs.existsSync(fullNew)) {
      throw new Error('A file with that name already exists');
    }
    fs.renameSync(fullOld, fullNew);
    return newRelPath;
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
    // Mirror to Keel Cloud so the cron worker can fire a push even
    // when this Mac is asleep. Failures are logged but don't undo
    // the local insert — local-only reminders remain a valid fallback.
    if (settings.cloudEnabled && cloudTokenStore.hasValidSession()) {
      void mirrorReminder({
        baseUrl: settings.cloudApiBase,
        message,
        dueAt,
      }).catch((err) => logger.error('[cloud] reminder mirror failed:', err));
    }
    return id;
  });

  ipcMain.handle('keel:list-reminders', async () => {
    return listUpcomingReminders(settings.brainPath);
  });

  // --- Keel Cloud ---

  ipcMain.handle('keel:cloud-status', async () => {
    return {
      enabled: settings.cloudEnabled,
      signedIn: cloudTokenStore.hasValidSession(),
      email: settings.cloudUserEmail || cloudAuth.currentEmail() || '',
      apiBase: settings.cloudApiBase,
    };
  });

  // New magic-link callback flow: a single IPC kicks off /auth/magic-link
  // and then polls /auth/poll in the main process until the user clicks
  // the email link. Status updates are pushed to the renderer via
  // `keel:cloud-signin-status` events so the UI stays a thin view.
  //
  // The polling lives here (not the renderer) so that:
  //   1. We can cancel cleanly on app quit (AbortController below).
  //   2. The encrypted session blob is written from main where
  //      safeStorage is available.
  ipcMain.handle('keel:cloud-start-signin', async (_event, email: string) => {
    // Cancel any in-flight sign-in before starting a new one. This
    // covers the "Use a different email" reset path.
    if (cloudSignInController) {
      cloudSignInController.abort();
      cloudSignInController = null;
    }

    const trimmed = (email ?? '').trim();
    if (!trimmed) throw new Error('Email is required');

    const baseUrl = settings.cloudApiBase;
    const nonce = await cloudAuth.startSignIn(baseUrl, trimmed);

    const controller = new AbortController();
    cloudSignInController = controller;

    // Notify the renderer that the email is on its way.
    broadcastSignInStatus({ status: 'sent-email', email: trimmed });

    // Detach the poll so the IPC call returns promptly. The renderer
    // listens for status events for the rest of the flow.
    void (async () => {
      try {
        const result = await cloudAuth.pollForSession(baseUrl, nonce, { signal: controller.signal });
        settings.cloudUserEmail = result.email || trimmed;
        settings.cloudEnabled = true;
        saveSettingsToFile(settings);
        maybeStartCloudDrain();
        // Kick off (or restart) the silent-refresh loop — the
        // scheduler is a no-op if already running for this session.
        cloudRefreshScheduler.stop();
        startCloudRefreshScheduler();
        broadcastSignInStatus({ status: 'signed-in', email: result.email || trimmed });
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') {
          broadcastSignInStatus({ status: 'cancelled' });
        } else {
          const message = err instanceof Error ? err.message : 'Sign-in failed';
          broadcastSignInStatus({ status: 'error', error: message });
        }
      } finally {
        if (cloudSignInController === controller) cloudSignInController = null;
      }
    })();

    return { ok: true };
  });

  ipcMain.handle('keel:cloud-cancel-signin', async () => {
    if (cloudSignInController) {
      cloudSignInController.abort();
      cloudSignInController = null;
    }
    return { ok: true };
  });

  ipcMain.handle('keel:cloud-sign-out', async () => {
    if (cloudSignInController) {
      cloudSignInController.abort();
      cloudSignInController = null;
    }
    cloudAuth.signOut();
    settings.cloudUserEmail = '';
    settings.cloudEnabled = false;
    saveSettingsToFile(settings);
    stopCloudCaptureDrain();
    cloudRefreshScheduler.stop();
    return { ok: true };
  });

  ipcMain.handle('keel:cloud-set-api-base', async (_event, apiBase: string) => {
    settings.cloudApiBase = apiBase.trim() || 'https://api.keel-labs.org';
    saveSettingsToFile(settings);
    // Bouncing the drain means the next tick uses the new URL.
    if (settings.cloudEnabled && cloudTokenStore.hasValidSession()) {
      stopCloudCaptureDrain();
      maybeStartCloudDrain();
    }
    return { apiBase: settings.cloudApiBase };
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
    // Renderer paths (export-only / write-and-export in Chat.tsx) come
    // through here, bypassing the LLM tool layer — so this is the only
    // chokepoint where the guard catches them.
    const guard = checkExportMarkdown(markdownContent ?? '');
    if (!guard.ok) {
      throw new Error(guard.reason || 'Refusing to export this content as a Google Doc.');
    }
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
        baseURL: settings.openaiBaseUrl || undefined,
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
          error: describeLlmError(fallbackErr, 'openai'),
        };
      }
    }
  });

  ipcMain.handle('keel:openrouter-list-models', async () => {
    const baseUrl = (settings.openrouterBaseUrl || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (settings.openrouterApiKey) {
        headers.Authorization = `Bearer ${settings.openrouterApiKey}`;
      }
      const response = await getElectronAwareFetch()(`${baseUrl}/models`, { headers });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 240)}`);
      }
      const data = await response.json() as { data?: Array<{ id: string; name?: string }> };
      const models = (data.data || [])
        .filter((m) => typeof m?.id === 'string' && m.id.length > 0)
        .map((m) => ({ id: m.id, name: m.name || m.id }));
      return { models, error: null };
    } catch (err) {
      console.error('[openrouter-list-models] fetch failed:', err);
      return {
        models: [],
        error: describeLlmError(err, 'openrouter'),
      };
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
        error: describeLlmError(err, 'ollama'),
      };
    }
  });

  ipcMain.handle('keel:test-llm-key', async (_event, provider: 'claude' | 'openai' | 'openrouter' | 'ollama', apiKey?: string) => {
    // A small, cheap call against the provider to confirm the key works and
    // the account has access. Called from onboarding before the user moves
    // past the API-key step, so we catch "missing credits" / "bad key" up
    // front instead of mid-chat.
    try {
      switch (provider) {
        case 'claude': {
          const key = apiKey || settings.anthropicApiKey;
          if (!key) return { ok: false, error: 'Enter an API key first.' };
          const response = await getElectronAwareFetch()('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': key,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: settings.claudeModel || 'claude-3-5-haiku-latest',
              max_tokens: 1,
              messages: [{ role: 'user', content: 'hi' }],
            }),
          });
          if (response.ok) return { ok: true };
          const body = await response.text();
          const err: any = new Error(body.slice(0, 240) || `HTTP ${response.status}`);
          err.status = response.status;
          return { ok: false, error: describeLlmError(err, 'claude') };
        }
        case 'openai': {
          const key = apiKey || settings.openaiApiKey;
          if (!key) return { ok: false, error: 'Enter an API key first.' };
          const response = await getElectronAwareFetch()('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${key}` },
          });
          if (response.ok) return { ok: true };
          const body = await response.text();
          const err: any = new Error(body.slice(0, 240) || `HTTP ${response.status}`);
          err.status = response.status;
          return { ok: false, error: describeLlmError(err, 'openai') };
        }
        case 'openrouter': {
          const key = apiKey || settings.openrouterApiKey;
          if (!key) return { ok: false, error: 'Enter an API key first.' };
          const baseUrl = (settings.openrouterBaseUrl || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
          const response = await getElectronAwareFetch()(`${baseUrl}/auth/key`, {
            headers: { Authorization: `Bearer ${key}` },
          });
          if (response.ok) return { ok: true };
          const body = await response.text();
          const err: any = new Error(body.slice(0, 240) || `HTTP ${response.status}`);
          err.status = response.status;
          return { ok: false, error: describeLlmError(err, 'openrouter') };
        }
        case 'ollama': {
          const { Ollama } = await import('ollama');
          const ollama = new Ollama();
          await ollama.list();
          return { ok: true };
        }
        default:
          return { ok: false, error: 'Unknown provider.' };
      }
    } catch (err) {
      return { ok: false, error: describeLlmError(err, provider) };
    }
  });

  ipcMain.handle('keel:report-bug', async (_event, context?: { title?: string; error?: string }) => {
    // Build a prefilled GitHub issue URL. GitHub rejects URLs over ~8KB
    // ("Whoa there! Your request URL is too long"), and url-encoding markdown
    // bloats by ~2-3x (newlines, backticks, colons all become %XX). So we
    // budget by the *encoded* length, not the raw body length, and trim the
    // log tail until the whole URL fits.
    const { shell } = await import('electron');

    const diagnostics = buildDiagnostics();
    const errorBlock = context?.error
      ? `\n### Error\n\n\`\`\`\n${context.error}\n\`\`\`\n`
      : '';
    const header = '<!-- Auto-generated from Keel desktop. Please describe what you were doing above this line. -->\n\n';
    const title = context?.title || 'Bug report from desktop app';

    const baseUrl = 'https://github.com/Keel-Labs/keel/issues/new';
    const titlePart = `title=${encodeURIComponent(title)}`;
    const labelsPart = `labels=${encodeURIComponent('bug,from-app')}`;
    // Reserve headroom for the base URL + title + labels + "?&&body=".
    const fixedOverhead = baseUrl.length + titlePart.length + labelsPart.length + 10;
    const MAX_URL = 7500;
    const bodyBudget = MAX_URL - fixedOverhead;

    const truncationNote = '\n\n_(Log tail truncated to fit URL — open Settings → Share feedback → Copy diagnostic info for the full version.)_\n';

    const compose = (diag: string) => `${header}### What happened?\n\n(describe)\n${errorBlock}\n${diag}\n`;

    let body = compose(diagnostics);
    let diag = diagnostics;
    // Shrink the diagnostics tail (which is by far the biggest contributor)
    // until the encoded body fits. We chop ~500 chars off the end per pass.
    while (encodeURIComponent(body).length > bodyBudget && diag.length > 200) {
      diag = diag.slice(0, Math.max(200, diag.length - 500));
      body = compose(diag + truncationNote);
    }
    // Final safety net if even minimal diagnostics overflow (e.g. enormous
    // error stack passed in): drop diagnostics entirely.
    if (encodeURIComponent(body).length > bodyBudget) {
      body = compose('_(Diagnostics omitted — URL too long. Use Settings → Copy diagnostic info instead.)_');
    }

    const url = `${baseUrl}?${titlePart}&body=${encodeURIComponent(body)}&${labelsPart}`;
    await shell.openExternal(url);
    return { ok: true };
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

/**
 * Starts the cloud capture drain loop if the user is opted in and has
 * a valid session. Idempotent — safe to call multiple times.
 */
// In-flight sign-in polling — cancelled on quit, sign-out, or
// before kicking off a new sign-in attempt. Lives in main so a
// renderer reload can't orphan a poll loop.
let cloudSignInController: AbortController | null = null;

type CloudSignInStatusEvent =
  | { status: 'sent-email'; email: string }
  | { status: 'signed-in'; email: string }
  | { status: 'cancelled' }
  | { status: 'error'; error: string };

function broadcastSignInStatus(payload: CloudSignInStatusEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('keel:cloud-signin-status', payload);
  }
}

function startCloudRefreshScheduler(): void {
  cloudRefreshScheduler.start({
    getBaseUrl: () => settings.cloudApiBase,
    onUnauthorized: () => {
      cloudAuth.signOut();
      settings.cloudEnabled = false;
      settings.cloudUserEmail = '';
      saveSettingsToFile(settings);
      stopCloudCaptureDrain();
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('keel:cloud-signed-out');
      }
    },
  });
}

function maybeStartCloudDrain(): void {
  if (!settings.cloudEnabled) return;
  if (!cloudTokenStore.hasValidSession()) {
    logger.info('[cloud] enabled in settings but no valid session — skipping drain');
    return;
  }
  startCloudCaptureDrain({
    fileManager,
    llmClient,
    brainPath: settings.brainPath,
    getBaseUrl: () => settings.cloudApiBase,
    onUnauthorized: () => {
      // Session expired or revoked — clear and tell the renderer
      // so the Cloud Settings panel reflects the signed-out state.
      cloudAuth.signOut();
      settings.cloudEnabled = false;
      settings.cloudUserEmail = '';
      saveSettingsToFile(settings);
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('keel:cloud-signed-out');
      }
    },
    onRouted: (event) => {
      // Pipe through the same toast/badge UI the file-sync watcher uses.
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('keel:mobile-capture-routed', {
            filename: '',
            kind: 'capture',
            device: event.device,
            routedTo: event.routedTo,
          });
        }
      }
    },
  });
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
initLogger();

app.whenReady().then(async () => {
  configureApplicationMenu();

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

  if (app.isPackaged) {
    setupAutoUpdater();
  } else {
    updateState = { ...updateState, status: 'disabled' };
  }

  // Start file watcher
  startFileWatcher();

  // Start KB auto-refresh watcher (per-project source folders)
  startKBAutoRefreshWatcher().catch((err) => {
    logger.error('KB auto-refresh watcher failed to start:', err);
  });

  // Keel Cloud capture drain — only when opted in AND signed in.
  maybeStartCloudDrain();

  // Silent refresh: if there's a session at boot, schedule the next
  // refresh so the access token stays valid without user action.
  if (cloudTokenStore.hasValidSession()) {
    startCloudRefreshScheduler();
  }

  // Mobile companion inbox watcher: <workspace>/inbox/incoming/ → routed via
  // capture()/ingestWikiSource(). Gated by the mobileInboxEnabled setting so
  // users who don't use a phone companion don't pay the watcher cost.
  if (settings.mobileInboxEnabled !== false) {
    const googleConfig = (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET)
      ? { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, scopes: GOOGLE_SCOPES }
      : undefined;
    startInboxWatcher({
      fileManager,
      llmClient,
      brainPath: settings.brainPath,
      googleConfig,
      onRouted: (event) => {
        // 1. Native macOS notification — only when the user can't
        //    already see the in-app toast. If a Keel window is
        //    currently focused, the toast is sufficient and a system
        //    notification on top of it is a double-signal.
        const aKeelWindowIsFocused = BrowserWindow.getFocusedWindow() !== null;
        if (Notification.isSupported() && !aKeelWindowIsFocused) {
          const title = `Captured from ${event.device}`;
          const body = event.routedTo || 'Routed by Keel.';
          try {
            const notif = new Notification({ title, body, silent: false });
            notif.on('click', () => {
              const win = BrowserWindow.getAllWindows()[0];
              if (win) {
                if (win.isMinimized()) win.restore();
                win.focus();
                win.webContents.send('keel:open-view', { view: 'inbox' });
              }
            });
            notif.show();
          } catch (err) {
            logger.error('[inbox] notification failed:', err);
          }
        }
        // 2. Renderer-side toast via IPC. The Inbox component listens
        //    for this and shows a transient terracotta banner.
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) {
            win.webContents.send('keel:mobile-capture-routed', event);
          }
        }
      },
    }).catch((err) => {
      logger.error('Mobile inbox watcher failed to start:', err);
    });
  }

  // Team Brain is deprecated — skipping init until feature is rebuilt

  // Seed the default "End-of-day brief" scheduled job on first launch.
  // Gated by settings.defaultEodScheduled so a user who deletes the job
  // doesn't have us re-create it next launch. Populates daily-log/<date>.md
  // each night at 10pm so the mobile app's "Today's brief" surface has
  // content by next morning.
  //
  // We also check the DB directly for an existing job with the same name —
  // settings.json and the SQLite DB live in different paths (the flag is in
  // KEEL_CONFIG_DIR, jobs are at brainPath/.config/keel.db), and they can
  // drift apart if a user resets settings while keeping their brain. Without
  // this check, every reset would append another duplicate row.
  const alreadySeeded =
    settings.defaultEodScheduled === true
    || listScheduledJobs(settings.brainPath).some((j) => j.name === 'End-of-day brief');
  if (!alreadySeeded) {
    try {
      upsertScheduledJob(settings.brainPath, {
        name: 'End-of-day brief',
        prompt:
          "It's the end of the day. Using the profile and open tasks above, write a brief end-of-day summary. " +
          "Use two short sections in markdown:\n\n" +
          "## Today\n" +
          "1-3 bullets reflecting what likely got attention today (infer from open vs closed task progress and any recent context). Be honest about what you don't know.\n\n" +
          "## Tomorrow\n" +
          "3-5 concrete priorities for tomorrow, drawn from the open tasks list. Order by what matters most. " +
          "Keep the whole response under 200 words. No preamble, no closing.",
        scheduleType: 'daily',
        time: '22:00',
        dayOfWeek: null,
        enabled: true,
        lastRunDate: null,
      });
      settings.defaultEodScheduled = true;
      saveSettingsToFile(settings);
      logger.info('[scheduler] seeded default End-of-day brief job');
    } catch (err) {
      logger.error('[scheduler] failed to seed default EOD job:', err);
    }
  }

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
  void stopInboxWatcher();
  // Cancel any in-flight sign-in poll and the refresh timer so we
  // don't leave dangling intervals during shutdown.
  if (cloudSignInController) {
    cloudSignInController.abort();
    cloudSignInController = null;
  }
  cloudRefreshScheduler.stop();
  closeDb();
});
