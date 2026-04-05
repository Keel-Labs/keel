import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq, like } from 'drizzle-orm';
import { requireAuth, getUser } from '../middleware/auth.js';
import crypto from 'crypto';

export async function teamBrainRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // List team files in a directory
  app.get('/api/team/files', async (request) => {
    const { dir } = request.query as { dir?: string };
    const prefix = dir ? `${dir}/` : '';

    const files = await db
      .select({ path: schema.teamBrainFiles.path, updatedAt: schema.teamBrainFiles.updatedAt })
      .from(schema.teamBrainFiles)
      .where(dir ? like(schema.teamBrainFiles.path, `${prefix}%`) : undefined);

    const entries: Array<{ name: string; isDir: boolean; path: string }> = [];
    const seenDirs = new Set<string>();

    for (const file of files) {
      const relativePath = prefix ? file.path.slice(prefix.length) : file.path;
      const slashIndex = relativePath.indexOf('/');

      if (slashIndex === -1) {
        entries.push({ name: relativePath, isDir: false, path: file.path });
      } else {
        const dirName = relativePath.slice(0, slashIndex);
        if (!seenDirs.has(dirName)) {
          seenDirs.add(dirName);
          entries.push({ name: dirName, isDir: true, path: `${prefix}${dirName}` });
        }
      }
    }

    return entries;
  });

  // Read team file
  app.get('/api/team/file', async (request, reply) => {
    const { path: filePath } = request.query as { path: string };

    if (filePath.includes('..')) {
      return reply.code(400).send({ error: 'Invalid path' });
    }

    const [file] = await db
      .select()
      .from(schema.teamBrainFiles)
      .where(eq(schema.teamBrainFiles.path, filePath))
      .limit(1);

    if (!file) {
      return reply.code(404).send({ error: 'File not found' });
    }

    return { path: file.path, content: file.content, updatedAt: file.updatedAt?.getTime() };
  });

  // Write team file (any authenticated user can write)
  app.put('/api/team/file', async (request, reply) => {
    const { userId } = getUser(request);
    const { path: filePath, content } = request.body as { path: string; content: string };

    if (filePath.includes('..')) {
      return reply.code(400).send({ error: 'Invalid path' });
    }

    const hash = crypto.createHash('sha256').update(content).digest('hex');

    await db
      .insert(schema.teamBrainFiles)
      .values({ path: filePath, content, hash, lastEditedBy: userId })
      .onConflictDoUpdate({
        target: [schema.teamBrainFiles.path],
        set: { content, hash, lastEditedBy: userId, updatedAt: new Date() },
      });

    return { ok: true };
  });

  // Delete team file
  app.delete('/api/team/file', async (request, reply) => {
    const { path: filePath } = request.query as { path: string };

    if (filePath.includes('..')) {
      return reply.code(400).send({ error: 'Invalid path' });
    }

    await db
      .delete(schema.teamBrainFiles)
      .where(eq(schema.teamBrainFiles.path, filePath));

    return { ok: true };
  });
}
