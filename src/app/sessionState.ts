export const CHAT_UNREAD_STORAGE_KEY = 'keel.chat.unread.v1';

export interface SessionIndicatorState {
  isStreaming: boolean;
  unread: boolean;
}

export function loadUnreadSessionIds(
  storage: Pick<Storage, 'getItem'> | null | undefined,
): string[] {
  if (!storage) return [];

  try {
    const raw = storage.getItem(CHAT_UNREAD_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((value): value is string => typeof value === 'string' && value.length > 0);
  } catch {
    return [];
  }
}

export function addUnreadSessionId(ids: string[], sessionId: string): string[] {
  if (!sessionId || ids.includes(sessionId)) return ids;
  return [...ids, sessionId];
}

export function removeUnreadSessionId(ids: string[], sessionId: string): string[] {
  if (!sessionId || !ids.includes(sessionId)) return ids;
  return ids.filter((id) => id !== sessionId);
}
