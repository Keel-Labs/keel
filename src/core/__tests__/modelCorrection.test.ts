import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { FileManager } from '../fileManager';
import { getToolsForContext } from '../tools/schemas';
import { MODEL_OF_YOU_TEMPLATE, loadModelOfYou, parseModel, saveModelOfYou } from '../modelOfYou';

// db hits a native sqlite binding; the correction path only needs logActivity.
vi.mock('../db', () => ({
  logActivity: () => {},
  createReminder: () => 1,
  recordXPublishFailure: () => {},
  recordXPublishSuccess: () => {},
}));

// Imported after the mock is registered.
import { makeToolExecutor } from '../../../electron/toolExecutor';

describe('correct_model_of_you gating', () => {
  const base = { googleConnected: false, xConnected: false };

  it('is hidden unless the model file is seeded', () => {
    const without = getToolsForContext({ ...base }).map((t) => t.name);
    expect(without).not.toContain('correct_model_of_you');

    const withSeed = getToolsForContext({ ...base, modelOfYouSeeded: true }).map((t) => t.name);
    expect(withSeed).toContain('correct_model_of_you');
  });
});

describe('correct_model_of_you executor', () => {
  let tmpDir: string;
  let fm: FileManager;
  let execute: ReturnType<typeof makeToolExecutor>;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-correct-'));
    fm = new FileManager(tmpDir);
    execute = makeToolExecutor({
      fileManager: fm,
      llmClient: {} as never,
      brainPath: tmpDir,
      exportPdf: async () => 'noop',
    });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('applies a correction to a section', async () => {
    await saveModelOfYou(fm, MODEL_OF_YOU_TEMPLATE);
    const result = await execute({
      id: 't1',
      name: 'correct_model_of_you',
      input: {
        section: 'Things avoided',
        lines: ['- I finished the Q3 plan last week.'],
        confirmation: 'Got it — removed the Q3 plan from things avoided.',
      },
    });
    expect(result.isError).toBe(false);
    expect(result.content).toContain('Got it');
    const body = parseModel((await loadModelOfYou(fm))!).sections.find((s) => s.heading === 'Things avoided')?.body;
    expect(body).toContain('finished the Q3 plan');
  });

  it('refuses a locked section', async () => {
    await saveModelOfYou(fm, MODEL_OF_YOU_TEMPLATE.replace('## Goals\n', '## Goals\n<!-- locked -->\n- [now] Ship\n'));
    const result = await execute({
      id: 't2',
      name: 'correct_model_of_you',
      input: { section: 'Goals', lines: ['- something else'] },
    });
    expect(result.isError).toBe(true);
    expect(result.content).toContain('locked');
    expect((await loadModelOfYou(fm))!).toContain('- [now] Ship');
  });

  it('errors when no model file exists', async () => {
    const result = await execute({
      id: 't3',
      name: 'correct_model_of_you',
      input: { section: 'Goals', lines: ['- x'] },
    });
    expect(result.isError).toBe(true);
  });

  it('rejects an unknown section name', async () => {
    await saveModelOfYou(fm, MODEL_OF_YOU_TEMPLATE);
    const result = await execute({
      id: 't4',
      name: 'correct_model_of_you',
      input: { section: 'Favorite Color', lines: ['- Blue'] },
    });
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Unknown section');
  });
});
