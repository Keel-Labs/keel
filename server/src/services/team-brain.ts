import { db, schema } from '../db/index.js';
import { eq, like } from 'drizzle-orm';

export async function readTeamFile(path: string): Promise<string> {
  const [file] = await db
    .select({ content: schema.teamBrainFiles.content })
    .from(schema.teamBrainFiles)
    .where(eq(schema.teamBrainFiles.path, path))
    .limit(1);

  if (!file) throw new Error(`Team file not found: ${path}`);
  return file.content;
}

export async function listTeamFilesByPattern(pattern: string): Promise<string[]> {
  const sqlPattern = pattern.replace(/\*/g, '%');

  const files = await db
    .select({ path: schema.teamBrainFiles.path })
    .from(schema.teamBrainFiles)
    .where(like(schema.teamBrainFiles.path, sqlPattern));

  return files.map((f) => f.path);
}
