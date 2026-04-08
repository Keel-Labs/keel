export interface MessageImage {
  data: string;      // base64-encoded image data (no prefix)
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
}

export interface MessageDocument {
  name: string;
  mimeType: string;
  warning?: string;
}

export interface ChatDocumentAttachment extends MessageDocument {
  content: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  displayContent?: string;
  images?: MessageImage[];
  documents?: MessageDocument[];
  timestamp: number;
}

export interface ChatSessionMetadata {
  wikiBasePath?: string;
  wikiBaseTitle?: string;
  wikiBaseSlug?: string;
  digDeep?: boolean;
  xDraft?: ChatXDraftMetadata;
}

export interface ChatXDraftMetadata {
  mode: 'post';
  startedAt: number;
}

export interface StoredChatSession {
  messages: Message[];
  metadata?: ChatSessionMetadata;
}

export interface ChatRequest {
  messages: Message[];
  sessionMetadata?: ChatSessionMetadata;
}

export interface Settings {
  theme: 'system' | 'dark' | 'light';
  hasCompletedOnboarding: boolean;
  provider: 'claude' | 'openai' | 'openrouter' | 'ollama';
  // Claude
  anthropicApiKey: string;
  claudeModel: string;
  // OpenAI
  openaiApiKey: string;
  openaiModel: string;
  // OpenRouter / custom OpenAI-compatible endpoint
  openrouterApiKey: string;
  openrouterModel: string;
  openrouterBaseUrl: string;
  // Ollama
  ollamaModel: string;
  // Personality
  personality: string;       // ID of active personality template (e.g. "default", "butler").
  // X
  xClientId: string;
  // General
  brainPath: string;
  // Team Brain
  teamBrainPath: string;   // Path to shared team brain folder. Empty = disabled.
  userName: string;         // User's display name for team updates.
  // Scheduler
  dailyBriefTime: string;  // HH:MM format, e.g. "09:00". Empty = disabled.
  eodTime: string;         // HH:MM format, e.g. "17:30". Empty = disabled.
  timezone: string;        // IANA timezone, e.g. "America/New_York". Empty = auto-detect.
}

export interface EmbeddedChunk {
  id: string;
  filePath: string;
  chunkIndex: number;
  text: string;
  vector: number[];
  createdAt: number;
}

export interface SearchResult {
  chunk: EmbeddedChunk;
  score: number;
}

export interface FileIndex {
  filePath: string;
  lastIndexedAt: number;
  chunkCount: number;
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  updatedAt: number;
}

export type WikiSourceType = 'url' | 'text' | 'file' | 'x';

export interface WikiFileImport {
  name: string;
  path: string;
}

export interface WikiSourceInput {
  sourceType: WikiSourceType;
  title?: string;
  url?: string;
  text?: string;
  filePath?: string;
  fileName?: string;
  xPostUrl?: string;
  xAuthorHandle?: string;
  xAuthorName?: string;
  xPostedAt?: string;
  xReplyCount?: number;
  xRepostCount?: number;
  xLikeCount?: number;
  xBookmarkCount?: number;
  xText?: string;
}

export interface WikiIngestResult {
  sourceSlug: string;
  title: string;
  pagePath: string;
  relativePagePath: string;
  message: string;
  warning?: string;
}

export interface WikiBaseCreateResult {
  basePath: string;
  slug: string;
  title: string;
  message: string;
}

export interface WikiBaseSummary {
  basePath: string;
  slug: string;
  title: string;
  description?: string;
  updatedAt: number;
}

export interface XAccountProfile {
  id: string;
  username: string;
  name?: string;
}

export interface XStatus {
  configured: boolean;
  connected: boolean;
  clientId?: string;
  account?: XAccountProfile;
  lastSyncAt?: number;
  status: 'idle' | 'connected' | 'syncing' | 'error' | 'disconnected';
  error?: string;
  targetBasePath?: string;
  targetBaseTitle?: string;
}

export interface XSyncResult {
  syncedCount: number;
  targetBasePath: string;
  targetBaseTitle: string;
}

export type WikiJobType = 'compile' | 'health';
export type WikiJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface WikiJob {
  id: string;
  type: WikiJobType;
  basePath: string;
  status: WikiJobStatus;
  title: string;
  detail: string;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  outputPath?: string;
  error?: string;
}

export type UtilityWindowKind = 'wiki-ingest';

