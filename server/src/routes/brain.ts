import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq, and, like } from 'drizzle-orm';
import { requireAuth, getUser } from '../middleware/auth.js';
import crypto from 'crypto';

export async function brainRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // List files in a directory
  app.get('/api/brain/files', async (request) => {
    const { userId } = getUser(request);
    const { dir } = request.query as { dir?: string };

    const prefix = dir ? `${dir}/` : '';

    const files = await db
      .select({ path: schema.brainFiles.path, updatedAt: schema.brainFiles.updatedAt })
      .from(schema.brainFiles)
      .where(
        and(
          eq(schema.brainFiles.userId, userId),
          dir ? like(schema.brainFiles.path, `${prefix}%`) : undefined
        )
      );

    // Build directory-like structure
    const entries: Array<{ name: string; isDir: boolean; path: string }> = [];
    const seenDirs = new Set<string>();

    for (const file of files) {
      const relativePath = prefix ? file.path.slice(prefix.length) : file.path;
      const slashIndex = relativePath.indexOf('/');

      if (slashIndex === -1) {
        // Direct file
        entries.push({ name: relativePath, isDir: false, path: file.path });
      } else {
        // Subdirectory
        const dirName = relativePath.slice(0, slashIndex);
        if (!seenDirs.has(dirName)) {
          seenDirs.add(dirName);
          entries.push({ name: dirName, isDir: true, path: `${prefix}${dirName}` });
        }
      }
    }

    return entries;
  });

  // Read file
  app.get('/api/brain/files/*', async (request, reply) => {
    const { userId } = getUser(request);
    const { '*': filePath } = request.params as { '*': string };

    if (filePath.includes('..')) {
      return reply.code(400).send({ error: 'Invalid path' });
    }

    const [file] = await db
      .select()
      .from(schema.brainFiles)
      .where(
        and(
          eq(schema.brainFiles.userId, userId),
          eq(schema.brainFiles.path, filePath)
        )
      )
      .limit(1);

    if (!file) {
      return reply.code(404).send({ error: 'File not found' });
    }

    return { path: file.path, content: file.content, updatedAt: file.updatedAt?.getTime() };
  });

  // Write file
  app.put('/api/brain/files/*', async (request, reply) => {
    const { userId } = getUser(request);
    const { '*': filePath } = request.params as { '*': string };
    const { content } = request.body as { content: string };

    if (filePath.includes('..')) {
      return reply.code(400).send({ error: 'Invalid path' });
    }

    const hash = crypto.createHash('sha256').update(content).digest('hex');

    await db
      .insert(schema.brainFiles)
      .values({ userId, path: filePath, content, hash })
      .onConflictDoUpdate({
        target: [schema.brainFiles.userId, schema.brainFiles.path],
        set: { content, hash, updatedAt: new Date() },
      });

    return { ok: true };
  });

  // Delete file
  app.delete('/api/brain/files/*', async (request, reply) => {
    const { userId } = getUser(request);
    const { '*': filePath } = request.params as { '*': string };

    if (filePath.includes('..')) {
      return reply.code(400).send({ error: 'Invalid path' });
    }

    await db
      .delete(schema.brainFiles)
      .where(
        and(
          eq(schema.brainFiles.userId, userId),
          eq(schema.brainFiles.path, filePath)
        )
      );

    return { ok: true };
  });

  // Search brain files (full-text)
  app.post('/api/brain/search', async (request) => {
    const { userId } = getUser(request);
    const { query } = request.body as { query: string };

    // Search chunks by content match
    const results = await db
      .select({
        id: schema.chunks.id,
        breadcrumb: schema.chunks.breadcrumb,
        content: schema.chunks.content,
        filePath: schema.brainFiles.path,
        startLine: schema.chunks.startLine,
        endLine: schema.chunks.endLine,
      })
      .from(schema.chunks)
      .innerJoin(schema.brainFiles, eq(schema.chunks.fileId, schema.brainFiles.id))
      .where(eq(schema.brainFiles.userId, userId))
      .limit(20);

    // Simple keyword matching for now (TODO: use pgvector similarity search)
    const queryLower = query.toLowerCase();
    const matched = results.filter(
      (r) =>
        r.content.toLowerCase().includes(queryLower) ||
        r.breadcrumb.toLowerCase().includes(queryLower)
    );

    return matched.slice(0, 10).map((r) => ({
      filePath: r.filePath,
      breadcrumb: r.breadcrumb,
      content: r.content.slice(0, 500),
      startLine: r.startLine,
      endLine: r.endLine,
    }));
  });
}
