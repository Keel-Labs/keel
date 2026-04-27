import * as fs from 'fs/promises';
import * as path from 'path';
import { FileManager } from '../fileManager';
import { createWikiBase } from './wikiBase';
import { ingestWikiSource } from './wikiIngest';
import type { ProjectKBStatus, ProjectKBManifest, WikiSourceInput } from '../../shared/types';

const MANIFEST_FILE = '.keel-kb.json';
const SUPPORTED_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.pdf', '.docx', '.pptx']);
// Files we never want to ingest into the KB.
const SKIP_FILES = new Set(['.keel-kb.json', '.DS_Store']);

export async function getProjectKBStatus(
  projectSlug: string,
  fileManager: FileManager
): Promise<ProjectKBStatus> {
  const manifest = await readManifest(projectSlug, fileManager);
  if (!manifest) {
    return { hasKB: false };
  }
  return {
    hasKB: true,
    wikiBaseSlug: manifest.wikiBaseSlug,
    lastRefreshed: manifest.lastRefreshed,
    ingestedCount: manifest.ingestedFiles.length,
  };
}

export async function ensureProjectKB(
  projectSlug: string,
  fileManager: FileManager
): Promise<{ wikiBaseSlug: string; created: boolean; added: number; skipped: number }> {
  const existing = await readManifest(projectSlug, fileManager);
  if (existing) {
    const refresh = await refreshProjectKB(projectSlug, fileManager);
    return {
      wikiBaseSlug: existing.wikiBaseSlug,
      created: false,
      added: refresh.added,
      skipped: refresh.skipped,
    };
  }

  const projectName = await resolveProjectName(projectSlug, fileManager);
  const description = await resolveProjectDescription(projectSlug, fileManager);

  const result = await createWikiBase(projectName, fileManager, { description });

  const manifest: ProjectKBManifest = {
    wikiBaseSlug: result.slug,
    lastRefreshed: 0,
    ingestedFiles: [],
  };
  await writeManifest(projectSlug, manifest, fileManager);

  const refresh = await refreshProjectKB(projectSlug, fileManager);
  return {
    wikiBaseSlug: result.slug,
    created: true,
    added: refresh.added,
    skipped: refresh.skipped,
  };
}

export async function refreshProjectKB(
  projectSlug: string,
  fileManager: FileManager
): Promise<{ wikiBaseSlug: string; added: number; skipped: number; errors: string[] }> {
  const manifest = await readManifest(projectSlug, fileManager);
  if (!manifest) {
    throw new Error(`No knowledge base for project "${projectSlug}". Run /create-kb first.`);
  }

  const projectAbs = path.join(fileManager.getBrainPath(), 'projects', projectSlug);
  const wikiBaseRel = `knowledge-bases/${manifest.wikiBaseSlug}`;

  const files = await walkProjectFiles(projectAbs);
  const indexed = new Map(manifest.ingestedFiles.map((f) => [f.path, f.mtime]));

  let added = 0;
  let skipped = 0;
  const errors: string[] = [];
  const updatedEntries: { path: string; mtime: number }[] = [...manifest.ingestedFiles];

  for (const filePath of files) {
    const rel = path.relative(projectAbs, filePath);
    if (SKIP_FILES.has(path.basename(rel))) continue;
    const ext = path.extname(rel).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

    const stat = await fs.stat(filePath);
    const previous = indexed.get(rel);
    if (previous && previous >= stat.mtimeMs) {
      skipped += 1;
      continue;
    }

    const input: WikiSourceInput = {
      sourceType: 'file',
      filePath,
      fileName: path.basename(filePath),
      title: path.basename(filePath, ext),
    };

    try {
      await ingestWikiSource(wikiBaseRel, input, fileManager);
      added += 1;
      const existingIdx = updatedEntries.findIndex((e) => e.path === rel);
      const entry = { path: rel, mtime: stat.mtimeMs };
      if (existingIdx >= 0) updatedEntries[existingIdx] = entry;
      else updatedEntries.push(entry);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`${rel}: ${msg}`);
    }
  }

  const updatedManifest: ProjectKBManifest = {
    wikiBaseSlug: manifest.wikiBaseSlug,
    lastRefreshed: Date.now(),
    ingestedFiles: updatedEntries,
  };
  await writeManifest(projectSlug, updatedManifest, fileManager);

  return { wikiBaseSlug: manifest.wikiBaseSlug, added, skipped, errors };
}

