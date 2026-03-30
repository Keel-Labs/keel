import {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  Tray,
  Menu,
  nativeImage,
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
} from '../src/core/db';
import { capture } from '../src/core/workflows/capture';
import { dailyBrief } from '../src/core/workflows/dailyBrief';
import { eod } from '../src/core/workflows/eod';
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
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

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

async function indexFile(filePath: string): Promise<void> {
  try {
    const chunks = await embedFile(fileManager, filePath);
    if (chunks.length > 0) {
      await upsertChunks(settings.brainPath, chunks);
      updateFileIndex(settings.brainPath, filePath, chunks.length);
    }
  } catch (error) {
    // Embedding service might not be available — that's ok
    console.error(`Failed to index ${filePath}:`, error);
  }
}

function handleFileChange(fullPath: string): void {
  // Convert to relative path within brain/
  const relativePath = path.relative(settings.brainPath, fullPath);
  if (!relativePath.endsWith('.md')) return;
  // Skip hidden/config files
  if (relativePath.startsWith('.')) return;

  // Debounce: wait 2 seconds after last change
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

// --- IPC Handlers ---

function registerIpcHandlers() {
  ipcMain.handle('keel:ensure-brain', async () => {
    await fileManager.ensureDirectoryStructure();
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
      await llmClient.chatStream(messages, systemPrompt, (chunk: string) => {
        if (!sender.isDestroyed()) {
          sender.send('keel:chat-stream-chunk', chunk);
        }
      });
      if (!sender.isDestroyed()) {
        sender.send('keel:chat-stream-done');
      }
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
