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
  resolveProjectSlugByName,
  setProjectKBAutoRefresh,
} from '../workflows/projectKnowledgeBase';

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