export interface ActivityLogEntry {
  id: number;
  action: string;
  detail: string;
  createdAt: number;
}

export interface WeatherInfo {
  temp: string;
  condition: string;
  icon: string;
  location: string;
}

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: number;
}

export interface OllamaModelInfo {
  name: string;
  size: number;
  parameterSize: string;
  quantizationLevel: string;
  family: string;
}

export interface OllamaListResult {
  models: OllamaModelInfo[];
  error: string | null;
}

export interface OpenAIListResult {
  models: string[];
  error: string | null;
}

// IPC channel types
export interface ScheduledNotification {
  type: 'daily-brief' | 'eod' | 'reminder';
  content: string;
}

export interface Reminder {
  id: number;
  message: string;
  dueAt: number;
  recurring: string | null;
  fired: boolean;
  createdAt: number;
}

export interface Task {
  filePath: string;
  text: string;
  completed: boolean;
  project: string | null;
}

export interface IncomingTask {
  id: number;
  text: string;
  project: string | null;
  sourceFile: string;
  createdAt: number;
}

export interface TaskGroup {
  project: string;
  slug: string | null;
  tasks: Task[];
}

export type IpcChannels =
  | 'keel:chat'
  | 'keel:chat-stream'
  | 'keel:cancel-stream'
  | 'keel:chat-stream-chunk'
  | 'keel:chat-stream-done'
  | 'keel:chat-stream-error'
  | 'keel:get-settings'
  | 'keel:save-settings'
  | 'keel:ensure-brain'
  | 'keel:capture'
  | 'keel:daily-brief'
  | 'keel:eod'
  | 'keel:export-pdf'
  | 'keel:reset-profile'
  | 'keel:save-chat'
  | 'keel:load-chat'
  | 'keel:get-latest-session'
  | 'keel:list-sessions'
  | 'keel:list-files'
  | 'keel:read-file'
  | 'keel:write-file'
  | 'keel:pick-folder'
  | 'keel:pick-chat-documents'
  | 'keel:pick-wiki-files'
  | 'keel:create-wiki-base'
  | 'keel:open-path'
  | 'keel:wiki-ingest-source'
  | 'keel:start-wiki-compile'
  | 'keel:start-wiki-health-check'
  | 'keel:list-wiki-jobs'
  | 'keel:list-wiki-bases'
  | 'keel:open-utility-window'
  | 'keel:close-window'
  | 'keel:scheduled-notification'
  | 'keel:create-reminder'
  | 'keel:list-reminders'
  | 'keel:delete-reminder'
  | 'keel:google-connect'
  | 'keel:google-disconnect'
  | 'keel:google-status'
  | 'keel:google-sync-calendar'
  | 'keel:google-export-doc'
  | 'keel:x-connect'
  | 'keel:x-disconnect'
  | 'keel:x-status'
  | 'keel:x-sync-bookmarks'
  | 'keel:openai-list-models'
  | 'keel:ollama-list-models'
  | 'keel:list-tasks'
  | 'keel:toggle-task'
  | 'keel:move-task'
  | 'keel:list-incoming-tasks'
  | 'keel:accept-incoming-task'
  | 'keel:dismiss-incoming-task'
  | 'keel:create-project'
  | 'keel:rename-project'
  | 'keel:delete-project'
  | 'keel:get-recent-activity'
  | 'keel:fetch-weather'
  | 'keel:fetch-ai-news'
  | 'keel:list-team-files'
  | 'keel:read-team-file'
  | 'keel:write-team-file';

