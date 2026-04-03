import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://keel:keel@localhost:5432/keel',
  max: 20,
});

export const db = drizzle(pool, { schema });

export { schema };

// Raw SQL for pgvector setup (run once during migration)
export const VECTOR_SETUP_SQL = `
  CREATE EXTENSION IF NOT EXISTS vector;
  ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedding vector(768);
  CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
`;

export async function runVectorSetup(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(VECTOR_SETUP_SQL);
  } finally {
    client.release();
  }
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
