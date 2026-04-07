import * as fs from 'fs';
import * as path from 'path';
import type { WikiBaseSummary } from '../shared/types';

export async function listWikiBaseSummaries(brainPath: string): Promise<WikiBaseSummary[]> {
  const root = path.join(brainPath, 'knowledge-bases');

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const summaries = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(async (entry) => {
        const basePath = `knowledge-bases/${entry.name}`;
        const overviewPath = path.join(root, entry.name, 'overview.md');
        const fallbackTitle = formatWikiBaseTitle(entry.name);
        let title = fallbackTitle;
        let description = '';
        let updatedAt = 0;

        try {
          const stat = fs.statSync(path.join(root, entry.name));
          updatedAt = stat.mtimeMs;
        } catch {
          updatedAt = 0;
        }

        try {
          const overview = await fs.promises.readFile(overviewPath, 'utf-8');
          title = extractWikiBaseTitle(overview, fallbackTitle);
          description = extractWikiBaseSummary(overview);
          const overviewStat = fs.statSync(overviewPath);
          updatedAt = Math.max(updatedAt, overviewStat.mtimeMs);
        } catch {
          // Fall back to directory-derived values.
        }

        return {
          basePath,
          slug: entry.name,
          title,
          description: description || undefined,
          updatedAt,
        } satisfies WikiBaseSummary;
      })
  );

  return summaries.sort((left, right) => {
    if (right.updatedAt !== left.updatedAt) return right.updatedAt - left.updatedAt;
    return left.title.localeCompare(right.title);
  });
}

function extractWikiBaseTitle(content: string, fallback: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() || fallback;
}

function extractWikiBaseSummary(content: string): string {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.find((line) => !line.startsWith('#')) || '';
}

function formatWikiBaseTitle(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
