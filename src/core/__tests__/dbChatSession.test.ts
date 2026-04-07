import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { closeDb, getDb, listChatSessions, loadChatSession, saveChatSession } from '../db';
import type { Message } from '../../shared/types';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-chat-db-'));
});

afterEach(async () => {
  closeDb();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('chat session persistence', () => {
  it('saves and loads session metadata with messages', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Where are the wiki notes?', displayContent: 'Where are the wiki notes?', timestamp: Date.now() },
    ];

    saveChatSession(tmpDir, 'session-1', {
      messages,
      metadata: {
        wikiBasePath: 'knowledge-bases/research-base',
        wikiBaseTitle: 'Research Base',
        wikiBaseSlug: 'research-base',
        digDeep: true,
      },
    });

    const loaded = loadChatSession(tmpDir, 'session-1');
    expect(loaded?.messages).toEqual(messages);
    expect(loaded?.metadata?.wikiBasePath).toBe('knowledge-bases/research-base');
    expect(loaded?.metadata?.digDeep).toBe(true);
  });

  it('normalizes legacy message-only rows when loading and listing sessions', () => {
    const db = getDb(tmpDir);
    const now = Date.now();
    db.prepare('INSERT INTO chat_sessions (id, messages, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('legacy-session', JSON.stringify([
        { role: 'user', content: 'Legacy chat', timestamp: now },
        { role: 'assistant', content: 'Still works', timestamp: now + 1 },
      ]), now, now);

    const loaded = loadChatSession(tmpDir, 'legacy-session');
    expect(loaded?.messages).toHaveLength(2);
    expect(loaded?.metadata).toBeUndefined();

    const sessions = listChatSessions(tmpDir, 10);
    expect(sessions[0]?.id).toBe('legacy-session');
    expect(sessions[0]?.messageCount).toBe(2);
  });
});
