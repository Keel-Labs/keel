import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { FileManager } from '../fileManager';

let tmpDir: string;
let fm: FileManager;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-test-'));
  fm = new FileManager(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('FileManager', () => {
  describe('readFile / writeFile', () => {
    it('writes and reads a file', async () => {
      await fm.writeFile('test.md', '# Hello');
      const content = await fm.readFile('test.md');
      expect(content).toBe('# Hello');
    });

    it('creates nested directories automatically', async () => {
      await fm.writeFile('a/b/c.md', 'deep');
      const content = await fm.readFile('a/b/c.md');
      expect(content).toBe('deep');
    });

    it('throws on missing file', async () => {
      await expect(fm.readFile('nonexistent.md')).rejects.toThrow();
    });
  });

  describe('appendToFile', () => {
    it('appends to an existing file', async () => {
      await fm.writeFile('log.md', 'line1\n');
      await fm.appendToFile('log.md', 'line2\n');
      const content = await fm.readFile('log.md');
      expect(content).toBe('line1\nline2\n');
    });

    it('creates file if it does not exist', async () => {
      await fm.appendToFile('new.md', 'first');
      const content = await fm.readFile('new.md');
      expect(content).toBe('first');
    });
  });

  describe('listFiles', () => {
    it('lists files matching a glob pattern', async () => {
      await fm.writeFile('01_projects/p1/context.md', 'p1');
      await fm.writeFile('01_projects/p2/context.md', 'p2');
      await fm.writeFile('01_projects/p2/tasks.md', 'tasks');

      const contextFiles = await fm.listFiles('01_projects/*/context.md');
      expect(contextFiles).toHaveLength(2);
      expect(contextFiles).toContain('01_projects/p1/context.md');
      expect(contextFiles).toContain('01_projects/p2/context.md');
    });

    it('returns empty array for no matches', async () => {
      const result = await fm.listFiles('*.nonexistent');
      expect(result).toHaveLength(0);
    });
  });

  describe('ensureDirectoryStructure', () => {
    it('creates brain directories', async () => {
      await fm.ensureDirectoryStructure();

      for (const dir of ['projects', 'daily-log']) {
        const stat = await fs.stat(path.join(tmpDir, dir));
        expect(stat.isDirectory()).toBe(true);
      }
    });

    it('creates keel.md template', async () => {
      await fm.ensureDirectoryStructure();
      const content = await fm.readFile('keel.md');
      expect(content).toContain('# Profile');
      expect(content).toContain('# Active Projects');
      expect(content).toContain('# Current Priorities');
    });

    it('creates tasks.md template', async () => {
      await fm.ensureDirectoryStructure();
      const content = await fm.readFile('tasks.md');
      expect(content).toContain('# Tasks');
    });

    it('creates example project', async () => {
      await fm.ensureDirectoryStructure();
      const content = await fm.readFile('projects/example-project/context.md');
      expect(content).toContain('Example Project');
    });

    it('does not overwrite existing keel.md', async () => {
      await fm.writeFile('keel.md', 'custom content');
      await fm.ensureDirectoryStructure();
      const content = await fm.readFile('keel.md');
      expect(content).toBe('custom content');
    });
  });

  describe('readSection', () => {
    const testDoc = `# Title

Intro paragraph.

## Overview
This is the overview section.
It has multiple lines.

## Details
Here are the details.

### Sub-section
Sub content here.

## Conclusion
Final thoughts.
`;

    it('reads a section by heading', async () => {
      await fm.writeFile('doc.md', testDoc);
      const section = await fm.readSection('doc.md', 'Overview');
      expect(section).toBe('This is the overview section.\nIt has multiple lines.');
    });

    it('reads a section with sub-sections', async () => {
      await fm.writeFile('doc.md', testDoc);
      const section = await fm.readSection('doc.md', 'Details');
      expect(section).toContain('Here are the details.');
      expect(section).toContain('Sub content here.');
    });

    it('returns empty string for missing heading', async () => {
      await fm.writeFile('doc.md', testDoc);
      const section = await fm.readSection('doc.md', 'Nonexistent');
      expect(section).toBe('');
    });
  });

  describe('fileExists', () => {
    it('returns true for existing file', async () => {
      await fm.writeFile('exists.md', 'yes');
      expect(await fm.fileExists('exists.md')).toBe(true);
    });

    it('returns false for missing file', async () => {
      expect(await fm.fileExists('nope.md')).toBe(false);
    });
  });
});
