import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import type { FileIndex, ActivityLogEntry, Message } from '../shared/types';

let db: Database.Database | null = null;

export function getDb(brainPath: string): Database.Database {
  if (db) return db;

  const configDir = path.join(brainPath, '.config');
  fs.mkdirSync(configDir, { recursive: true });

  const dbPath = path.join(configDir, 'keel.db');
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS file_index (
      file_path TEXT PRIMARY KEY,
      last_indexed_at INTEGER NOT NULL,
      chunk_count INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      detail TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      messages TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function getFileIndex(brainPath: string, filePath: string): FileIndex | null {
  const d = getDb(brainPath);
  const row = d.prepare('SELECT * FROM file_index WHERE file_path = ?').get(filePath) as
    | { file_path: string; last_indexed_at: number; chunk_count: number }
    | undefined;

  if (!row) return null;
  return {
    filePath: row.file_path,
    lastIndexedAt: row.last_indexed_at,
    chunkCount: row.chunk_count,
  };
}

export function updateFileIndex(
  brainPath: string,
  filePath: string,
  chunkCount: number
): void {
  const d = getDb(brainPath);
  d.prepare(
    `INSERT OR REPLACE INTO file_index (file_path, last_indexed_at, chunk_count)
     VALUES (?, ?, ?)`
  ).run(filePath, Date.now(), chunkCount);
}

export function removeFileIndex(brainPath: string, filePath: string): void {
  const d = getDb(brainPath);
  d.prepare('DELETE FROM file_index WHERE file_path = ?').run(filePath);
}

export function getAllFileIndexes(brainPath: string): FileIndex[] {
  const d = getDb(brainPath);
  const rows = d.prepare('SELECT * FROM file_index').all() as Array<{
    file_path: string;
    last_indexed_at: number;
    chunk_count: number;
  }>;

  return rows.map((r) => ({
    filePath: r.file_path,
    lastIndexedAt: r.last_indexed_at,
    chunkCount: r.chunk_count,
  }));
}

export function logActivity(
  brainPath: string,
  action: string,
  detail?: string
): void {
  const d = getDb(brainPath);
  d.prepare(
    'INSERT INTO activity_log (action, detail, created_at) VALUES (?, ?, ?)'
  ).run(action, detail || null, Date.now());
}

export function getRecentActivity(
  brainPath: string,
  limit: number = 50
): ActivityLogEntry[] {
  const d = getDb(brainPath);
  const rows = d
    .prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?')
    .all(limit) as Array<{
    id: number;
    action: string;
    detail: string | null;
    created_at: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    detail: r.detail || '',
    createdAt: r.created_at,
  }));
}

// --- Chat Session Persistence ---

export function saveChatSession(
  brainPath: string,
  sessionId: string,
  messages: Message[]
): void {
  const d = getDb(brainPath);
  const now = Date.now();
  d.prepare(
    `INSERT OR REPLACE INTO chat_sessions (id, messages, created_at, updated_at)
     VALUES (?, ?, COALESCE((SELECT created_at FROM chat_sessions WHERE id = ?), ?), ?)`
  ).run(sessionId, JSON.stringify(messages), sessionId, now, now);
}

export function loadChatSession(
  brainPath: string,
  sessionId: string
): Message[] | null {
  const d = getDb(brainPath);
  const row = d
    .prepare('SELECT messages FROM chat_sessions WHERE id = ?')
    .get(sessionId) as { messages: string } | undefined;

  if (!row) return null;
  try {
    return JSON.parse(row.messages);
  } catch {
    return null;
  }
}

export function getLatestSessionId(brainPath: string): string | null {
  const d = getDb(brainPath);
  const row = d
    .prepare('SELECT id FROM chat_sessions ORDER BY updated_at DESC LIMIT 1')
    .get() as { id: string } | undefined;
  return row?.id || null;
}

export function listChatSessions(
  brainPath: string,
  limit: number = 20
): Array<{ id: string; messageCount: number; updatedAt: number }> {
  const d = getDb(brainPath);
  const rows = d
    .prepare('SELECT id, messages, updated_at FROM chat_sessions ORDER BY updated_at DESC LIMIT ?')
    .all(limit) as Array<{ id: string; messages: string; updated_at: number }>;

  return rows.map((r) => {
    let messageCount = 0;
    try { messageCount = JSON.parse(r.messages).length; } catch {}
    return { id: r.id, messageCount, updatedAt: r.updated_at };
  });
}
