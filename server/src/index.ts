import Fastify from 'fastify';
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
import { closeDb } from './db/index.js';
import { migrate } from './db/migrate.js';

const PORT = parseInt(process.env.PORT || '3001');
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  // Auto-migrate on startup (idempotent CREATE IF NOT EXISTS)
  if (process.env.NODE_ENV === 'production' || process.env.AUTO_MIGRATE === 'true') {
    await migrate();
  }
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  // Plugins
  const corsOrigin = process.env.CORS_ORIGIN;
  await app.register(cors, {
    origin: corsOrigin
      ? corsOrigin.split(',').map((o) => o.trim())
      : true, // Allow all in dev
    credentials: true,
  });

  await app.register(multipart, {
    limits: {
      fileSize: 20 * 1024 * 1024, // 20MB max file size
    },
  });

  // Health check
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Routes
  await app.register(authRoutes);
  await app.register(settingsRoutes);
  await app.register(chatRoutes);
  await app.register(brainRoutes);
  await app.register(reminderRoutes);
  await app.register(workflowRoutes);
  await app.register(fileRoutes);
  await app.register(migrateRoutes);

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down...');
    await app.close();
    await closeDb();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`Keel API server running on ${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
