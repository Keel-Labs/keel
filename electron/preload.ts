import { contextBridge, ipcRenderer } from 'electron';
import type { KeelAPI } from '../src/shared/types';

const api: KeelAPI = {
  chat: (messages) => ipcRenderer.invoke('keel:chat', messages),

  chatStream: (messages) => ipcRenderer.invoke('keel:chat-stream', messages),

  onStreamChunk: (callback) => {
    ipcRenderer.on('keel:chat-stream-chunk', (_event, chunk) => callback(chunk));
  },

  onStreamDone: (callback) => {
    ipcRenderer.on('keel:chat-stream-done', () => callback());
  },

  onStreamError: (callback) => {
    ipcRenderer.on('keel:chat-stream-error', (_event, error) => callback(error));
  },

  onThinkingStep: (callback: (step: string) => void) => {
    ipcRenderer.on('keel:thinking-step', (_event, step) => callback(step));
  },

  onThinkingDelta: (callback: (text: string) => void) => {
    ipcRenderer.on('keel:thinking-delta', (_event, text) => callback(text));
  },

  removeStreamListeners: () => {
    ipcRenderer.removeAllListeners('keel:chat-stream-chunk');
    ipcRenderer.removeAllListeners('keel:chat-stream-done');
    ipcRenderer.removeAllListeners('keel:chat-stream-error');
    ipcRenderer.removeAllListeners('keel:thinking-step');
    ipcRenderer.removeAllListeners('keel:thinking-delta');
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

  listFiles: (dirPath: string) => ipcRenderer.invoke('keel:list-files', dirPath),

  readFile: (filePath: string) => ipcRenderer.invoke('keel:read-file', filePath),

  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('keel:write-file', filePath, content),

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
