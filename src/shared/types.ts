export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface Settings {
  provider: 'claude' | 'ollama';
  anthropicApiKey: string;
  ollamaModel: string;
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
  | 'keel:eod';

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
}

declare global {
  interface Window {
    keel: KeelAPI;
  }
}
