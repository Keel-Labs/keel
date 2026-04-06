import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { FileManager } from '../fileManager';
import { createWikiBase } from '../workflows/wikiBase';

let tmpDir: string;
let fm: FileManager;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-wiki-base-'));
  fm = new FileManager(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('createWikiBase', () => {
  it('creates a wiki base skeleton with overview, index, log, and health files', async () => {
    const result = await createWikiBase('Company Research', fm, {
      description: 'Research base for company strategy and market notes.',
    });

    expect(result.basePath).toBe('knowledge-bases/company-research');

    const overview = await fm.readFile('knowledge-bases/company-research/overview.md');
    expect(overview).toContain('# Company Research');
    expect(overview).toContain('Research base for company strategy and market notes.');

    const agents = await fm.readFile('knowledge-bases/company-research/AGENTS.md');
    expect(agents).toContain('This wiki is maintained as a Keel knowledge base for Company Research.');

    const index = await fm.readFile('knowledge-bases/company-research/wiki/index.md');
    expect(index).toContain('## Sources');
    expect(index).toContain('## Concepts');

    const log = await fm.readFile('knowledge-bases/company-research/wiki/log.md');
    expect(log).toContain('create | Base initialized');

    const health = await fm.readFile('knowledge-bases/company-research/health/latest.md');
    expect(health).toContain('No health checks have been run');
  });

  it('creates a unique slug when a base with the same title already exists', async () => {
    await createWikiBase('Competitive Intel', fm);
    const duplicate = await createWikiBase('Competitive Intel', fm);

    expect(duplicate.basePath).toBe('knowledge-bases/competitive-intel-2');
    expect(await fm.fileExists('knowledge-bases/competitive-intel-2/overview.md')).toBe(true);
  });
});
