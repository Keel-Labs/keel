/**
 * API client for Keel cloud server.
 *
 * Implements the same KeelAPI interface as the Electron preload bridge,
 * but routes calls to the Fastify server over HTTP/SSE instead of IPC.
 *
 * In Electron mode (window.keel exists), the IPC bridge is used directly.
 * In web/Capacitor mode, this client is used.
 */

import type {
  Message,
  Settings,
  FileEntry,
  KeelAPI,
  OllamaListResult,
  ScheduledNotification,
  Reminder,
} from '../shared/types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// --- Token management ---

let accessToken: string | null = null;
let refreshToken: string | null = null;
let onAuthExpired: (() => void) | null = null;

export function setTokens(access: string, refresh: string): void {
  accessToken = access;
  refreshToken = refresh;
  try {
    localStorage.setItem('keel_access_token', access);
    localStorage.setItem('keel_refresh_token', refresh);
  } catch { /* SSR or restricted storage */ }
}

export function loadTokens(): boolean {
  try {
    accessToken = localStorage.getItem('keel_access_token');
    refreshToken = localStorage.getItem('keel_refresh_token');
  } catch { /* SSR */ }
  return !!accessToken;
}

export function clearTokens(): void {
  accessToken = null;
  refreshToken = null;
  try {
    localStorage.removeItem('keel_access_token');
    localStorage.removeItem('keel_refresh_token');
  } catch { /* SSR */ }
}

export function isAuthenticated(): boolean {
  return !!accessToken;
}

export function setOnAuthExpired(cb: () => void): void {
  onAuthExpired = cb;
}

