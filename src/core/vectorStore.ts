import * as lancedb from '@lancedb/lancedb';
import * as path from 'path';
import * as fs from 'fs';
import type { EmbeddedChunk, SearchResult } from '../shared/types';

const TABLE_NAME = 'keel_chunks';

let connection: lancedb.Connection | null = null;
let table: lancedb.Table | null = null;

async function getConnection(brainPath: string): Promise<lancedb.Connection> {
  if (connection) return connection;
  const dbPath = path.join(brainPath, '.config', 'lancedb');
  fs.mkdirSync(dbPath, { recursive: true });
  connection = await lancedb.connect(dbPath);
  return connection;
}

async function getTable(brainPath: string): Promise<lancedb.Table | null> {
  if (table) return table;
  const conn = await getConnection(brainPath);
  const tableNames = await conn.tableNames();
  if (tableNames.includes(TABLE_NAME)) {
    table = await conn.openTable(TABLE_NAME);
    return table;
  }
  return null;
}

async function ensureTable(
  brainPath: string,
  sampleVector: number[]
): Promise<lancedb.Table> {
  const existing = await getTable(brainPath);
  if (existing) return existing;

  const conn = await getConnection(brainPath);
  table = await conn.createTable(TABLE_NAME, [
    {
      id: 'init',
      filePath: '',
      chunkIndex: 0,
      text: '',
      vector: sampleVector,
      createdAt: 0,
    },
  ]);

  // Delete the init row
  await table.delete('id = "init"');
  return table;
}

export async function upsertChunks(
  brainPath: string,
  chunks: EmbeddedChunk[]
): Promise<void> {
  if (chunks.length === 0) return;

  const tbl = await ensureTable(brainPath, chunks[0].vector);

  // Delete existing chunks for the same file paths
  const filePaths = [...new Set(chunks.map((c) => c.filePath))];
  for (const fp of filePaths) {
    try {
      await tbl.delete(`filePath = "${fp}"`);
    } catch {
      // Table might be empty, that's fine
    }
  }

  // Add the new chunks
  const rows = chunks.map((c) => ({
    id: c.id,
    filePath: c.filePath,
    chunkIndex: c.chunkIndex,
    text: c.text,
    vector: c.vector,
    createdAt: c.createdAt,
  }));

  await tbl.add(rows);
}

export async function search(
  brainPath: string,
  queryVector: number[],
  topK: number = 8
): Promise<SearchResult[]> {
  const tbl = await getTable(brainPath);
  if (!tbl) return [];

  try {
    const results = await tbl
      .search(queryVector)
      .limit(topK)
      .toArray();

    return results.map((r: Record<string, unknown>) => ({
      chunk: {
        id: r.id as string,
        filePath: r.filePath as string,
        chunkIndex: r.chunkIndex as number,
        text: r.text as string,
        vector: r.vector as number[],
        createdAt: r.createdAt as number,
      },
      score: r._distance as number,
    }));
  } catch {
    return [];
  }
}

export async function deleteByFile(
  brainPath: string,
  filePath: string
): Promise<void> {
  const tbl = await getTable(brainPath);
  if (!tbl) return;

  try {
    await tbl.delete(`filePath = "${filePath}"`);
  } catch {
    // Ignore errors on empty/missing table
  }
}

export function resetConnection(): void {
  if (table) {
    table.close();
    table = null;
  }
  connection = null;
}
