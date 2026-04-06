import * as fs from 'fs/promises';
import * as path from 'path';
import { FileManager } from '../fileManager';

export interface CreateWikiBaseResult {
  basePath: string;
  slug: string;
  title: string;
  message: string;
}

export async function createWikiBase(
  title: string,
  fileManager: FileManager,
  options?: { description?: string }
): Promise<CreateWikiBaseResult> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    throw new Error('Enter a wiki base name.');
  }

  const slug = await getUniqueWikiBaseSlug(trimmedTitle, fileManager);
  const basePath = `knowledge-bases/${slug}`;
  const today = new Date().toISOString().slice(0, 10);
  const description = options?.description?.trim() || `A Keel wiki base for ${trimmedTitle}.`;

  await fs.mkdir(path.join(fileManager.getBrainPath(), basePath, 'raw'), { recursive: true });
  await fs.mkdir(path.join(fileManager.getBrainPath(), basePath, 'wiki', 'sources'), { recursive: true });
  await fs.mkdir(path.join(fileManager.getBrainPath(), basePath, 'wiki', 'concepts'), { recursive: true });
  await fs.mkdir(path.join(fileManager.getBrainPath(), basePath, 'wiki', 'open-questions'), { recursive: true });
  await fs.mkdir(path.join(fileManager.getBrainPath(), basePath, 'outputs', 'reports'), { recursive: true });
  await fs.mkdir(path.join(fileManager.getBrainPath(), basePath, 'health'), { recursive: true });

  await fileManager.writeFile(`${basePath}/overview.md`, buildOverviewMarkdown(trimmedTitle, description));
  await fileManager.writeFile(`${basePath}/AGENTS.md`, buildAgentsMarkdown(trimmedTitle));
  await fileManager.writeFile(`${basePath}/wiki/index.md`, buildIndexMarkdown());
  await fileManager.writeFile(`${basePath}/wiki/log.md`, buildLogMarkdown(today));
  await fileManager.writeFile(`${basePath}/health/latest.md`, buildHealthMarkdown());

  return {
    basePath,
    slug,
    title: trimmedTitle,
    message: `Created wiki base "${trimmedTitle}".`,
  };
}

async function getUniqueWikiBaseSlug(title: string, fileManager: FileManager): Promise<string> {
  const baseSlug = slugify(title) || 'wiki-base';
  let slug = baseSlug;
  let suffix = 2;

  while (await fileManager.fileExists(`knowledge-bases/${slug}/overview.md`)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

function buildOverviewMarkdown(title: string, description: string): string {
  return `# ${title}

${description}

## Key Concepts

- Add concept pages under \`wiki/concepts/\`

## Key Sources

- Add source pages under \`wiki/sources/\`

## Open Questions

- Add open questions under \`wiki/open-questions/\`

## Recent Outputs

- Add durable outputs under \`outputs/\`
`;
}

function buildAgentsMarkdown(title: string): string {
  return `# AGENTS.md

This wiki is maintained as a Keel knowledge base for ${title}.

## Structure

- \`overview.md\` is the front door for humans.
- \`wiki/index.md\` is the machine-readable map of important pages.
- \`wiki/log.md\` is the append-only activity log.
- \`wiki/sources/\` stores source summaries.
- \`wiki/concepts/\` stores synthesized concept pages.
- \`wiki/open-questions/\` stores unresolved questions and gaps.
- \`outputs/\` stores durable generated artifacts.
- \`health/\` stores health-check reports.

## Editing Rules

- Prefer updating existing concept pages over creating duplicates.
- Cite source pages when synthesizing claims.
- Keep the raw source layer immutable.
- Append notable changes to \`wiki/log.md\`.
`;
}

function buildIndexMarkdown(): string {
  return `# Wiki Index

## Sources

## Concepts

## Open Questions

## Outputs
`;
}

function buildLogMarkdown(date: string): string {
  return `# Wiki Log

## [${date}] create | Base initialized
Created this wiki base with the default Keel structure.
`;
}

function buildHealthMarkdown(): string {
  return `# Health Check

No health checks have been run for this base yet.
`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}
