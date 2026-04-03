import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth, getUser } from '../middleware/auth.js';
import { uploadFile, getFileUrl, deleteFile } from '../services/storage.js';

export async function fileRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // Upload file
  app.post('/api/files/upload', async (request, reply) => {
    const { userId } = getUser(request);
    const data = await request.file();

    if (!data) {
      return reply.code(400).send({ error: 'No file provided' });
    }

    const buffer = await data.toBuffer();
    const key = await uploadFile(userId, data.filename, data.mimetype, buffer);

    const [record] = await db
      .insert(schema.fileUploads)
      .values({
        userId,
        s3Key: key,
        filename: data.filename,
        contentType: data.mimetype,
        sizeBytes: buffer.length,
      })
      .returning();

    return {
      id: record.id,
      filename: record.filename,
      contentType: record.contentType,
      sizeBytes: record.sizeBytes,
    };
  });

  // List files
  app.get('/api/files', async (request) => {
    const { userId } = getUser(request);
    const files = await db
      .select()
      .from(schema.fileUploads)
      .where(eq(schema.fileUploads.userId, userId))
      .orderBy(schema.fileUploads.createdAt);

    return files.map((f) => ({
      id: f.id,
      filename: f.filename,
      contentType: f.contentType,
      sizeBytes: f.sizeBytes,
      createdAt: f.createdAt?.getTime(),
    }));
  });

  // Get file (signed URL redirect)
  app.get('/api/files/:id', async (request, reply) => {
    const { userId } = getUser(request);
    const { id } = request.params as { id: string };

    const [file] = await db
      .select()
      .from(schema.fileUploads)
      .where(
        and(
          eq(schema.fileUploads.id, parseInt(id)),
          eq(schema.fileUploads.userId, userId)
        )
      )
      .limit(1);

    if (!file) {
      return reply.code(404).send({ error: 'File not found' });
    }

    const url = await getFileUrl(file.s3Key);
    return reply.redirect(url);
  });

  // Delete file
  app.delete('/api/files/:id', async (request, reply) => {
    const { userId } = getUser(request);
    const { id } = request.params as { id: string };

    const [file] = await db
      .select()
      .from(schema.fileUploads)
      .where(
        and(
          eq(schema.fileUploads.id, parseInt(id)),
          eq(schema.fileUploads.userId, userId)
        )
      )
      .limit(1);

    if (!file) {
      return reply.code(404).send({ error: 'File not found' });
    }

    await deleteFile(file.s3Key);
    await db.delete(schema.fileUploads).where(eq(schema.fileUploads.id, parseInt(id)));

    return { ok: true };
  });
}
