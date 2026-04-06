import { describe, expect, it } from 'vitest';
import {
  CHAT_UNREAD_STORAGE_KEY,
  addUnreadSessionId,
  loadUnreadSessionIds,
  removeUnreadSessionId,
} from '../sessionState';

describe('session unread state', () => {
  it('loads unread session ids from storage', () => {
    const storage = {
      getItem: (key: string) => key === CHAT_UNREAD_STORAGE_KEY
        ? JSON.stringify(['session-a', 'session-b'])
        : null,
    };

    expect(loadUnreadSessionIds(storage)).toEqual(['session-a', 'session-b']);
  });

  it('returns an empty list when persisted unread state is invalid', () => {
    const storage = {
      getItem: () => '{not-json',
    };

    expect(loadUnreadSessionIds(storage)).toEqual([]);
  });

  it('adds unread ids once and removes them when read', () => {
    const unread = addUnreadSessionId([], 'session-a');
    const withDuplicate = addUnreadSessionId(unread, 'session-a');

    expect(withDuplicate).toEqual(['session-a']);
    expect(removeUnreadSessionId(withDuplicate, 'session-a')).toEqual([]);
  });
});
