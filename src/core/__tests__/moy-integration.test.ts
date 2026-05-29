import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { FileManager } from '../fileManager';
import { ContextAssembler } from '../contextAssembler';
import { MODEL_OF_YOU_PATH } from '../modelOfYou';

let tmpDir: string;
beforeEach(async () => { tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-moy-int-')); });
afterEach(async () => { await fs.rm(tmpDir, { recursive: true, force: true }); });

describe('ContextAssembler + model-of-you', () => {
  it('injects model-of-me.md into the V1 system prompt', async () => {
    const fm = new FileManager(tmpDir);
    await fm.writeFile('keel.md', '# Profile\nName: Medha');
    await fm.writeFile(MODEL_OF_YOU_PATH, '## Goals\n- [Q2] Ship Keel mobile app\n\n## Working style\n- Ships smallest actionable item first');
    const ctx = await new ContextAssembler(fm).assembleContext();
    expect(ctx).toContain(MODEL_OF_YOU_PATH);
    expect(ctx).toContain('Ship Keel mobile app');
    expect(ctx).toContain('Ships smallest actionable item first');
  });

  it('omits the section entirely when no model file exists', async () => {
    const fm = new FileManager(tmpDir);
    await fm.writeFile('keel.md', '# Profile');
    const ctx = await new ContextAssembler(fm).assembleContext();
    expect(ctx).not.toContain(MODEL_OF_YOU_PATH);
  });
});
