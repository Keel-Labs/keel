import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { authRoutes } from './routes/auth.js';
import { settingsRoutes } from './routes/settings.js';
import { chatRoutes } from './routes/chat.js';
import { brainRoutes } from './routes/brain.js';
import { reminderRoutes } from './routes/reminders.js';
import { workflowRoutes } from './routes/workflows.js';
import { fileRoutes } from './routes/files.js';
import { migrateRoutes } from './routes/migrate.js';
import { teamBrainRoutes } from './routes/team-brain.js';

export async function buildApp(
  options: FastifyServerOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
    ...options,
  });

  const corsOrigin = process.env.CORS_ORIGIN;
  await app.register(cors, {
    origin: corsOrigin
      ? corsOrigin.split(',').map((origin) => origin.trim())
      : true,
    credentials: true,
  });

  await app.register(multipart, {
    limits: {
      fileSize: 20 * 1024 * 1024,
    },
  });

  app.get('/api/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  await app.register(authRoutes);
  await app.register(settingsRoutes);
  await app.register(chatRoutes);
  await app.register(brainRoutes);
  await app.register(reminderRoutes);
  await app.register(workflowRoutes);
  await app.register(fileRoutes);
  await app.register(migrateRoutes);
  await app.register(teamBrainRoutes);

  return app;
}
