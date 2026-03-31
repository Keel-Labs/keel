/**
 * Re-rank retrieved chunks using boost factors:
 * - Recency: recent files score higher
 * - Project match: chunks from the detected project score higher
 * - Source type: structured files (context.md) score higher than inbox
 */

export interface RankableChunk {
  id: string;
  filePath: string;
  text: string;
  score: number;       // raw similarity score (lower = closer for distance, higher = better for similarity)
  updatedAt?: number;  // unix seconds
}

interface BoostConfig {
  detectedProject?: string;   // project name detected in query (e.g. "checkout-flow")
  nowMs?: number;             // override for testing
}

function recencyBoost(updatedAtSec: number, nowMs: number): number {
  const ageMs = nowMs - updatedAtSec * 1000;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays <= 7)  return 1.5;
  if (ageDays <= 30) return 1.2;
  return 1.0;
}

function projectBoost(filePath: string, detectedProject?: string): number {
  if (!detectedProject) return 1.0;
  // Normalize: "projects/checkout-flow/notes.md" → "checkout-flow"
  const match = filePath.match(/^projects\/([^/]+)\//);
  if (match && match[1].toLowerCase().includes(detectedProject.toLowerCase())) {
    return 2.0;
  }
  return 1.0;
}

function sourceBoost(filePath: string): number {
  if (filePath.endsWith('context.md'))     return 1.3;
  if (filePath.endsWith('notes.md'))       return 1.1;
  if (filePath.startsWith('daily-log/'))   return 1.0;
  if (filePath.startsWith('inbox/'))       return 0.8;
  return 1.0;
}

/**
 * Detect a project name from the user query by looking for project-like keywords.
 * Returns the lowercased slug if found, undefined otherwise.
 */
export function detectProject(query: string, knownProjects: string[]): string | undefined {
  const q = query.toLowerCase();
  for (const proj of knownProjects) {
    const slug = proj.toLowerCase().replace(/\s+/g, '-');
    if (q.includes(proj.toLowerCase()) || q.includes(slug)) {
      return slug;
    }
  }
  return undefined;
}

/**
 * Re-rank a list of chunks using boost factors. Returns top-K sorted chronologically.
 */
export function rerank(
  chunks: RankableChunk[],
  topK: number,
  config: BoostConfig = {}
): RankableChunk[] {
  const now = config.nowMs ?? Date.now();

  const scored = chunks.map((chunk) => {
    const recency = chunk.updatedAt ? recencyBoost(chunk.updatedAt, now) : 1.0;
    const project = projectBoost(chunk.filePath, config.detectedProject);
    const source = sourceBoost(chunk.filePath);
    const boostedScore = chunk.score * recency * project * source;
    return { ...chunk, boostedScore };
  });

  // Take top-K by boosted score (higher = better)
  scored.sort((a, b) => b.boostedScore - a.boostedScore);
  const top = scored.slice(0, topK);

  // Sort chronologically (oldest first, most recent last) for context coherence
  top.sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0));

  return top;
}
