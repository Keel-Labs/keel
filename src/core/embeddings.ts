import { Ollama } from 'ollama';
import * as crypto from 'crypto';
import type { Root, Node, Heading, Parent } from 'mdast';
import type { EmbeddedChunk } from '../shared/types';
import { FileManager } from './fileManager';
import { normalizeText } from './textNormalizer';
import {
  getDb,
  upsertFileRecord,
  deleteChunksByFile,
  insertChunks,
} from './db';

const EMBED_MODEL = 'nomic-embed-text';
const TARGET_CHUNK_TOKENS = 400;   // ~1,600 chars at avg 4 chars/token
const MAX_CHUNK_CHARS = 2000;
const MIN_CHUNK_CHARS = 100;
const OVERLAP_CHARS = 200;         // overlap between consecutive chunks in same section

const ollama = new Ollama();

export async function embedText(text: string): Promise<number[]> {
  const response = await ollama.embed({
    model: EMBED_MODEL,
    input: text,
  });
  return response.embeddings[0];
}

// ---- AST-based chunking with breadcrumbs ----

interface Section {
  breadcrumb: string;
  text: string;
  startLine: number;
  endLine: number;
}

function buildBreadcrumb(filePath: string, headingStack: string[]): string {
  // Build human-readable path: "projects/checkout-flow/notes.md > Decisions > Pricing"
  const parts = [filePath, ...headingStack];
  return parts.join(' > ');
}

function extractText(node: Node): string {
  if ('value' in node && typeof (node as any).value === 'string') {
    return (node as any).value;
  }
  if ('children' in node) {
    return (node as Parent).children.map(extractText).join('');
  }
  return '';
}

function getLine(node: Node): number {
  return (node as any).position?.start?.line ?? 1;
}

function buildSections(ast: Root, filePath: string): Section[] {
  const sections: Section[] = [];
  const headingStack: string[] = [];
  let currentText = '';
  let currentStart = 1;

  const flushSection = (endLine: number) => {
    const text = currentText.trim();
    if (text.length >= MIN_CHUNK_CHARS) {
      sections.push({
        breadcrumb: buildBreadcrumb(filePath, headingStack.slice()),
        text,
        startLine: currentStart,
        endLine,
      });
    }
    currentText = '';
  };

  for (const node of ast.children) {
    if (node.type === 'heading') {
      const heading = node as Heading;
      const level = heading.depth;
      const line = getLine(node);
      const title = extractText(node);

      // Flush current section before starting a new one
      flushSection(line - 1);
      currentStart = line;

      // Update heading stack based on level
      // Truncate to depth-1 to represent this heading's parent hierarchy
      headingStack.splice(level - 1);
      headingStack.push(title);
    } else {
      currentText += extractText(node) + '\n\n';
    }
  }

  // Flush final section
  flushSection(ast.children.length > 0 ? getLine(ast.children[ast.children.length - 1]) + 10 : 1);

  return sections;
}

function splitLargeSection(section: Section): Section[] {
  if (section.text.length <= MAX_CHUNK_CHARS) return [section];

  const results: Section[] = [];
  const paragraphs = section.text.split(/\n\n+/);
  let buffer = '';
  let chunkIndex = 0;

  const flush = () => {
    const text = buffer.trim();
    if (text.length >= MIN_CHUNK_CHARS) {
      results.push({
        breadcrumb: section.breadcrumb,
        text,
        startLine: section.startLine,
        endLine: section.endLine,
      });
      chunkIndex++;
    }
  };

  for (const para of paragraphs) {
    if (!para.trim()) continue;
    const candidate = buffer ? buffer + '\n\n' + para : para;
    if (candidate.length <= MAX_CHUNK_CHARS) {
      buffer = candidate;
    } else {
      flush();
      // Keep overlap: last OVERLAP_CHARS of previous buffer
      const overlap = buffer.slice(-OVERLAP_CHARS).trim();
      buffer = overlap ? overlap + '\n\n' + para : para;
      if (buffer.length > MAX_CHUNK_CHARS) {
        // Single paragraph too large — hard cut
        buffer = buffer.slice(0, MAX_CHUNK_CHARS);
        flush();
        buffer = '';
      }
    }
  }
  flush();

  return results;
}

async function chunkMarkdown(content: string, filePath: string): Promise<Section[]> {
  const normalized = normalizeText(content);
  // Dynamic imports — unified and remark-parse are ESM-only
  const { unified } = await import('unified');
  const { default: remarkParse } = await import('remark-parse');
  const ast = unified().use(remarkParse).parse(normalized) as Root;
  const sections = buildSections(ast, filePath);
  const chunks: Section[] = [];
  for (const section of sections) {
    chunks.push(...splitLargeSection(section));
  }
  return chunks;
}

// ---- Embedding + SQLite storage ----

/**
 * Embed a file: normalize → AST chunk → embed each chunk → store in SQLite + LanceDB.
 * Returns EmbeddedChunk[] for upsert into LanceDB (vector index).
 */
export async function embedFile(
  fileManager: FileManager,
  filePath: string
): Promise<EmbeddedChunk[]> {
  const brainPath = fileManager.getBrainPath();
  const raw = await fileManager.readFile(filePath);
  const normalized = normalizeText(raw);

  // Compute hash for change detection
  const hash = crypto.createHash('sha256').update(normalized).digest('hex');

  // Store raw content + hash as source of truth in SQLite
  const fileId = upsertFileRecord(brainPath, filePath, normalized, hash);

  // Chunk the file using AST
  const sections = await chunkMarkdown(normalized, filePath);

  // Clear old chunks for this file (maintains FTS5 consistency too)
  deleteChunksByFile(brainPath, fileId);

  // Store new chunks in SQLite
  const sqliteChunks = sections.map((s) => ({
    breadcrumb: s.breadcrumb,
    content: s.text,
    startLine: s.startLine,
    endLine: s.endLine,
  }));
  insertChunks(brainPath, fileId, sqliteChunks);

  // Embed each chunk for LanceDB vector index
  const results: EmbeddedChunk[] = [];
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    // The text sent for embedding includes the breadcrumb as context prefix
    const textToEmbed = `${section.breadcrumb}\n\n${section.text}`;
    const id = generateChunkId(filePath, i);

    try {
      const vector = await embedText(textToEmbed);
      results.push({
        id,
        filePath,
        chunkIndex: i,
        text: textToEmbed,
        vector,
        createdAt: Date.now(),
      });
    } catch {
      // Ollama not available — skip vector embedding, SQLite chunks are still stored
    }
  }

  return results;
}

function generateChunkId(filePath: string, chunkIndex: number): string {
  const input = `${filePath}:${chunkIndex}`;
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}