// Preload API exposed to renderer
export interface KeelAPI {
  cancelStream: (requestId: string) => Promise<void>;
  chat: (request: ChatRequest) => Promise<string>;
  chatStream: (request: ChatRequest, requestId: string) => Promise<void>;
  onStreamChunk: (callback: (event: { requestId: string; chunk: string }) => void) => () => void;
  onStreamDone: (callback: (event: { requestId: string }) => void) => () => void;
  onStreamError: (callback: (event: { requestId: string; error: string }) => void) => () => void;
  onThinkingStep: (callback: (event: { requestId: string; step: string }) => void) => () => void;
  onThinkingDelta: (callback: (event: { requestId: string; text: string }) => void) => () => void;
  getSettings: () => Promise<Settings>;
  saveSettings: (settings: Settings) => Promise<void>;
  ensureBrain: () => Promise<void>;
  capture: (input: string) => Promise<string>;
  dailyBrief: () => Promise<string>;
  eod: (chatHistory: Message[]) => Promise<string>;
  exportPdf: (markdownContent: string, title?: string) => Promise<string>;
  resetProfile: () => Promise<void>;
  saveChat: (sessionId: string, session: StoredChatSession) => Promise<void>;
  loadChat: (sessionId: string) => Promise<StoredChatSession | null>;
  getLatestSession: () => Promise<string | null>;
  listSessions: () => Promise<Array<{ id: string; title: string; updatedAt: number }>>;
  pickFolder: (defaultPath?: string) => Promise<string | null>;
  pickChatDocuments: () => Promise<ChatDocumentAttachment[]>;
  pickWikiFiles: () => Promise<WikiFileImport[]>;
  createWikiBase: (title: string, description?: string) => Promise<WikiBaseCreateResult>;
  openPath: (filePath: string) => Promise<string>;
  openUtilityWindow: (kind: UtilityWindowKind, query?: Record<string, string>) => Promise<void>;
  closeWindow: () => Promise<void>;
  listFiles: (dirPath: string) => Promise<FileEntry[]>;
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<void>;
  ingestWikiSource: (basePath: string, input: WikiSourceInput) => Promise<WikiIngestResult>;
  startWikiCompile: (basePath: string) => Promise<WikiJob>;
  startWikiHealthCheck: (basePath: string) => Promise<WikiJob>;
  listWikiJobs: (basePath?: string) => Promise<WikiJob[]>;
  listWikiBases: () => Promise<WikiBaseSummary[]>;
  onScheduledNotification: (callback: (notification: ScheduledNotification) => void) => void;
  removeScheduledNotificationListener: () => void;
  onAutoCaptureDone: (callback: (event: { requestId: string; summary: string }) => void) => () => void;
  onMemoryUpdated: (callback: (event: { requestId: string; summary: string }) => void) => () => void;
  // Tasks
  listTasks: () => Promise<TaskGroup[]>;
  toggleTask: (filePath: string, taskText: string, completed: boolean) => Promise<void>;
  moveTask: (sourceFilePath: string, targetFilePath: string, taskText: string, completed: boolean) => Promise<void>;
  listIncomingTasks: () => Promise<IncomingTask[]>;
  acceptIncomingTask: (id: number) => Promise<void>;
  dismissIncomingTask: (id: number) => Promise<void>;
  // Projects
  createProject: (name: string) => Promise<string>;
  renameProject: (oldSlug: string, newName: string) => Promise<string>;
  deleteProject: (slug: string, moveTasks: boolean) => Promise<void>;
  // Reminders
  createReminder: (message: string, dueAt: number, recurring?: string) => Promise<number>;
  listReminders: () => Promise<Reminder[]>;
  deleteReminder: (id: number) => Promise<void>;
  // Google Integration
  googleConnect: () => Promise<void>;
  googleDisconnect: () => Promise<void>;
  googleStatus: () => Promise<{ connected: boolean; configured?: boolean }>;
  googleSyncCalendar: () => Promise<{ eventCount: number; filesWritten: number }>;
  googleExportDoc: (markdownContent: string, title?: string) => Promise<string>;
  googleCreateEvent: (event: { summary: string; startTime: string; endTime: string; description?: string; attendees?: string[] }) => Promise<{ id: string; htmlLink: string }>;
  xConnect: () => Promise<XAccountProfile>;
  xDisconnect: () => Promise<void>;
  xStatus: () => Promise<XStatus>;
  xSyncBookmarks: () => Promise<XSyncResult>;
  openaiListModels: () => Promise<OpenAIListResult>;
  // Ollama
  ollamaListModels: () => Promise<OllamaListResult>;
  // Activity
  getRecentActivity: (limit?: number) => Promise<ActivityLogEntry[]>;
  fetchWeather: () => Promise<WeatherInfo | null>;
  fetchAiNews: () => Promise<NewsItem[]>;
  // Team Brain
  listTeamFiles: (dirPath: string) => Promise<FileEntry[]>;
  readTeamFile: (filePath: string) => Promise<string>;
  writeTeamFile: (filePath: string, content: string) => Promise<void>;
}

declare global {
  interface Window {
    keel: KeelAPI;
  }
}
