import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { FileManager } from '../fileManager';
import {
  MODEL_OF_YOU_PATH,
  MODEL_OF_YOU_TEMPLATE,
  MODEL_SECTIONS,
  loadModelOfYou,
  parseModel,
  serializeModel,
  writeSection,
  saveModelOfYou,
} from '../modelOfYou';

let tmpDir: string;
let fm: FileManager;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-model-test-'));
  fm = new FileManager(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('modelOfYou', () => {
  it('returns null when the model file does not exist', async () => {
    expect(await loadModelOfYou(fm)).toBeNull();
  });

  it('treats an empty file as absent', async () => {
    await fm.writeFile(MODEL_OF_YOU_PATH, '   \n');
    expect(await loadModelOfYou(fm)).toBeNull();
  });

  it('template contains every locked section heading', () => {
    for (const heading of MODEL_SECTIONS) {
      expect(MODEL_OF_YOU_TEMPLATE).toContain(`## ${heading}`);
    }
  });

  it('round-trips parse -> serialize -> parse', () => {
    const parsed = parseModel(MODEL_OF_YOU_TEMPLATE);
    expect(parsed.sections.map((s) => s.heading)).toEqual([...MODEL_SECTIONS]);
    const reparsed = parseModel(serializeModel(parsed));
    expect(reparsed.sections.map((s) => s.heading)).toEqual([...MODEL_SECTIONS]);
  });

  it('writeSection replaces one section and preserves the others', async () => {
    await saveModelOfYou(fm, MODEL_OF_YOU_TEMPLATE);
    const wrote = await writeSection(fm, 'Goals', '- [Q2] Ship the mobile app');
    expect(wrote).toBe(true);

    const parsed = parseModel((await loadModelOfYou(fm))!);
    const goals = parsed.sections.find((s) => s.heading === 'Goals');
    expect(goals?.body).toBe('- [Q2] Ship the mobile app');
    // Other sections still present and untouched.
    expect(parsed.sections.map((s) => s.heading)).toEqual([...MODEL_SECTIONS]);
  });

  it('writeSection refuses to mutate a locked section', async () => {
    await saveModelOfYou(fm, MODEL_OF_YOU_TEMPLATE);
    await writeSection(fm, 'Writing voice', '<!-- locked -->\n- Terse, imperative');
    const wrote = await writeSection(fm, 'Writing voice', '- Verbose and flowery');
    expect(wrote).toBe(false);

    const parsed = parseModel((await loadModelOfYou(fm))!);
    const voice = parsed.sections.find((s) => s.heading === 'Writing voice');
    expect(voice?.body).toContain('Terse, imperative');
    expect(voice?.body).not.toContain('flowery');
  });
});
