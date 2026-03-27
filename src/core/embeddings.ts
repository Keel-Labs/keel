import { Ollama } from 'ollama';
import * as crypto from 'crypto';
import type { EmbeddedChunk } from '../shared/types';
import { FileManager } from './fileManager';

const EMBED_MODEL = 'nomic-embed-text';
const MIN_CHUNK_SIZE = 50;
const MAX_CHUNK_SIZE = 500;

const ollama = new Ollama();

export async function embedText(text: string): Promise<number[]> {
  const response = await ollama.embed({
    model: EMBED_MODEL,
    input: text,
  });
  return response.embeddings[0];
}

export async function embedFile(
  fileManager: FileManager,
  filePath: string
): Promise<EmbeddedChunk[]> {
  const content = await fileManager.readFile(filePath);
  const chunks = splitIntoChunks(content);

  const results: EmbeddedChunk[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const text = chunks[i];
    const id = generateChunkId(filePath, i);

    try {
      const vector = await embedText(text);
      results.push({
        id,
        filePath,
        chunkIndex: i,
        text,
        vector,
        createdAt: Date.now(),
      });
    } catch {
      // Skip chunks that fail to embed
    }
  }

  return results;
}

function splitIntoChunks(content: string): string[] {
  const rawChunks = content.split('\n\n');
  const result: string[] = [];
  let buffer = '';

  for (const raw of rawChunks) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    if (buffer.length + trimmed.length + 2 <= MAX_CHUNK_SIZE) {
      buffer = buffer ? buffer + '\n\n' + trimmed : trimmed;
    } else {
      if (buffer.length >= MIN_CHUNK_SIZE) {
        result.push(buffer);
      }
      buffer = trimmed.length <= MAX_CHUNK_SIZE
        ? trimmed
        : trimmed.slice(0, MAX_CHUNK_SIZE);
    }
  }

  if (buffer.length >= MIN_CHUNK_SIZE) {
    result.push(buffer);
  }

  return result;
}

function generateChunkId(filePath: string, chunkIndex: number): string {
  const input = `${filePath}:${chunkIndex}`;
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}
