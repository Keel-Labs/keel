import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { FileManager } from '../fileManager';
import { createProject } from '../tasks';
import {
  ensureProjectKB,
  findProjectSlugByWikiBaseSlug,
  getProjectKBStatus,
  listProjectKBs,
  recordAutoRefreshError,
  refreshProjectKB,
  resolveProjectSlugByName,
  setProjectKBAutoRefresh,
} from '../workflows/projectKnowledgeBase';
import type { ProjectKBManifest } from '../../shared/types';

let tmpDir: string;
let fm: FileManager;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-project-kb-'));
  fm = new FileManager(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('/create-kb auto-creates missing project', () => {
  it('resolveProjectSlugByName returns null for an unknown name', async () => {
    const slug = await resolveProjectSlugByName('Pool Servicing', fm);
    expect(slug).toBeNull();
  });

  it('createProject + ensureProjectKB yields a KB for a brand-new name', async () => {
    const slug = await createProject(fm, 'Pool Servicing');
    expect(slug).toBe('pool-servicing');

    const result = await ensureProjectKB(slug, fm);
    expect(result.created).toBe(true);
    expect(result.wikiBaseSlug).toBe('pool-servicing');

    const overview = await fm.readFile(`knowledge-bases/${result.wikiBaseSlug}/overview.md`);
    expect(overview).toContain('# Pool Servicing');

    const resolved = await resolveProjectSlugByName('Pool Servicing', fm);
    expect(resolved).toBe('pool-servicing');
  });
});

describe('projectKnowledgeBase auto-refresh helpers', () => {
  beforeEach(async () => {
    await fs.mkdir(path.join(tmpDir, 'projects', 'sample'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'projects', 'sample', '.keel-kb.json'),
      JSON.stringify({
        wikiBaseSlug: 'sample',
        lastRefreshed: 0,
        ingestedFiles: [],
      })
    );
  });

  it('listProjectKBs reports auto-refresh enabled by default', async () => {
    const kbs = await listProjectKBs(fm);
    expect(kbs).toHaveLength(1);
    expect(kbs[0].projectSlug).toBe('sample');
    expect(kbs[0].wikiBaseSlug).toBe('sample');
    expect(kbs[0].basePath).toBe('knowledge-bases/sample');
    expect(kbs[0].autoRefreshEnabled).toBe(true);
  });

  it('setProjectKBAutoRefresh persists and survives status reads', async () => {
    await setProjectKBAutoRefresh('sample', false, fm);
    const kbs = await listProjectKBs(fm);
    expect(kbs[0].autoRefreshEnabled).toBe(false);

    const status = await getProjectKBStatus('sample', fm);
    expect(status.hasKB).toBe(true);
    expect(status.autoRefreshEnabled).toBe(false);

    await setProjectKBAutoRefresh('sample', true, fm);
    const after = await getProjectKBStatus('sample', fm);
    expect(after.autoRefreshEnabled).toBe(true);
  });

  it('findProjectSlugByWikiBaseSlug resolves project slug from KB slug', async () => {
    const slug = await findProjectSlugByWikiBaseSlug('sample', fm);
    expect(slug).toBe('sample');
    const missing = await findProjectSlugByWikiBaseSlug('does-not-exist', fm);
    expect(missing).toBeNull();
  });

  it('recordAutoRefreshError stores and clears the last error', async () => {
    await recordAutoRefreshError('sample', 'compile timed out', fm);
    const after = await getProjectKBStatus('sample', fm);
    expect(after.lastAutoRefreshError).toBe('compile timed out');
    expect(typeof after.lastAutoRefreshErrorAt).toBe('number');

    await recordAutoRefreshError('sample', null, fm);
    const cleared = await getProjectKBStatus('sample', fm);
    expect(cleared.lastAutoRefreshError).toBeUndefined();
    expect(cleared.lastAutoRefreshErrorAt).toBeUndefined();
  });
});

describe('refreshProjectKB source slug stability', () => {
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
    await fm.writeFile(
      `projects/${PROJECT_SLUG}/context.md`,
      '# Sample Project\n\nA project used for KB tests.\n'
    );
  });

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
