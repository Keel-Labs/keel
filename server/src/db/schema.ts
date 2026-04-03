import {
  pgTable,
  text,
  integer,
  serial,
  timestamp,
  boolean,
  jsonb,
  varchar,
  index,
  uniqueIndex,
  bigint,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// --- Users ---

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: varchar('name', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// --- User Settings ---

export const userSettings = pgTable('user_settings', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  provider: varchar('provider', { length: 50 }).default('claude').notNull(),
  anthropicApiKey: text('anthropic_api_key').default(''),
  claudeModel: varchar('claude_model', { length: 100 }).default('claude-sonnet-4-20250514'),
  openaiApiKey: text('openai_api_key').default(''),
  openaiModel: varchar('openai_model', { length: 100 }).default('gpt-4o'),
  openrouterApiKey: text('openrouter_api_key').default(''),
  openrouterModel: varchar('openrouter_model', { length: 200 }).default(''),
  openrouterBaseUrl: varchar('openrouter_base_url', { length: 500 }).default('https://openrouter.ai/api/v1'),
  ollamaModel: varchar('ollama_model', { length: 100 }).default('llama3.2'),
  dailyBriefTime: varchar('daily_brief_time', { length: 10 }).default('08:00'),
  eodTime: varchar('eod_time', { length: 10 }).default('17:30'),
  timezone: varchar('timezone', { length: 100 }).default(''),
  userName: varchar('user_name', { length: 255 }).default(''),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// --- Brain Files (replaces local file system) ---

export const brainFiles = pgTable(
  'brain_files',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    path: text('path').notNull(), // e.g. 'keel.md', 'projects/keel/context.md'
    content: text('content').notNull(),
    hash: varchar('hash', { length: 64 }).notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('brain_files_user_path').on(table.userId, table.path),
    index('brain_files_user').on(table.userId),
  ]
);

// --- Chunks (for search / context assembly) ---

export const chunks = pgTable(
  'chunks',
  {
    id: serial('id').primaryKey(),
    fileId: integer('file_id')
      .references(() => brainFiles.id, { onDelete: 'cascade' })
      .notNull(),
    breadcrumb: text('breadcrumb').notNull(),
    content: text('content').notNull(),
    startLine: integer('start_line'),
    endLine: integer('end_line'),
    // pgvector: store embedding as float[] — actual vector column added via raw SQL migration
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('chunks_file_id').on(table.fileId)]
);

// --- Chat Sessions ---

export const chatSessions = pgTable(
  'chat_sessions',
  {
    id: text('id').primaryKey(), // session-{timestamp}-{random}
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    messages: jsonb('messages').notNull(), // Message[] JSON
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('chat_sessions_user').on(table.userId),
    index('chat_sessions_updated').on(table.updatedAt),
  ]
);

// --- Activity Log ---

export const activityLog = pgTable(
  'activity_log',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    action: text('action').notNull(),
    detail: text('detail'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('activity_log_user').on(table.userId)]
);

// --- Reminders ---

export const reminders = pgTable(
  'reminders',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    message: text('message').notNull(),
    dueAt: bigint('due_at', { mode: 'number' }).notNull(), // ms timestamp
    recurring: varchar('recurring', { length: 20 }), // 'daily' | 'weekly' | 'monthly'
    fired: boolean('fired').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('reminders_user').on(table.userId),
    index('reminders_due').on(table.dueAt),
  ]
);

// --- Sync State (Google Calendar, etc.) ---

export const syncState = pgTable(
  'sync_state',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    connector: varchar('connector', { length: 100 }).notNull(),
    cursor: text('cursor'),
    lastSync: bigint('last_sync', { mode: 'number' }),
    status: varchar('status', { length: 50 }).default('idle'),
    meta: text('meta'), // JSON string
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('sync_state_user_connector').on(table.userId, table.connector),
  ]
);

// --- S3 File References ---

export const fileUploads = pgTable(
  'file_uploads',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    s3Key: text('s3_key').notNull(),
    filename: varchar('filename', { length: 500 }).notNull(),
    contentType: varchar('content_type', { length: 100 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('file_uploads_user').on(table.userId)]
);
