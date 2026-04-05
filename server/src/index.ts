import { closeDb } from './db/index.js';
import { migrate } from './db/migrate.js';
import { buildApp } from './app.js';

const PORT = parseInt(process.env.PORT || '3001');
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  // Auto-migrate on startup (idempotent CREATE IF NOT EXISTS)
  if (process.env.NODE_ENV === 'production' || process.env.AUTO_MIGRATE === 'true') {
    await migrate();
  }
  const app = await buildApp();

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