// --- HTTP helpers ---

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    accessToken = data.accessToken;
    try { localStorage.setItem('keel_access_token', data.accessToken); } catch {}
    return true;
  } catch {
    return false;
  }
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> || {}),
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  if (!headers['Content-Type'] && !(init.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  let res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  // Auto-refresh on 401
  if (res.status === 401 && refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      res = await fetch(`${API_BASE}${path}`, { ...init, headers });
    } else {
      clearTokens();
      onAuthExpired?.();
    }
  }

  return res;
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

async function apiPost<T>(path: string, body?: any): Promise<T> {
  const res = await apiFetch(path, {
    method: 'POST',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

async function apiPut<T>(path: string, body?: any): Promise<T> {
  const res = await apiFetch(path, {
    method: 'PUT',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

async function apiDelete(path: string): Promise<void> {
  const res = await apiFetch(path, { method: 'DELETE' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
}

// --- Auth API ---

export async function register(email: string, password: string, name?: string) {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Registration failed');
  }
  const data = await res.json();
  setTokens(data.accessToken, data.refreshToken);
  return data.user;
}

export async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Login failed');
  }
  const data = await res.json();
  setTokens(data.accessToken, data.refreshToken);
  return data.user;
}

export function logout(): void {
  clearTokens();
}

// --- SSE streaming state ---

let streamListeners: {
  onChunk?: (chunk: string) => void;
  onDone?: () => void;
  onError?: (error: string) => void;
  onThinking?: (step: string) => void;
} = {};
let currentAbortController: AbortController | null = null;

// --- Notification polling state ---

let notificationCallback: ((n: ScheduledNotification) => void) | null = null;
let notificationPollInterval: ReturnType<typeof setInterval> | null = null;

// --- The KeelAPI implementation over HTTP ---

export const apiClient: KeelAPI = {
  // Chat (non-streaming)
  async chat(messages: Message[]): Promise<string> {
    const data = await apiPost<{ content: string }>('/api/chat', { messages });
    return data.content;
  },

  // Chat streaming via SSE
  async chatStream(messages: Message[]): Promise<void> {
    currentAbortController = new AbortController();
    const res = await apiFetch('/api/chat/stream', {
      method: 'POST',
      body: JSON.stringify({ messages }),
      signal: currentAbortController.signal,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Stream failed');
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7);
          } else if (line.startsWith('data: ') && eventType) {
            try {
              const data = JSON.parse(line.slice(6));
              switch (eventType) {
                case 'chunk':
                  streamListeners.onChunk?.(data.text);
                  break;
                case 'thinking':
                  streamListeners.onThinking?.(data.step);
                  break;
                case 'done':
                  streamListeners.onDone?.();
                  break;
                case 'error':
                  streamListeners.onError?.(data.message);
                  break;
              }
            } catch { /* bad JSON line */ }
            eventType = '';
          }
        }
      }
      // If stream ends without explicit done event, signal done
      streamListeners.onDone?.();
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        streamListeners.onError?.(err.message || 'Stream failed');
      }
    }
  },

  onStreamChunk(callback) {
    streamListeners.onChunk = callback;
  },

  onStreamDone(callback) {
    streamListeners.onDone = callback;
  },

  onStreamError(callback) {
    streamListeners.onError = callback;
  },

  onThinkingStep(callback) {
    streamListeners.onThinking = callback;
  },

  removeStreamListeners() {
    streamListeners = {};
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
  },

  // Settings
  async getSettings(): Promise<Settings> {
    const data = await apiGet<any>('/api/settings');
    return {
      ...data,
      brainPath: data.brainPath || 'cloud', // Not relevant in cloud mode
      teamBrainPath: data.teamBrainPath || '',
    } as Settings;
  },

  async saveSettings(settings: Settings): Promise<void> {
    await apiPut('/api/settings', settings);
  },

  async ensureBrain(): Promise<void> {
    // No-op in cloud mode — brain is always available in Postgres
  },

  // Workflows
  async capture(input: string): Promise<string> {
    const data = await apiPost<{ content: string }>('/api/workflows/capture', { input });
    return data.content;
  },

  async dailyBrief(): Promise<string> {
    const data = await apiPost<{ content: string }>('/api/workflows/daily-brief');
    return data.content;
  },

  async eod(chatHistory: Message[]): Promise<string> {
    const data = await apiPost<{ content: string }>('/api/workflows/eod', { chatHistory });
    return data.content;
  },

  async exportPdf(): Promise<string> {
    // PDF export not yet available in cloud mode
    throw new Error('PDF export is not yet available in cloud mode. Coming soon.');
  },

  async resetProfile(): Promise<void> {
    const KEEL_TEMPLATE = `# Profile\nName: [Your Name]\nRole: [Your Role]\n\n# Active Projects\n| Project | Status | Deadline | Summary |\n|---|---|---|---|\n\n# Current Priorities\n1.\n\n# Key People\n| Name | Role | Notes |\n|---|---|---|\n\n# Conventions\n-\n`;
    await apiPut('/api/brain/file', { path: 'keel.md', content: KEEL_TEMPLATE });
  },

  // Chat sessions
  async saveChat(sessionId: string, messages: Message[]): Promise<void> {
    await apiPut(`/api/chat/sessions/${sessionId}`, { messages });
  },

  async loadChat(sessionId: string): Promise<Message[] | null> {
    try {
      const data = await apiGet<{ messages: Message[] }>(`/api/chat/sessions/${sessionId}`);
      return data.messages;
    } catch {
      return null;
    }
  },

  async getLatestSession(): Promise<string | null> {
    const data = await apiGet<{ id: string | null }>('/api/chat/sessions/latest');
    return data.id;
  },

  async listSessions(): Promise<Array<{ id: string; title: string; updatedAt: number }>> {
    return apiGet('/api/chat/sessions');
  },

  // File browser (brain files)
  async pickFolder(): Promise<string | null> {
    // Not applicable in cloud/mobile mode
    return null;
  },

  async listFiles(dirPath: string): Promise<FileEntry[]> {
    const entries = await apiGet<Array<{ name: string; isDir: boolean; path: string }>>(
      `/api/brain/files?dir=${encodeURIComponent(dirPath)}`
    );
    return entries.map((e) => ({
      name: e.name,
      path: e.path,
      isDirectory: e.isDir,
      updatedAt: 0,
    }));
  },

  async readFile(filePath: string): Promise<string> {
    const data = await apiGet<{ content: string }>(`/api/brain/file?path=${encodeURIComponent(filePath)}`);
    return data.content;
  },

  async writeFile(filePath: string, content: string): Promise<void> {
    await apiPut('/api/brain/file', { path: filePath, content });
  },

  // Scheduled notifications (poll-based in cloud mode)
  onScheduledNotification(callback) {
    notificationCallback = callback;
    // Poll for due reminders every 30s
    if (!notificationPollInterval) {
      notificationPollInterval = setInterval(async () => {
        try {
          const due = await apiGet<Array<{ id: number; message: string }>>('/api/reminders/due');
          for (const r of due) {
            notificationCallback?.({ type: 'reminder', content: r.message });
            await apiPost(`/api/reminders/${r.id}/fire`);
          }
        } catch { /* ignore polling errors */ }
      }, 30_000);
    }
  },

  removeScheduledNotificationListener() {
    notificationCallback = null;
    if (notificationPollInterval) {
      clearInterval(notificationPollInterval);
      notificationPollInterval = null;
    }
  },

  // Reminders
  async createReminder(message: string, dueAt: number, recurring?: string): Promise<number> {
    const data = await apiPost<{ id: number }>('/api/reminders', { message, dueAt, recurring });
    return data.id;
  },

  async listReminders(): Promise<Reminder[]> {
    return apiGet('/api/reminders');
  },

  async deleteReminder(id: number): Promise<void> {
    await apiDelete(`/api/reminders/${id}`);
  },

  // Google Integration (not yet implemented in cloud mode)
  async googleConnect(): Promise<void> {
    throw new Error('Google integration coming soon to cloud mode.');
  },

  async googleDisconnect(): Promise<void> {
    throw new Error('Google integration coming soon to cloud mode.');
  },

  async googleStatus(): Promise<{ connected: boolean; configured?: boolean }> {
    return { connected: false, configured: false };
  },

  async googleSyncCalendar(): Promise<{ eventCount: number; filesWritten: number }> {
    throw new Error('Google integration coming soon to cloud mode.');
  },

  async googleExportDoc(): Promise<string> {
    throw new Error('Google integration coming soon to cloud mode.');
  },

  async googleCreateEvent(): Promise<{ id: string; htmlLink: string }> {
    throw new Error('Google Calendar coming soon to cloud mode.');
  },

  // Ollama (not available in cloud mode — Ollama is local only)
  async ollamaListModels(): Promise<OllamaListResult> {
    return { models: [], error: 'Ollama is only available in desktop mode.' };
  },

  // Team brain (mapped to brain files with team/ prefix in cloud mode)
  async listTeamFiles(dirPath: string): Promise<FileEntry[]> {
    return apiClient.listFiles(`team/${dirPath}`);
  },

  async readTeamFile(filePath: string): Promise<string> {
    return apiClient.readFile(`team/${filePath}`);
  },

  async writeTeamFile(filePath: string, content: string): Promise<void> {
    return apiClient.writeFile(`team/${filePath}`, content);
  },
};

/**
 * Returns the appropriate KeelAPI implementation:
 * - In Electron (window.keel exists): use the IPC bridge
 * - In web/Capacitor: use the HTTP API client
 */
export function getKeelAPI(): KeelAPI {
  if (typeof window !== 'undefined' && (window as any).keel) {
    return (window as any).keel;
  }
  return apiClient;
}
