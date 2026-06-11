import { contextBridge, ipcRenderer } from 'electron';
import type { KeelAPI } from '../src/shared/types';

const api: KeelAPI = {
  chat: (request) => ipcRenderer.invoke('keel:chat', request),

  chatStream: (request, requestId) => ipcRenderer.invoke('keel:chat-stream', request, requestId),

  cancelStream: (requestId) => ipcRenderer.invoke('keel:cancel-stream', requestId),

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

  getAppVersion: () => ipcRenderer.invoke('keel:get-app-version'),

  getDiagnostics: () => ipcRenderer.invoke('keel:get-diagnostics'),

  logRendererError: (payload) => ipcRenderer.invoke('keel:log-renderer-error', payload),

  saveSettings: (settings) => ipcRenderer.invoke('keel:save-settings', settings),

  ensureBrain: () => ipcRenderer.invoke('keel:ensure-brain'),

  capture: (input) => ipcRenderer.invoke('keel:capture', input),

  dailyBrief: () => ipcRenderer.invoke('keel:daily-brief'),

  eod: (chatHistory) => ipcRenderer.invoke('keel:eod', chatHistory),

  seedModelOfYou: (answers) => ipcRenderer.invoke('keel:seed-model-of-you', answers),

  exportPdf: (markdownContent, title) => ipcRenderer.invoke('keel:export-pdf', markdownContent, title),

  resetProfile: () => ipcRenderer.invoke('keel:reset-profile'),

  saveChat: (sessionId, session) => ipcRenderer.invoke('keel:save-chat', sessionId, session),

  loadChat: (sessionId) => ipcRenderer.invoke('keel:load-chat', sessionId),

  getLatestSession: () => ipcRenderer.invoke('keel:get-latest-session'),

  listSessions: () => ipcRenderer.invoke('keel:list-sessions'),

  pickFolder: (defaultPath?: string) => ipcRenderer.invoke('keel:pick-folder', defaultPath),
  scanFolder: (folderPath: string) => ipcRenderer.invoke('keel:scan-folder', folderPath),
  onboardingIngest: (input) => ipcRenderer.invoke('keel:onboarding-ingest', input),
  pickFiles: () => ipcRenderer.invoke('keel:pick-files'),
  pickChatDocuments: () => ipcRenderer.invoke('keel:pick-chat-documents'),
  pickWikiFiles: () => ipcRenderer.invoke('keel:pick-wiki-files'),
  createWikiBase: (title, description) => ipcRenderer.invoke('keel:create-wiki-base', title, description),
  openPath: (filePath) => ipcRenderer.invoke('keel:open-path', filePath),
  openUtilityWindow: (kind, query) => ipcRenderer.invoke('keel:open-utility-window', kind, query),
  closeWindow: () => ipcRenderer.invoke('keel:close-window'),

  listFiles: (dirPath: string) => ipcRenderer.invoke('keel:list-files', dirPath),

  readFile: (filePath: string) => ipcRenderer.invoke('keel:read-file', filePath),

  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('keel:write-file', filePath, content),
  deleteFile: (filePath: string) => ipcRenderer.invoke('keel:delete-file', filePath),
  renameFile: (oldPath: string, newName: string) => ipcRenderer.invoke('keel:rename-file', oldPath, newName),
  ingestWikiSource: (basePath, input) => ipcRenderer.invoke('keel:wiki-ingest-source', basePath, input),
  deleteWikiSource: (basePath: string, sourceSlug: string) => ipcRenderer.invoke('keel:delete-wiki-source', basePath, sourceSlug),
  deleteWikiBase: (basePath: string) => ipcRenderer.invoke('keel:delete-wiki-base', basePath),
  relaunch: () => ipcRenderer.invoke('keel:relaunch'),
  startWikiCompile: (basePath) => ipcRenderer.invoke('keel:start-wiki-compile', basePath),
  startWikiHealthCheck: (basePath) => ipcRenderer.invoke('keel:start-wiki-health-check', basePath),
  listWikiJobs: (basePath) => ipcRenderer.invoke('keel:list-wiki-jobs', basePath),
  listWikiBases: () => ipcRenderer.invoke('keel:list-wiki-bases'),
  getProjectKbStatus: (projectSlug: string) => ipcRenderer.invoke('keel:project-kb-status', projectSlug),
  createProjectKb: (projectName: string) => ipcRenderer.invoke('keel:project-kb-create', projectName),
  refreshProjectKb: (projectName: string) => ipcRenderer.invoke('keel:project-kb-refresh', projectName),
  listProjectKbs: () => ipcRenderer.invoke('keel:list-project-kbs'),
  setKbAutoRefresh: (basePath, enabled) => ipcRenderer.invoke('keel:set-kb-auto-refresh', basePath, enabled),

  onScheduledNotification: (callback) => {
    ipcRenderer.on('keel:scheduled-notification', (_event, notification) => callback(notification));
  },

  removeScheduledNotificationListener: () => {
    ipcRenderer.removeAllListeners('keel:scheduled-notification');
  },

  onAutoCaptureDone: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { requestId: string; summary: string }) => callback(payload);
    ipcRenderer.on('keel:auto-capture-done', handler);
    return () => ipcRenderer.off('keel:auto-capture-done', handler);
  },

  onMemoryUpdated: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { requestId: string; summary: string }) => callback(payload);
    ipcRenderer.on('keel:memory-updated', handler);
    return () => ipcRenderer.off('keel:memory-updated', handler);
  },

  /**
   * Fires when the mobile-companion inbox watcher finishes routing a
   * capture. The renderer uses this to show a transient toast and
   * refresh the Inbox view's incoming-tasks count.
   */
  onMobileCaptureRouted: (callback: (event: { filename: string; kind: string; device: string; routedTo: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { filename: string; kind: string; device: string; routedTo: string }) => callback(payload);
    ipcRenderer.on('keel:mobile-capture-routed', handler);
    return () => ipcRenderer.off('keel:mobile-capture-routed', handler);
  },

  /**
   * Fired when the user clicks a mobile-capture notification — main
   * asks the renderer to navigate to the Inbox view.
   */
  onOpenView: (callback: (payload: { view: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { view: string }) => callback(payload);
    ipcRenderer.on('keel:open-view', handler);
    return () => ipcRenderer.off('keel:open-view', handler);
  },

  // Tasks
  listTasks: () => ipcRenderer.invoke('keel:list-tasks'),
  toggleTask: (filePath: string, taskText: string, completed: boolean) =>
    ipcRenderer.invoke('keel:toggle-task', filePath, taskText, completed),
  createTask: (filePath: string, text: string) =>
    ipcRenderer.invoke('keel:create-task', filePath, text),
  listIncomingTasks: () => ipcRenderer.invoke('keel:list-incoming-tasks'),
  acceptIncomingTask: (id: number) => ipcRenderer.invoke('keel:accept-incoming-task', id),
  dismissIncomingTask: (id: number) => ipcRenderer.invoke('keel:dismiss-incoming-task', id),
  moveTask: (sourceFilePath: string, targetFilePath: string, taskText: string, completed: boolean) =>
    ipcRenderer.invoke('keel:move-task', sourceFilePath, targetFilePath, taskText, completed),

  // Projects
  createProject: (name: string) => ipcRenderer.invoke('keel:create-project', name),
  renameProject: (oldSlug: string, newName: string) => ipcRenderer.invoke('keel:rename-project', oldSlug, newName),
  deleteProject: (slug: string, moveTasks: boolean) => ipcRenderer.invoke('keel:delete-project', slug, moveTasks),

  // Reminders
  createReminder: (message: string, dueAt: number, recurring?: string) =>
    ipcRenderer.invoke('keel:create-reminder', message, dueAt, recurring),

  listReminders: () => ipcRenderer.invoke('keel:list-reminders'),

  deleteReminder: (id: number) => ipcRenderer.invoke('keel:delete-reminder', id),

  // Keel Cloud — opt-in paid tier (push reminders + capture queue).
  cloudStatus: () => ipcRenderer.invoke('keel:cloud-status'),
  cloudStartSignIn: (email: string) => ipcRenderer.invoke('keel:cloud-start-signin', email),
  cloudCancelSignIn: () => ipcRenderer.invoke('keel:cloud-cancel-signin'),
  cloudSignOut: () => ipcRenderer.invoke('keel:cloud-sign-out'),
  cloudSetApiBase: (apiBase: string) => ipcRenderer.invoke('keel:cloud-set-api-base', apiBase),
  onCloudSignedOut: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('keel:cloud-signed-out', handler);
    return () => ipcRenderer.off('keel:cloud-signed-out', handler);
  },
  onCloudSignInStatus: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: import('../src/shared/types').CloudSignInStatusEvent,
    ) => callback(payload);
    ipcRenderer.on('keel:cloud-signin-status', handler);
    return () => ipcRenderer.off('keel:cloud-signin-status', handler);
  },

  // Keel Pro
  proStatus: () => ipcRenderer.invoke('keel:pro-status'),
  proActivate: (licenseKey: string) => ipcRenderer.invoke('keel:pro-activate', licenseKey),
  proValidate: () => ipcRenderer.invoke('keel:pro-validate'),
  proCancel: () => ipcRenderer.invoke('keel:pro-cancel'),
  onProStatusChanged: (callback: (status: import('../src/shared/types').ProStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: import('../src/shared/types').ProStatus) =>
      callback(status);
    ipcRenderer.on('keel:pro-status-changed', handler);
    return () => ipcRenderer.off('keel:pro-status-changed', handler);
  },

  googleConnect: () => ipcRenderer.invoke('keel:google-connect'),

  googleDisconnect: () => ipcRenderer.invoke('keel:google-disconnect'),

  googleStatus: () => ipcRenderer.invoke('keel:google-status'),

  googleSyncCalendar: () => ipcRenderer.invoke('keel:google-sync-calendar'),

  googleExportDoc: (markdownContent: string, title?: string) => ipcRenderer.invoke('keel:google-export-doc', markdownContent, title),
  googleCreateEvent: (event) => ipcRenderer.invoke('keel:google-create-event', event),
  xConnect: () => ipcRenderer.invoke('keel:x-connect'),
  xDisconnect: () => ipcRenderer.invoke('keel:x-disconnect'),
  xStatus: () => ipcRenderer.invoke('keel:x-status'),
  xSyncBookmarks: () => ipcRenderer.invoke('keel:x-sync-bookmarks'),
  xPublishPost: (request) => ipcRenderer.invoke('keel:x-publish-post', request),
  openaiListModels: () => ipcRenderer.invoke('keel:openai-list-models'),
  openrouterListModels: () => ipcRenderer.invoke('keel:openrouter-list-models'),
  ollamaListModels: () => ipcRenderer.invoke('keel:ollama-list-models'),
  ollamaPullModel: (modelName: string) => ipcRenderer.invoke('keel:ollama-pull-model', modelName),
  ollamaModelStatus: (modelName: string) => ipcRenderer.invoke('keel:ollama-model-status', modelName),
  onOllamaPullProgress: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { modelName: string; status: string; progress?: number }) => callback(payload);
    ipcRenderer.on('keel:ollama-pull-progress', handler);
    return () => ipcRenderer.off('keel:ollama-pull-progress', handler);
  },
  testLlmKey: (provider, apiKey) => ipcRenderer.invoke('keel:test-llm-key', provider, apiKey),
  reportBug: (context) => ipcRenderer.invoke('keel:report-bug', context),
  getRecentActivity: (limit?: number) => ipcRenderer.invoke('keel:get-recent-activity', limit),
  fetchWeather: () => ipcRenderer.invoke('keel:fetch-weather'),
  fetchAiNews: () => ipcRenderer.invoke('keel:fetch-ai-news'),
  listTeamFiles: (dirPath: string) => ipcRenderer.invoke('keel:list-team-files', dirPath),
  readTeamFile: (filePath: string) => ipcRenderer.invoke('keel:read-team-file', filePath),
  writeTeamFile: (filePath: string, content: string) => ipcRenderer.invoke('keel:write-team-file', filePath, content),

  // Scheduled Jobs
  listScheduledJobs: () => ipcRenderer.invoke('keel:list-scheduled-jobs'),
  upsertScheduledJob: (job) => ipcRenderer.invoke('keel:upsert-scheduled-job', job),
  deleteScheduledJob: (id: number) => ipcRenderer.invoke('keel:delete-scheduled-job', id),

  // Daily Quote
  getDailyQuote: () => ipcRenderer.invoke('keel:get-daily-quote'),

  // Meeting Transcription
  synthesizeMeeting: (transcript: string) => ipcRenderer.invoke('keel:synthesize-meeting', transcript),
  transcribeMeeting: (audioBuffer: ArrayBuffer) => ipcRenderer.invoke('keel:transcribe-meeting', audioBuffer),
  transcribeAudio: (audioBuffer: ArrayBuffer) => ipcRenderer.invoke('keel:transcribe-audio', audioBuffer),
  onMeetingProgress: (callback: (payload: { step: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { step: string }) => callback(payload);
    ipcRenderer.on('keel:meeting-progress', handler);
    return () => ipcRenderer.off('keel:meeting-progress', handler);
  },
  onTranscriptionProgress: (callback: (payload: { percent: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { percent: number }) => callback(payload);
    ipcRenderer.on('keel:transcription-progress', handler);
    return () => ipcRenderer.off('keel:transcription-progress', handler);
  },
  onModelDownloadProgress: (callback: (payload: { percent: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { percent: number }) => callback(payload);
    ipcRenderer.on('keel:model-download-progress', handler);
    return () => ipcRenderer.off('keel:model-download-progress', handler);
  },
  listMeetings: () => ipcRenderer.invoke('keel:list-meetings'),
  checkWhisper: () => ipcRenderer.invoke('keel:check-whisper'),
  downloadWhisperBinary: () => ipcRenderer.invoke('keel:download-whisper-binary'),
  onBinaryDownloadProgress: (callback: (payload: { percent: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { percent: number }) => callback(payload);
    ipcRenderer.on('keel:binary-download-progress', handler);
    return () => ipcRenderer.off('keel:binary-download-progress', handler);
  },
  downloadWhisperModel: (model?: string) => ipcRenderer.invoke('keel:download-whisper-model', model),

  getUpdateState: () => ipcRenderer.invoke('keel:update-get-state'),
  checkForUpdates: () => ipcRenderer.invoke('keel:update-check'),
  restartForUpdate: () => ipcRenderer.invoke('keel:update-restart'),
  onUpdateState: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, state: import('../src/shared/types').UpdateState) => callback(state);
    ipcRenderer.on('keel:update-state', handler);
    return () => ipcRenderer.off('keel:update-state', handler);
  },
};

contextBridge.exposeInMainWorld('keel', api);

// Dev-only hatch for faking update states from DevTools. The main-process
// handler is also gated on !app.isPackaged, so this is a no-op in production.
contextBridge.exposeInMainWorld('keelDev', {
  setUpdateState: (patch: Partial<import('../src/shared/types').UpdateState>) =>
    ipcRenderer.invoke('keel:update-debug-set-state', patch),
});

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
