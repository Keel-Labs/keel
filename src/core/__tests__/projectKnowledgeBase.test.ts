import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { FileManager } from '../fileManager';
import { createProject } from '../tasks';
import {
  ensureProjectKB,
  resolveProjectSlugByName,
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
