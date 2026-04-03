import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { requireAuth, getUser } from '../middleware/auth.js';

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // Get settings
  app.get('/api/settings', async (request) => {
    const { userId } = getUser(request);
    const [settings] = await db
      .select()
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, userId))
      .limit(1);

    if (!settings) {
      // Create defaults
      const [created] = await db
        .insert(schema.userSettings)
        .values({ userId })
        .returning();
      return formatSettings(created);
    }

    return formatSettings(settings);
  });

  // Update settings
  app.put('/api/settings', async (request) => {
    const { userId } = getUser(request);
    const body = request.body as Record<string, any>;

    const updateData: Record<string, any> = { updatedAt: new Date() };

    // Only update fields that are provided
    const allowedFields = [
      'provider',
      'anthropicApiKey',
      'claudeModel',
      'openaiApiKey',
      'openaiModel',
      'openrouterApiKey',
      'openrouterModel',
      'openrouterBaseUrl',
      'ollamaModel',
      'dailyBriefTime',
      'eodTime',
      'timezone',
      'userName',
    ];

    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field];
      }
    }

    const [updated] = await db
      .update(schema.userSettings)
      .set(updateData)
      .where(eq(schema.userSettings.userId, userId))
      .returning();

    return formatSettings(updated);
  });
}

function formatSettings(row: any) {
  return {
    provider: row.provider,
    anthropicApiKey: row.anthropicApiKey || '',
    claudeModel: row.claudeModel || 'claude-sonnet-4-20250514',
    openaiApiKey: row.openaiApiKey || '',
    openaiModel: row.openaiModel || 'gpt-4o',
    openrouterApiKey: row.openrouterApiKey || '',
    openrouterModel: row.openrouterModel || '',
    openrouterBaseUrl: row.openrouterBaseUrl || 'https://openrouter.ai/api/v1',
    ollamaModel: row.ollamaModel || 'llama3.2',
    dailyBriefTime: row.dailyBriefTime || '08:00',
    eodTime: row.eodTime || '17:30',
    timezone: row.timezone || '',
    userName: row.userName || '',
  };
}
