import { db, schema } from '../db/index.js';
import { eq, and, like } from 'drizzle-orm';
import crypto from 'crypto';

export async function readBrainFile(userId: number, path: string): Promise<string> {
  const [file] = await db
    .select({ content: schema.brainFiles.content })
    .from(schema.brainFiles)
    .where(and(eq(schema.brainFiles.userId, userId), eq(schema.brainFiles.path, path)))
    .limit(1);

  if (!file) throw new Error(`File not found: ${path}`);
  return file.content;
}

export async function writeBrainFile(userId: number, path: string, content: string): Promise<void> {
  const hash = crypto.createHash('sha256').update(content).digest('hex');

  await db
    .insert(schema.brainFiles)
    .values({ userId, path, content, hash })
    .onConflictDoUpdate({
      target: [schema.brainFiles.userId, schema.brainFiles.path],
      set: { content, hash, updatedAt: new Date() },
    });
}

export async function brainFileExists(userId: number, path: string): Promise<boolean> {
  const [file] = await db
    .select({ id: schema.brainFiles.id })
    .from(schema.brainFiles)
    .where(and(eq(schema.brainFiles.userId, userId), eq(schema.brainFiles.path, path)))
    .limit(1);

  return !!file;
}

export async function listBrainFilesByPattern(userId: number, pattern: string): Promise<string[]> {
  // Convert glob-like pattern to SQL LIKE pattern
  const sqlPattern = pattern.replace(/\*/g, '%');

  const files = await db
    .select({ path: schema.brainFiles.path })
    .from(schema.brainFiles)
    .where(and(eq(schema.brainFiles.userId, userId), like(schema.brainFiles.path, sqlPattern)));

  return files.map((f) => f.path);
}

export async function appendToBrainFile(userId: number, path: string, content: string): Promise<void> {
  try {
    const existing = await readBrainFile(userId, path);
    await writeBrainFile(userId, path, existing + content);
  } catch {
    await writeBrainFile(userId, path, content);
  }
}
