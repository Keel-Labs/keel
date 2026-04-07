import { FileManager } from './fileManager';
import { embedText } from './embeddings';
import { search as searchVectorStore } from './vectorStore';
import { searchChunksFtsByPrefixes, type ChunkRow } from './db';
import type { RankableChunk } from './reranker';

const MAX_CONTEXT_CHARS = 24_000;
const VECTOR_LIMIT = 48;
const FTS_LIMIT = 24;
const TOP_RESULTS = 8;

export interface WikiChatContextInput {
  fileManager: FileManager;
  basePath: string;
  query: string;
  digDeep: boolean;
}

export interface WikiChatContextResult {
  context: string;
  citations: string[];
}

export async function assembleWikiChatContext({
  fileManager,
  basePath,
  query,
  digDeep,
}: WikiChatContextInput): Promise<WikiChatContextResult> {
  const prefixes = buildPathPrefixes(basePath, digDeep);
  const candidates = new Map<string, RankableChunk>();
  const brainPath = fileManager.getBrainPath();

  try {
    const queryVector = await embedText(query);
    const vectorResults = await searchVectorStore(brainPath, queryVector, VECTOR_LIMIT);
    for (const result of vectorResults) {
      if (!matchesPrefixes(result.chunk.filePath, prefixes)) continue;
      const similarity = Math.max(0, 1 - (result.score ?? 0));
      const text = result.chunk.text.trim();
      if (!text) continue;
      candidates.set(`vector:${result.chunk.id}`, {
        id: `vector:${result.chunk.id}`,
        filePath: result.chunk.filePath,
        text,
        score: similarity * sourceWeight(result.chunk.filePath, digDeep),
        updatedAt: Math.floor(result.chunk.createdAt / 1000),
      });
    }
  } catch {
    // Embeddings are optional. FTS/manual fallback still works.
  }

  const ftsResults = searchChunksFtsByPrefixes(brainPath, query, prefixes, FTS_LIMIT);
  for (let index = 0; index < ftsResults.length; index += 1) {
    const row = ftsResults[index];
    const score = Math.max(0.2, 1 - index / Math.max(ftsResults.length, 1));
    candidates.set(`fts:${row.id}`, {
      id: `fts:${row.id}`,
      filePath: row.filePath,
      text: row.content.trim(),
      score: score * sourceWeight(row.filePath, digDeep),
      updatedAt: row.updatedAt,
    });
  }

  if (candidates.size < 3) {
    const fallbackFiles = await listCandidateFiles(fileManager, basePath, digDeep);
    const fallbackTerms = getSearchTerms(query);
    for (const filePath of fallbackFiles) {
      try {
        const content = await fileManager.readFile(filePath);
        const score = scoreFileContent(content, fallbackTerms) * sourceWeight(filePath, digDeep);
        if (score <= 0) continue;
        candidates.set(`file:${filePath}`, {
          id: `file:${filePath}`,
          filePath,
          text: buildFallbackExcerpt(content, fallbackTerms),
          score,
        });
      } catch {
        // Skip unreadable files.
      }
    }
  }

  const topResults = Array.from(candidates.values())
    .sort((left, right) => right.score - left.score)
    .slice(0, TOP_RESULTS);

  if (topResults.length === 0) {
    return { context: '', citations: [] };
  }

  const grouped = new Map<string, string[]>();
  for (const chunk of topResults) {
    const snippets = grouped.get(chunk.filePath) || [];
    if (snippets.length >= 2) continue;
    snippets.push(chunk.text);
    grouped.set(chunk.filePath, snippets);
  }

  const sections: string[] = [];
  const citations: string[] = [];
  let totalChars = 0;

  for (const [filePath, snippets] of grouped) {
    const snippetText = snippets.join('\n\n');
    const section = `\n\n--- ${filePath} ---\n\n${snippetText}`;
    if (totalChars + section.length > MAX_CONTEXT_CHARS) break;
    sections.push(section);
    citations.push(filePath);
    totalChars += section.length;
  }

  const contextHeader = [
    `Wiki base: ${basePath}`,
    `Dig Deep: ${digDeep ? 'on' : 'off'}`,
    'Use this selected wiki base when it is relevant to the user request.',
    'If the wiki does not contain enough evidence, say so plainly.',
    'Use the cited wiki paths provided here when grounding your answer.',
  ].join('\n');

  return {
    context: `${contextHeader}${sections.join('')}`,
    citations,
  };
}

function buildPathPrefixes(basePath: string, digDeep: boolean): string[] {
  const prefixes = [
    `${basePath}/wiki/index.md`,
    `${basePath}/wiki/concepts/`,
    `${basePath}/wiki/open-questions/`,
    `${basePath}/wiki/sources/`,
  ];

  if (digDeep) {
    prefixes.push(
      `${basePath}/raw/`,
      `${basePath}/outputs/`,
      `${basePath}/health/latest.md`,
    );
  }

  return prefixes;
}

function matchesPrefixes(filePath: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => filePath.startsWith(prefix));
}

function sourceWeight(filePath: string, digDeep: boolean): number {
  if (filePath.endsWith('/wiki/index.md')) return 1.35;
  if (filePath.includes('/wiki/concepts/')) return 1.3;
  if (filePath.includes('/wiki/open-questions/')) return 1.15;
  if (filePath.includes('/wiki/sources/')) return 1.1;
  if (digDeep && filePath.includes('/outputs/')) return 0.95;
  if (digDeep && filePath.includes('/raw/')) return 0.85;
  if (digDeep && filePath.includes('/health/')) return 0.8;
  return 1;
}

async function listCandidateFiles(fileManager: FileManager, basePath: string, digDeep: boolean): Promise<string[]> {
  const patterns = [
    `${basePath}/wiki/index.md`,
    `${basePath}/wiki/concepts/**/*.md`,
    `${basePath}/wiki/open-questions/**/*.md`,
    `${basePath}/wiki/sources/**/*.md`,
  ];

  if (digDeep) {
    patterns.push(
      `${basePath}/raw/**/source.md`,
      `${basePath}/outputs/**/*.md`,
      `${basePath}/health/latest.md`,
    );
  }

  const fileLists = await Promise.all(patterns.map((pattern) => fileManager.listFiles(pattern)));
  return Array.from(new Set(fileLists.flat()));
}

function getSearchTerms(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .map((part) => part.trim())
        .filter((part) => part.length >= 3)
    )
  );
}

function scoreFileContent(content: string, terms: string[]): number {
  if (terms.length === 0) return content.trim().length > 0 ? 0.1 : 0;
  const normalized = content.toLowerCase();
  let score = 0;
  for (const term of terms) {
    const matches = normalized.match(new RegExp(escapeRegex(term), 'g'));
    if (matches) score += matches.length;
  }
  return score;
}

function buildFallbackExcerpt(content: string, terms: string[]): string {
  if (content.length <= 900) return content.trim();
  const normalized = content.toLowerCase();
  const matchIndex = terms
    .map((term) => normalized.indexOf(term.toLowerCase()))
    .find((index) => index >= 0);

  if (matchIndex === undefined || matchIndex < 0) {
    return `${content.slice(0, 900).trim()}\n…`;
  }

  const start = Math.max(0, matchIndex - 220);
  const end = Math.min(content.length, matchIndex + 680);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < content.length ? '\n…' : '';
  return `${prefix}${content.slice(start, end).trim()}${suffix}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
