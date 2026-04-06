import { contextBridge, ipcRenderer } from 'electron';
import type { KeelAPI } from '../src/shared/types';

const api: KeelAPI = {
  chat: (messages) => ipcRenderer.invoke('keel:chat', messages),

  chatStream: (messages, requestId) => ipcRenderer.invoke('keel:chat-stream', messages, requestId),

  onStreamChunk: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { requestId: string; chunk: string }) => callback(payload);
    ipcRenderer.on('keel:chat-stream-chunk', handler);
    return () => ipcRenderer.off('keel:chat-stream-chunk', handler);
  },

  onStreamDone: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { requestId: string }) => callback(payload);
    ipcRenderer.on('keel:chat-stream-done', handler);
    return () => ipcRenderer.off('keel:chat-stream-done', handler);
  },

  onStreamError: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { requestId: string; error: string }) => callback(payload);
    ipcRenderer.on('keel:chat-stream-error', handler);
    return () => ipcRenderer.off('keel:chat-stream-error', handler);
  },

  onThinkingStep: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { requestId: string; step: string }) => callback(payload);
    ipcRenderer.on('keel:thinking-step', handler);
    return () => ipcRenderer.off('keel:thinking-step', handler);
  },

  onThinkingDelta: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { requestId: string; text: string }) => callback(payload);
    ipcRenderer.on('keel:thinking-delta', handler);
    return () => ipcRenderer.off('keel:thinking-delta', handler);
  },

  getSettings: () => ipcRenderer.invoke('keel:get-settings'),

  saveSettings: (settings) => ipcRenderer.invoke('keel:save-settings', settings),

  ensureBrain: () => ipcRenderer.invoke('keel:ensure-brain'),

  capture: (input) => ipcRenderer.invoke('keel:capture', input),

  dailyBrief: () => ipcRenderer.invoke('keel:daily-brief'),

  eod: (chatHistory) => ipcRenderer.invoke('keel:eod', chatHistory),

  exportPdf: (markdownContent, title) => ipcRenderer.invoke('keel:export-pdf', markdownContent, title),

  resetProfile: () => ipcRenderer.invoke('keel:reset-profile'),

  saveChat: (sessionId, messages) => ipcRenderer.invoke('keel:save-chat', sessionId, messages),

  loadChat: (sessionId) => ipcRenderer.invoke('keel:load-chat', sessionId),

  getLatestSession: () => ipcRenderer.invoke('keel:get-latest-session'),

  listSessions: () => ipcRenderer.invoke('keel:list-sessions'),

  pickFolder: (defaultPath?: string) => ipcRenderer.invoke('keel:pick-folder', defaultPath),
  pickWikiFiles: () => ipcRenderer.invoke('keel:pick-wiki-files'),
  createWikiBase: (title, description) => ipcRenderer.invoke('keel:create-wiki-base', title, description),
  openUtilityWindow: (kind, query) => ipcRenderer.invoke('keel:open-utility-window', kind, query),
  closeWindow: () => ipcRenderer.invoke('keel:close-window'),

  listFiles: (dirPath: string) => ipcRenderer.invoke('keel:list-files', dirPath),

  readFile: (filePath: string) => ipcRenderer.invoke('keel:read-file', filePath),

  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('keel:write-file', filePath, content),
  ingestWikiSource: (basePath, input) => ipcRenderer.invoke('keel:wiki-ingest-source', basePath, input),
  startWikiCompile: (basePath) => ipcRenderer.invoke('keel:start-wiki-compile', basePath),
  startWikiHealthCheck: (basePath) => ipcRenderer.invoke('keel:start-wiki-health-check', basePath),
  listWikiJobs: (basePath) => ipcRenderer.invoke('keel:list-wiki-jobs', basePath),

  onScheduledNotification: (callback) => {
    ipcRenderer.on('keel:scheduled-notification', (_event, notification) => callback(notification));
  },

  removeScheduledNotificationListener: () => {
    ipcRenderer.removeAllListeners('keel:scheduled-notification');
  },

  createReminder: (message: string, dueAt: number, recurring?: string) =>
    ipcRenderer.invoke('keel:create-reminder', message, dueAt, recurring),

  listReminders: () => ipcRenderer.invoke('keel:list-reminders'),

  deleteReminder: (id: number) => ipcRenderer.invoke('keel:delete-reminder', id),

  googleConnect: () => ipcRenderer.invoke('keel:google-connect'),

  googleDisconnect: () => ipcRenderer.invoke('keel:google-disconnect'),

  googleStatus: () => ipcRenderer.invoke('keel:google-status'),

  googleSyncCalendar: () => ipcRenderer.invoke('keel:google-sync-calendar'),

  googleExportDoc: (markdownContent: string, title?: string) => ipcRenderer.invoke('keel:google-export-doc', markdownContent, title),
  googleCreateEvent: (event) => ipcRenderer.invoke('keel:google-create-event', event),
  openaiListModels: () => ipcRenderer.invoke('keel:openai-list-models'),
  ollamaListModels: () => ipcRenderer.invoke('keel:ollama-list-models'),
  listTeamFiles: (dirPath: string) => ipcRenderer.invoke('keel:list-team-files', dirPath),
  readTeamFile: (filePath: string) => ipcRenderer.invoke('keel:read-team-file', filePath),
  writeTeamFile: (filePath: string, content: string) => ipcRenderer.invoke('keel:write-team-file', filePath, content),
};

contextBridge.exposeInMainWorld('keel', api);

// Desktop-only migration API
contextBridge.exposeInMainWorld('keelMigrate', {
  migrateToCloud: (serverUrl: string, accessToken: string) =>
    ipcRenderer.invoke('keel:migrate-to-cloud', serverUrl, accessToken),
  exportLocalData: () =>
    ipcRenderer.invoke('keel:export-local-data'),
  onMigrationProgress: (callback: (progress: { step: string; current: number; total: number }) => void) => {
    ipcRenderer.on('keel:migration-progress', (_event, progress) => callback(progress));
  },
  removeMigrationListeners: () => {
    ipcRenderer.removeAllListeners('keel:migration-progress');
  },
});
