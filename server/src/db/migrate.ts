import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from './schema.js';

/**
 * Run database migrations: create tables + enable pgvector.
 * Called on server startup in production or via `npm run db:setup`.
 */
export async function migrate(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL || 'postgresql://keel:keel@localhost:5432/keel';

  const pool = new pg.Pool({ connectionString, max: 2 });
  const db = drizzle(pool, { schema });

  console.log('[migrate] Running database setup...');

  // Create pgvector extension
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  console.log('[migrate] pgvector extension ready');

  // Create tables using raw SQL (idempotent CREATE IF NOT EXISTS)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_settings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
      provider VARCHAR(50) NOT NULL DEFAULT 'claude',
      anthropic_api_key TEXT DEFAULT '',
      claude_model VARCHAR(100) DEFAULT 'claude-sonnet-4-20250514',
      openai_api_key TEXT DEFAULT '',
      openai_model VARCHAR(100) DEFAULT 'gpt-4o',
      openrouter_api_key TEXT DEFAULT '',
      openrouter_model VARCHAR(200) DEFAULT '',
      openrouter_base_url VARCHAR(500) DEFAULT 'https://openrouter.ai/api/v1',
      ollama_model VARCHAR(100) DEFAULT 'llama3.2',
      daily_brief_time VARCHAR(10) DEFAULT '08:00',
      eod_time VARCHAR(10) DEFAULT '17:30',
      timezone VARCHAR(100) DEFAULT '',
      user_name VARCHAR(255) DEFAULT '',
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS brain_files (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      content TEXT NOT NULL,
      hash VARCHAR(64) NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS brain_files_user_path ON brain_files(user_id, path)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS brain_files_user ON brain_files(user_id)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS chunks (
      id SERIAL PRIMARY KEY,
      file_id INTEGER NOT NULL REFERENCES brain_files(id) ON DELETE CASCADE,
      breadcrumb TEXT NOT NULL,
      content TEXT NOT NULL,
      start_line INTEGER,
      end_line INTEGER,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS chunks_file_id ON chunks(file_id)
  `);
  // Add vector column if not exists
  await db.execute(sql`
    ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedding vector(768)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      messages JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS chat_sessions_user ON chat_sessions(user_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS chat_sessions_updated ON chat_sessions(updated_at)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS activity_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      detail TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS activity_log_user ON activity_log(user_id)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS reminders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      due_at BIGINT NOT NULL,
      recurring VARCHAR(20),
      fired BOOLEAN DEFAULT FALSE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS reminders_user ON reminders(user_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS reminders_due ON reminders(due_at)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sync_state (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      connector VARCHAR(100) NOT NULL,
      cursor TEXT,
      last_sync BIGINT,
      status VARCHAR(50) DEFAULT 'idle',
      meta TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS sync_state_user_connector ON sync_state(user_id, connector)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS file_uploads (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      s3_key TEXT NOT NULL,
      filename VARCHAR(500) NOT NULL,
      content_type VARCHAR(100) NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS file_uploads_user ON file_uploads(user_id)
  `);

  // Vector index (only create if enough rows, otherwise Postgres handles seq scan)
  // Using ivfflat — for small datasets this is fine; switch to hnsw if scaling
  try {
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks
        USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
    `);
  } catch {
    // ivfflat index creation fails if no rows exist; safe to skip
    console.log('[migrate] Skipping vector index (will auto-create when data exists)');
  }

  console.log('[migrate] Database setup complete');
  await pool.end();
}

// Run directly: node dist/db/migrate.js
const isDirectRun = process.argv[1]?.endsWith('migrate.js');
if (isDirectRun) {
  migrate().catch((err) => {
    console.error('[migrate] Failed:', err);
    process.exit(1);
  });
}
