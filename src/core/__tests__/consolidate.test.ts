import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { FileManager } from '../fileManager';
import type { LLMClient } from '../llmClient';
import { consolidateModel, dueForConsolidation } from '../workflows/consolidate';
import { MODEL_OF_YOU_TEMPLATE, loadModelOfYou, parseModel, saveModelOfYou } from '../modelOfYou';

function stubLLM(response: string): LLMClient {
  return { chat: async () => response } as unknown as LLMClient;
}

function recentDate(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().split('T')[0];
}

describe('dueForConsolidation', () => {
  it('runs on the configured day, once per day', () => {
    // Sunday = 0
    expect(dueForConsolidation(null, '2026-05-24', 0, 0)).toBe(true);
    expect(dueForConsolidation('2026-05-24', '2026-05-24', 0, 0)).toBe(false); // already ran today
    expect(dueForConsolidation('2026-05-17', '2026-05-20', 3, 0)).toBe(false); // not the day, recent
  });

  it('catches up if more than 10 days have elapsed', () => {
    expect(dueForConsolidation('2026-05-01', '2026-05-20', 3, 0)).toBe(true); // 19 days, off-day
    expect(dueForConsolidation('2026-05-15', '2026-05-20', 3, 0)).toBe(false); // 5 days, off-day
  });
});

describe('consolidateModel', () => {
  let tmpDir: string;
  let fm: FileManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-consolidate-'));
    fm = new FileManager(tmpDir);
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('no-ops when no model file exists', async () => {
    const result = await consolidateModel(fm, stubLLM('{"updates":{}}'));
    expect(result).toBeUndefined();
  });

  it('merges a section and writes retired items to Archive', async () => {
    await saveModelOfYou(
      fm,
      MODEL_OF_YOU_TEMPLATE.replace('## Goals\n', '## Goals\n- [now] Ship beta\n- [now] ship the beta\n'),
    );
    await fm.writeFile(`daily-log/${recentDate(3)}.md`, 'Worked on other things.');

    const llm = stubLLM(
      JSON.stringify({
        updates: { Goals: ['- [now] Launch v2'] },
        archive: ['- Ship beta — archived 2026-05-24 (shipped)'],
        narrative: 'Tightened.\nUpdated: 2026-05-24',
      }),
    );
    const result = await consolidateModel(fm, llm, { userName: 'Medha' });

    expect(result?.consolidated).toBe(true);
    expect(result?.changedSections).toContain('Goals');
    expect(result?.archived).toBe(true);

    const parsed = parseModel((await loadModelOfYou(fm))!);
    expect(parsed.sections.find((s) => s.heading === 'Goals')?.body).toContain('Launch v2');
    expect(parsed.sections.find((s) => s.heading === 'Archive')?.body).toContain('Ship beta');
  });

  it('does not touch a locked section', async () => {
    await saveModelOfYou(
      fm,
      MODEL_OF_YOU_TEMPLATE.replace('## Goals\n', '## Goals\n<!-- locked -->\n- keep me\n'),
    );
    await fm.writeFile(`daily-log/${recentDate(2)}.md`, 'activity');
    const llm = stubLLM('{"updates":{"Goals":["- replaced"]}}');
    const result = await consolidateModel(fm, llm);
    expect(result?.skippedLocked).toContain('Goals');
    expect((await loadModelOfYou(fm))!).toContain('- keep me');
  });
});
