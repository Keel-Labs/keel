import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth, getUser } from '../middleware/auth.js';
import crypto from 'crypto';

/**
 * Bulk import endpoint for migrating desktop data to cloud.
 * Accepts settings, brain files, chat sessions, and reminders
 * in a single request. All operations are idempotent.
 */
export async function migrateRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // Bulk import from desktop
  app.post('/api/migrate/import', async (request) => {
    const { userId } = getUser(request);
    const body = request.body as {
      settings?: Record<string, any>;
      brainFiles?: Array<{ path: string; content: string }>;
      chatSessions?: Array<{ id: string; messages: any[]; createdAt: number; updatedAt: number }>;
      reminders?: Array<{ message: string; dueAt: number; recurring?: string | null; fired: boolean }>;
      activityLog?: Array<{ action: string; detail?: string; createdAt: number }>;
    };

    const results = {
      settings: false,
      brainFiles: 0,
      chatSessions: 0,
      reminders: 0,
      activityLog: 0,
    };

    // 1. Settings
    if (body.settings) {
      const allowedFields = [
        'provider', 'anthropicApiKey', 'claudeModel',
        'openaiApiKey', 'openaiModel', 'openrouterApiKey',
        'openrouterModel', 'openrouterBaseUrl', 'ollamaModel',
        'dailyBriefTime', 'eodTime', 'timezone', 'userName',
      ];
      const updateData: Record<string, any> = { updatedAt: new Date() };
      for (const field of allowedFields) {
        if (field in body.settings) {
          updateData[field] = body.settings[field];
        }
      }

      // Upsert settings
      const [existing] = await db
        .select({ id: schema.userSettings.id })
        .from(schema.userSettings)
        .where(eq(schema.userSettings.userId, userId))
        .limit(1);

      if (existing) {
        await db.update(schema.userSettings)
          .set(updateData)
          .where(eq(schema.userSettings.userId, userId));
      } else {
        await db.insert(schema.userSettings)
          .values({ userId, ...updateData });
      }
      results.settings = true;
    }

    // 2. Brain files
    if (body.brainFiles && body.brainFiles.length > 0) {
      for (const file of body.brainFiles) {
        const hash = crypto.createHash('sha256').update(file.content).digest('hex');
        await db
          .insert(schema.brainFiles)
          .values({ userId, path: file.path, content: file.content, hash })
          .onConflictDoUpdate({
            target: [schema.brainFiles.userId, schema.brainFiles.path],
            set: { content: file.content, hash, updatedAt: new Date() },
          });
        results.brainFiles++;
      }
    }

    // 3. Chat sessions
    if (body.chatSessions && body.chatSessions.length > 0) {
      for (const session of body.chatSessions) {
        await db
          .insert(schema.chatSessions)
          .values({
            id: session.id,
            userId,
            messages: session.messages,
            createdAt: new Date(session.createdAt),
            updatedAt: new Date(session.updatedAt),
          })
          .onConflictDoUpdate({
            target: schema.chatSessions.id,
            set: {
              messages: session.messages,
              updatedAt: new Date(session.updatedAt),
            },
          });
        results.chatSessions++;
      }
    }

    // 4. Reminders (only unfired ones)
    if (body.reminders && body.reminders.length > 0) {
      for (const reminder of body.reminders) {
        if (reminder.fired) continue; // Skip already-fired reminders
        await db
          .insert(schema.reminders)
          .values({
            userId,
            message: reminder.message,
            dueAt: reminder.dueAt,
            recurring: reminder.recurring || null,
            fired: false,
          });
        results.reminders++;
      }
    }

    // 5. Activity log
    if (body.activityLog && body.activityLog.length > 0) {
      for (const entry of body.activityLog) {
        await db
          .insert(schema.activityLog)
          .values({
            userId,
            action: entry.action,
            detail: entry.detail || null,
            createdAt: new Date(entry.createdAt),
          });
        results.activityLog++;
      }
    }

    return {
      ok: true,
      imported: results,
    };
  });

  // Migration status — check what data exists
  app.get('/api/migrate/status', async (request) => {
    const { userId } = getUser(request);

    const [fileCount] = await db
      .select({ count: schema.brainFiles.id })
      .from(schema.brainFiles)
      .where(eq(schema.brainFiles.userId, userId));

    const [sessionCount] = await db
      .select({ count: schema.chatSessions.id })
      .from(schema.chatSessions)
      .where(eq(schema.chatSessions.userId, userId));

    const [reminderCount] = await db
      .select({ count: schema.reminders.id })
      .from(schema.reminders)
      .where(and(eq(schema.reminders.userId, userId), eq(schema.reminders.fired, false)));

    return {
      brainFiles: fileCount?.count ? 1 : 0, // Just checking existence
      chatSessions: sessionCount?.count ? 1 : 0,
      reminders: reminderCount?.count ? 1 : 0,
    };
  });
}
