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
  publishedPostId?: string;
  publishedUrl?: string;
  publishedAt?: number;
  lastPublishedText?: string;
  lastError?: string;
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
  // General
  brainPath: string;
  userName: string;         // User's display name.
  // Locale
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

export interface ProjectKBManifest {
  wikiBaseSlug: string;
  lastRefreshed: number;
  ingestedFiles: { path: string; mtime: number }[];
}

export interface ProjectKBStatus {
  hasKB: boolean;
  wikiBaseSlug?: string;
  lastRefreshed?: number;
  ingestedCount?: number;
}

export interface ProjectKBRefreshResult {
  wikiBaseSlug: string;
  added: number;
  skipped: number;
  errors?: string[];
  created?: boolean;
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
  redirectUri?: string;
  scopes?: string[];
  account?: XAccountProfile;
  lastSyncAt?: number;
  lastSyncFetchedCount?: number;
  lastSyncNewCount?: number;
  lastSyncSkippedCount?: number;
  lastPublishAt?: number;
  lastPublishedUrl?: string;
  lastPublishError?: string;
  status: 'idle' | 'connected' | 'syncing' | 'error' | 'disconnected';
  error?: string;
  targetBasePath?: string;
  targetBaseTitle?: string;
}

export interface XSyncResult {
  fetchedCount: number;
  syncedCount: number;
  skippedCount: number;
  stoppedEarly: boolean;
  targetBasePath: string;
  targetBaseTitle: string;
}

export interface XPublishRequest {
  text: string;
}

export interface XPublishResult {
  id: string;
  url: string;
  text: string;
  publishedAt: number;
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
  type: 'daily-brief' | 'eod' | 'reminder' | 'scheduled-job';
  content: string;
  jobName?: string;
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

export interface ScheduledJob {
  id?: number;
  name: string;
  prompt: string;
  scheduleType: 'daily' | 'weekly' | 'weekdays';
  time: string;           // HH:MM 24h
  dayOfWeek?: number | null; // 0=Sun..6=Sat, only for 'weekly'
  enabled: boolean;
  lastRunDate?: string | null;
  createdAt?: number;
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
  | 'keel:scan-folder'
  | 'keel:onboarding-ingest'
  | 'keel:pick-files'
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
  | 'keel:x-publish-post'
  | 'keel:openai-list-models'
  | 'keel:ollama-list-models'
  | 'keel:list-tasks'
  | 'keel:toggle-task'
  | 'keel:move-task'
  | 'keel:create-task'
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
  | 'keel:write-team-file'
  | 'keel:list-scheduled-jobs'
  | 'keel:upsert-scheduled-job'
  | 'keel:delete-scheduled-job'
  | 'keel:get-daily-quote'
  | 'keel:transcribe-meeting'
  | 'keel:synthesize-meeting'
  | 'keel:list-meetings'
  | 'keel:meeting-progress'
  | 'keel:transcription-progress'
  | 'keel:model-download-progress'
  | 'keel:check-whisper'
  | 'keel:download-whisper-binary'
  | 'keel:binary-download-progress'
  | 'keel:download-whisper-model';

export interface MeetingTranscriptionResult {
  ok: boolean;
  title?: string;
  summary?: string;
  actionItems?: string[];
  myActionItems?: string[];
  othersActionItems?: string[];
  meetingPath?: string;
  error?: string;
}

export interface MeetingEntry {
  path: string;
  date: string;
  title: string;
}

export interface WhisperStatus {
  binaryAvailable: boolean;
  binaryPath: string | null;
  modelDownloaded: boolean;
  models: Array<{ id: string; downloaded: boolean; sizeMb: number }>;
}

export interface OnboardingProjectInput {
  name: string;
  description: string;
  docRefs: string[]; // URLs (Google Docs) or local file paths
}

export interface OnboardingIngestInput {
  name: string;
  role: string;
  projects: OnboardingProjectInput[];
  people: string; // free-form, one per line
  context: string; // free-text "anything else"
}

export interface OnboardingIngestResult {
  projectsCreated: number;
  docsFetched: number;
  docsFailed: Array<{ ref: string; error: string }>;
}

export interface ScanFolderResult {
  exists: boolean;
  isEmpty: boolean;
  fileCount: number;
  dirCount: number;
  topLevel: Array<{ name: string; isDir: boolean; isHidden: boolean }>;
  hasParaDirs: boolean;
  hasKeelFiles: boolean;
  error?: string;
}

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
  getAppVersion: () => Promise<string>;
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
  scanFolder: (folderPath: string) => Promise<ScanFolderResult>;
  onboardingIngest: (input: OnboardingIngestInput) => Promise<OnboardingIngestResult>;
  pickFiles: () => Promise<string[]>;
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
  deleteWikiSource: (basePath: string, sourceSlug: string) => Promise<{ deleted: string }>;
  startWikiCompile: (basePath: string) => Promise<WikiJob>;
  startWikiHealthCheck: (basePath: string) => Promise<WikiJob>;
  listWikiJobs: (basePath?: string) => Promise<WikiJob[]>;
  listWikiBases: () => Promise<WikiBaseSummary[]>;
  getProjectKbStatus: (projectSlug: string) => Promise<ProjectKBStatus>;
  createProjectKb: (projectName: string) => Promise<ProjectKBRefreshResult & { projectSlug: string }>;
  refreshProjectKb: (projectName: string) => Promise<ProjectKBRefreshResult & { projectSlug: string }>;
  onScheduledNotification: (callback: (notification: ScheduledNotification) => void) => void;
  removeScheduledNotificationListener: () => void;
  onAutoCaptureDone: (callback: (event: { requestId: string; summary: string }) => void) => () => void;
  onMemoryUpdated: (callback: (event: { requestId: string; summary: string }) => void) => () => void;
  // Tasks
  listTasks: () => Promise<TaskGroup[]>;
  toggleTask: (filePath: string, taskText: string, completed: boolean) => Promise<void>;
  moveTask: (sourceFilePath: string, targetFilePath: string, taskText: string, completed: boolean) => Promise<void>;
  createTask: (filePath: string, text: string) => Promise<void>;
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
  xPublishPost: (request: XPublishRequest) => Promise<XPublishResult>;
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
  // Scheduled Jobs
  listScheduledJobs: () => Promise<ScheduledJob[]>;
  upsertScheduledJob: (job: ScheduledJob) => Promise<number>;
  deleteScheduledJob: (id: number) => Promise<void>;
  // Daily Quote
  getDailyQuote: () => Promise<{ text: string; author: string }>;
  // Meeting Transcription
  transcribeMeeting: (audioBuffer: ArrayBuffer) => Promise<MeetingTranscriptionResult>;
  transcribeAudio: (audioBuffer: ArrayBuffer) => Promise<{ ok: true; text: string } | { ok: false; error: string }>;
  synthesizeMeeting: (transcript: string) => Promise<MeetingTranscriptionResult>;
  onMeetingProgress: (callback: (payload: { step: string }) => void) => () => void;
  onTranscriptionProgress: (callback: (payload: { percent: number }) => void) => () => void;
  onModelDownloadProgress: (callback: (payload: { percent: number }) => void) => () => void;
  listMeetings: () => Promise<MeetingEntry[]>;
  checkWhisper: () => Promise<WhisperStatus>;
  downloadWhisperBinary: () => Promise<{ ok: boolean; error?: string }>;
  onBinaryDownloadProgress: (callback: (payload: { percent: number }) => void) => () => void;
  downloadWhisperModel: (model?: string) => Promise<{ ok: boolean; error?: string }>;
}

declare global {
  interface Window {
    keel: KeelAPI;
  }
}
