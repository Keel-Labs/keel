export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface Settings {
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

// IPC channel types
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
  | 'keel:write-file';

// Preload API exposed to renderer
export interface KeelAPI {
  chat: (messages: Message[]) => Promise<string>;
  chatStream: (messages: Message[]) => Promise<void>;
  onStreamChunk: (callback: (chunk: string) => void) => void;
  onStreamDone: (callback: () => void) => void;
  onStreamError: (callback: (error: string) => void) => void;
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
  listFiles: (dirPath: string) => Promise<FileEntry[]>;
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<void>;
}

declare global {
  interface Window {
    keel: KeelAPI;
  }
}
