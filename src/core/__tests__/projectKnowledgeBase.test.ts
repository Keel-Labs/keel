import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { FileManager } from '../fileManager';
import {
  ensureProjectKB,
  refreshProjectKB,
} from '../workflows/projectKnowledgeBase';
import type { ProjectKBManifest } from '../../shared/types';

let tmpDir: string;
let fm: FileManager;
const PROJECT_SLUG = 'sample-project';

async function readManifest(): Promise<ProjectKBManifest> {
  const raw = await fm.readFile(`projects/${PROJECT_SLUG}/.keel-kb.json`);
  return JSON.parse(raw) as ProjectKBManifest;
}

async function listSourcePages(wikiBaseSlug: string): Promise<string[]> {
  const dir = path.join(
    fm.getBrainPath(),
    'knowledge-bases',
    wikiBaseSlug,
    'wiki',
    'sources'
  );
  try {
    return (await fs.readdir(dir)).sort();
  } catch {
    return [];
  }
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-project-kb-'));
  fm = new FileManager(tmpDir);
  await fm.writeFile(
    `projects/${PROJECT_SLUG}/context.md`,
    '# Sample Project\n\nA project used for KB tests.\n'
  );
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('refreshProjectKB', () => {
  it('re-ingesting an unchanged file produces no duplicate sources', async () => {
    const notesPath = path.join(
      fm.getBrainPath(),
      'projects',
      PROJECT_SLUG,
      'notes.md'
    );
    await fm.writeFile(`projects/${PROJECT_SLUG}/notes.md`, '# Notes\n\nFirst body.\n');

    const created = await ensureProjectKB(PROJECT_SLUG, fm);
    expect(created.created).toBe(true);

    // Bump mtime so refresh re-ingests, but content/title stays the same.
    const future = new Date(Date.now() + 60_000);
    await fs.utimes(notesPath, future, future);

    const refreshed = await refreshProjectKB(PROJECT_SLUG, fm);
    expect(refreshed.errors).toEqual([]);

    const pages = await listSourcePages(created.wikiBaseSlug);
    const notesPages = pages.filter((name) => name.startsWith('notes'));
    expect(notesPages).toEqual(['notes.md']);

    const manifest = await readManifest();
    const notesEntries = manifest.ingestedFiles.filter((e) => e.path === 'notes.md');
    expect(notesEntries).toHaveLength(1);
    expect(notesEntries[0].sourceSlug).toBe('notes');
  });

  it('editing a tracked file updates the same source page in place', async () => {
    const relNotes = `projects/${PROJECT_SLUG}/notes.md`;
    const notesAbs = path.join(fm.getBrainPath(), relNotes);
    await fm.writeFile(relNotes, '# Notes\n\nOriginal content.\n');

    const { wikiBaseSlug } = await ensureProjectKB(PROJECT_SLUG, fm);

    const firstPage = await fm.readFile(
      `knowledge-bases/${wikiBaseSlug}/wiki/sources/notes.md`
    );
    expect(firstPage).toContain('Original content');

    await fm.writeFile(relNotes, '# Notes\n\nUpdated content for the second pass.\n');
    const future = new Date(Date.now() + 60_000);
    await fs.utimes(notesAbs, future, future);

    const refreshed = await refreshProjectKB(PROJECT_SLUG, fm);
    expect(refreshed.added).toBe(1);

    const pages = await listSourcePages(wikiBaseSlug);
    const notesPages = pages.filter((name) => name.startsWith('notes'));
    expect(notesPages).toEqual(['notes.md']);

    const updatedPage = await fm.readFile(
      `knowledge-bases/${wikiBaseSlug}/wiki/sources/notes.md`
    );
    expect(updatedPage).toContain('Updated content');
    expect(updatedPage).not.toContain('Original content');
  });

  it('migrates existing manifests without sourceSlug by reusing the matching slug', async () => {
    const relNotes = `projects/${PROJECT_SLUG}/notes.md`;
    const notesAbs = path.join(fm.getBrainPath(), relNotes);
    await fm.writeFile(relNotes, '# Notes\n\nFirst body.\n');

    const { wikiBaseSlug } = await ensureProjectKB(PROJECT_SLUG, fm);

    // Simulate a pre-migration manifest entry: no sourceSlug recorded.
    const manifestBefore = await readManifest();
    manifestBefore.ingestedFiles = manifestBefore.ingestedFiles.map((entry) => ({
      path: entry.path,
      mtime: entry.mtime,
    }));
    await fm.writeFile(
      `projects/${PROJECT_SLUG}/.keel-kb.json`,
      JSON.stringify(manifestBefore, null, 2)
    );

    await fm.writeFile(relNotes, '# Notes\n\nUpdated body.\n');
    const future = new Date(Date.now() + 60_000);
    await fs.utimes(notesAbs, future, future);

    const refreshed = await refreshProjectKB(PROJECT_SLUG, fm);
    expect(refreshed.added).toBe(1);

    const pages = await listSourcePages(wikiBaseSlug);
    const notesPages = pages.filter((name) => name.startsWith('notes'));
    expect(notesPages).toEqual(['notes.md']);

    const manifestAfter = await readManifest();
    const notesEntry = manifestAfter.ingestedFiles.find((e) => e.path === 'notes.md');
    expect(notesEntry?.sourceSlug).toBe('notes');
  });
});
