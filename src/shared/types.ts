export interface MessageImage {
  data: string;      // base64-encoded image data (no prefix)
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  images?: MessageImage[];
  timestamp: number;
}

export interface Settings {
  theme: 'dark' | 'light';
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

export interface ActivityLogEntry {
  id: number;
  action: string;
  detail: string;
  createdAt: number;
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

export type IpcChannels =
  | 'keel:chat'
  | 'keel:chat-stream'
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
  | 'keel:scheduled-notification'
  | 'keel:create-reminder'
  | 'keel:list-reminders'
  | 'keel:delete-reminder'
  | 'keel:google-connect'
  | 'keel:google-disconnect'
  | 'keel:google-status'
  | 'keel:google-sync-calendar'
  | 'keel:google-export-doc'
  | 'keel:ollama-list-models'
  | 'keel:list-team-files'
  | 'keel:read-team-file'
  | 'keel:write-team-file';

// Preload API exposed to renderer
export interface KeelAPI {
  chat: (messages: Message[]) => Promise<string>;
  chatStream: (messages: Message[]) => Promise<void>;
  onStreamChunk: (callback: (chunk: string) => void) => void;
  onStreamDone: (callback: () => void) => void;
  onStreamError: (callback: (error: string) => void) => void;
  onThinkingStep: (callback: (step: string) => void) => void;
  onThinkingDelta: (callback: (text: string) => void) => void;
  removeStreamListeners: () => void;
  getSettings: () => Promise<Settings>;
  saveSettings: (settings: Settings) => Promise<void>;
  ensureBrain: () => Promise<void>;
  capture: (input: string) => Promise<string>;
  dailyBrief: () => Promise<string>;
  eod: (chatHistory: Message[]) => Promise<string>;
  exportPdf: (markdownContent: string, title?: string) => Promise<string>;
  resetProfile: () => Promise<void>;
  saveChat: (sessionId: string, messages: Message[]) => Promise<void>;
  loadChat: (sessionId: string) => Promise<Message[] | null>;
  getLatestSession: () => Promise<string | null>;
  listSessions: () => Promise<Array<{ id: string; title: string; updatedAt: number }>>;
  pickFolder: (defaultPath?: string) => Promise<string | null>;
  listFiles: (dirPath: string) => Promise<FileEntry[]>;
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<void>;
  onScheduledNotification: (callback: (notification: ScheduledNotification) => void) => void;
  removeScheduledNotificationListener: () => void;
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
  // Ollama
  ollamaListModels: () => Promise<OllamaListResult>;
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