// --- helpers ---

async function readManifest(
  projectSlug: string,
  fileManager: FileManager
): Promise<ProjectKBManifest | null> {
  const rel = `projects/${projectSlug}/${MANIFEST_FILE}`;
  if (!(await fileManager.fileExists(rel))) return null;
  try {
    const raw = await fileManager.readFile(rel);
    const parsed = JSON.parse(raw) as ProjectKBManifest;
    if (!parsed.wikiBaseSlug) return null;
    if (!Array.isArray(parsed.ingestedFiles)) parsed.ingestedFiles = [];
    return parsed;
  } catch {
    return null;
  }
}

async function writeManifest(
  projectSlug: string,
  manifest: ProjectKBManifest,
  fileManager: FileManager
): Promise<void> {
  await fileManager.writeFile(
    `projects/${projectSlug}/${MANIFEST_FILE}`,
    JSON.stringify(manifest, null, 2)
  );
}

async function walkProjectFiles(rootAbs: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }
  await walk(rootAbs);
  return out;
}

async function resolveProjectName(projectSlug: string, fileManager: FileManager): Promise<string> {
  const contextRel = `projects/${projectSlug}/context.md`;
  if (await fileManager.fileExists(contextRel)) {
    try {
      const content = await fileManager.readFile(contextRel);
      const match = content.match(/^#\s+(.+)$/m);
      if (match) return match[1].trim();
    } catch {
      // fall through
    }
  }
  return prettifySlug(projectSlug);
}

async function resolveProjectDescription(
  projectSlug: string,
  fileManager: FileManager
): Promise<string | undefined> {
  const contextRel = `projects/${projectSlug}/context.md`;
  if (!(await fileManager.fileExists(contextRel))) return undefined;
  try {
    const content = await fileManager.readFile(contextRel);
    // Skip the title line, find the first non-empty paragraph.
    const lines = content.split('\n');
    let started = false;
    const paragraph: string[] = [];
    for (const line of lines) {
      if (/^#\s/.test(line)) continue;
      if (!started) {
        if (line.trim() === '') continue;
        started = true;
      }
      if (line.trim() === '') {
        if (paragraph.length) break;
        continue;
      }
      paragraph.push(line.trim());
    }
    const desc = paragraph.join(' ').trim();
    return desc || undefined;
  } catch {
    return undefined;
  }
}

function prettifySlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export async function resolveProjectSlugByName(
  query: string,
  fileManager: FileManager
): Promise<string | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const projectsDir = path.join(fileManager.getBrainPath(), 'projects');
  let entries;
  try {
    entries = await fs.readdir(projectsDir, { withFileTypes: true });
  } catch {
    return null;
  }
  const slugs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  // Direct slug match
  if (slugs.includes(trimmed)) return trimmed;
  const slugified = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (slugified && slugs.includes(slugified)) return slugified;

  // Match by name read from context.md
  for (const slug of slugs) {
    try {
      const name = await resolveProjectName(slug, fileManager);
      if (name.toLowerCase() === trimmed.toLowerCase()) return slug;
    } catch {
      // ignore
    }
  }

  // Loose contains match
  const lower = trimmed.toLowerCase();
  for (const slug of slugs) {
    if (slug.toLowerCase().includes(slugified)) return slug;
    try {
      const name = await resolveProjectName(slug, fileManager);
      if (name.toLowerCase().includes(lower)) return slug;
    } catch {
      // ignore
    }
  }
  return null;
}
