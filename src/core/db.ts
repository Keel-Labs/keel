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

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    -- Legacy file index (kept for compatibility, hash column added)
    CREATE TABLE IF NOT EXISTS file_index (
      file_path       TEXT PRIMARY KEY,
      last_indexed_at INTEGER NOT NULL,
      chunk_count     INTEGER NOT NULL,
      hash            TEXT
    );

    -- Source of truth: raw file content + hash for change detection
    CREATE TABLE IF NOT EXISTS files (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      path       TEXT UNIQUE NOT NULL,
      content    TEXT NOT NULL,
      hash       TEXT NOT NULL,
      updated_at INTEGER DEFAULT (unixepoch())
    );

    -- AST-based chunks with breadcrumbs (SQLite is now source of truth)
    CREATE TABLE IF NOT EXISTS chunks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id     INTEGER REFERENCES files(id) ON DELETE CASCADE,
      breadcrumb  TEXT NOT NULL,
      content     TEXT NOT NULL,
      start_line  INTEGER,
      end_line    INTEGER,
      created_at  INTEGER DEFAULT (unixepoch())
    );

    -- FTS5 full-text search over chunks
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      content,
      breadcrumb,
      content=chunks,
      content_rowid=id
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      action     TEXT NOT NULL,
      detail     TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id         TEXT PRIMARY KEY,
      messages   TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // Migrate file_index: add hash column if missing
  try {
    db.exec(`ALTER TABLE file_index ADD COLUMN hash TEXT`);
  } catch {
    // Column already exists — ignore
  }

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// --- File Index ---

export function getFileIndex(brainPath: string, filePath: string): FileIndex | null {
  const d = getDb(brainPath);
  const row = d.prepare('SELECT * FROM file_index WHERE file_path = ?').get(filePath) as
    | { file_path: string; last_indexed_at: number; chunk_count: number; hash?: string }
    | undefined;

  if (!row) return null;
  return {
    filePath: row.file_path,
    lastIndexedAt: row.last_indexed_at,
    chunkCount: row.chunk_count,
    hash: row.hash,
  } as FileIndex & { hash?: string };
}

export function updateFileIndex(
  brainPath: string,
  filePath: string,
  chunkCount: number,
  hash?: string
): void {
  const d = getDb(brainPath);
  d.prepare(
    `INSERT OR REPLACE INTO file_index (file_path, last_indexed_at, chunk_count, hash)
     VALUES (?, ?, ?, ?)`
  ).run(filePath, Date.now(), chunkCount, hash ?? null);
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
    hash?: string;
  }>;

  return rows.map((r) => ({
    filePath: r.file_path,
    lastIndexedAt: r.last_indexed_at,
    chunkCount: r.chunk_count,
  }));
}

// --- Files + Chunks (source of truth) ---

export function upsertFileRecord(
  brainPath: string,
  filePath: string,
  content: string,
  hash: string
): number {
  const d = getDb(brainPath);
  const now = Math.floor(Date.now() / 1000);
  d.prepare(
    `INSERT INTO files (path, content, hash, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET content=excluded.content, hash=excluded.hash, updated_at=excluded.updated_at`
  ).run(filePath, content, hash, now);
  const row = d.prepare('SELECT id FROM files WHERE path = ?').get(filePath) as { id: number };
  return row.id;
}

export function deleteChunksByFile(brainPath: string, fileId: number): void {
  const d = getDb(brainPath);
  // Remove from FTS first
  d.prepare(`DELETE FROM chunks_fts WHERE rowid IN (SELECT id FROM chunks WHERE file_id = ?)`).run(fileId);
  d.prepare('DELETE FROM chunks WHERE file_id = ?').run(fileId);
}

export function insertChunks(
  brainPath: string,
  fileId: number,
  chunks: Array<{ breadcrumb: string; content: string; startLine?: number; endLine?: number }>
): void {
  const d = getDb(brainPath);
  const now = Math.floor(Date.now() / 1000);
  const insert = d.prepare(
    `INSERT INTO chunks (file_id, breadcrumb, content, start_line, end_line, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertFts = d.prepare(
    `INSERT INTO chunks_fts (rowid, content, breadcrumb) VALUES (?, ?, ?)`
  );

  const insertMany = d.transaction((items: typeof chunks) => {
    for (const chunk of items) {
      const result = insert.run(
        fileId, chunk.breadcrumb, chunk.content,
        chunk.startLine ?? null, chunk.endLine ?? null, now
      );
      insertFts.run(result.lastInsertRowid, chunk.content, chunk.breadcrumb);
    }
  });
  insertMany(chunks);
}

export interface ChunkRow {
  id: number;
  fileId: number;
  filePath: string;
  breadcrumb: string;
  content: string;
  startLine: number | null;
  endLine: number | null;
  updatedAt: number;
}

export function searchChunksFts(brainPath: string, query: string, limit = 10): ChunkRow[] {
  const d = getDb(brainPath);
  try {
    const rows = d.prepare(`
      SELECT c.id, c.file_id as fileId, f.path as filePath, c.breadcrumb, c.content,
             c.start_line as startLine, c.end_line as endLine, f.updated_at as updatedAt
      FROM chunks_fts
      JOIN chunks c ON chunks_fts.rowid = c.id
      JOIN files f ON c.file_id = f.id
      WHERE chunks_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit) as ChunkRow[];
    return rows;
  } catch {
    return [];
  }
}

export function getChunksByIds(brainPath: string, ids: number[]): ChunkRow[] {
  if (ids.length === 0) return [];
  const d = getDb(brainPath);
  const placeholders = ids.map(() => '?').join(',');
  return d.prepare(`
    SELECT c.id, c.file_id as fileId, f.path as filePath, c.breadcrumb, c.content,
           c.start_line as startLine, c.end_line as endLine, f.updated_at as updatedAt
    FROM chunks c
    JOIN files f ON c.file_id = f.id
    WHERE c.id IN (${placeholders})
  `).all(...ids) as ChunkRow[];
}

// --- Activity Log ---

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
