import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';

// logActivity opens a real SQLite DB in the temp workspace; on Windows the open
// handle blocks fs.rm cleanup (EBUSY). The workflow only needs it as a no-op.
vi.mock('../db', () => ({ logActivity: () => {} }));

import * as os from 'os';
import * as path from 'path';
import { FileManager } from '../fileManager';
import type { LLMClient } from '../llmClient';
import { backfillModel } from '../workflows/backfill';
import { loadModelOfYou, parseModel } from '../modelOfYou';

let tmpDir: string;
let fm: FileManager;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-backfill-'));
  fm = new FileManager(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function stubLLM(response: string) {
  let lastUser = '';
  let lastSystem = '';
  const client = {
    chat: async (messages: { content: string }[], systemPrompt: string) => {
      lastUser = messages[messages.length - 1]?.content ?? '';
      lastSystem = systemPrompt;
      return response;
    },
    _lastUser: () => lastUser,
    _lastSystem: () => lastSystem,
  };
  return client as unknown as LLMClient & { _lastUser: () => string; _lastSystem: () => string };
}

function recentDate(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().split('T')[0];
}

describe('backfillModel', () => {
  it('no-ops for a brand-new workspace with no history', async () => {
    const llm = stubLLM('{"updates":{"Goals":["- nope"]}}');
    const result = await backfillModel(fm, llm);
    expect(result?.seeded).toBe(false);
    expect(result?.sourceFiles).toBe(0);
    expect(await loadModelOfYou(fm)).toBeNull();
  });

  it('seeds from daily logs and applies the merged model', async () => {
    await fm.writeFile(`daily-log/${recentDate(5)}.md`, '# Daily Log\n## EOD\n- Shipped the mobile app');
    await fm.writeFile(`daily-log/${recentDate(40)}.md`, '# Daily Log\n## EOD\n- Worked on Pro tier');
    const llm = stubLLM(
      JSON.stringify({
        updates: { Goals: ['- [now] Ship the mobile app', '- [strategic] Launch Pro'] },
        narrative: 'Founder building Keel.\nUpdated: ' + recentDate(0),
      }),
    );
    const result = await backfillModel(fm, llm, { userName: 'Medha' });
    expect(result?.seeded).toBe(true);
    expect(result?.sourceFiles).toBe(2);
    expect(result?.changedSections).toContain('Goals');

    const parsed = parseModel((await loadModelOfYou(fm))!);
    expect(parsed.sections.find((s) => s.heading === 'Goals')?.body).toContain('Ship the mobile app');
  });

  it('excludes daily logs older than the 90-day window', async () => {
    await fm.writeFile(`daily-log/${recentDate(5)}.md`, 'recent');
    await fm.writeFile(`daily-log/${recentDate(200)}.md`, 'ancient');
    const llm = stubLLM('{"updates":{}}');
    const result = await backfillModel(fm, llm);
    expect(result?.sourceFiles).toBe(1);
    expect(llm._lastUser()).toContain('recent');
    expect(llm._lastUser()).not.toContain('ancient');
  });

  it('respects the source char budget', async () => {
    const big = 'x'.repeat(5000);
    for (let i = 1; i <= 10; i++) await fm.writeFile(`daily-log/${recentDate(i)}.md`, big);
    const llm = stubLLM('{"updates":{}}');
    const result = await backfillModel(fm, llm, { maxSourceChars: 12_000 });
    // 12k budget / ~5k per file → only the most recent couple fit.
    expect(result!.sourceFiles).toBeLessThan(10);
    expect(result!.sourceChars).toBeLessThanOrEqual(12_000);
  });

  it('feeds captures as OWN WORDS, not as general history', async () => {
    await fm.writeFile(`daily-log/${recentDate(2)}.md`, 'Keel-voiced brief text');
    await fm.writeFile('inbox/cap.md', 'I need to ship the app');
    const llm = stubLLM('{"updates":{}}');
    await backfillModel(fm, llm, { userName: 'Medha' });
    const user = llm._lastUser();
    expect(user).toContain("OWN WORDS");
    expect(user).toContain('I need to ship the app');
  });

  it('preserves a locked section during backfill', async () => {
    await fm.writeFile(`daily-log/${recentDate(2)}.md`, 'history');
    await fm.writeFile(
      '.keel/model-of-me.md',
      '## Goals\n## Writing voice\n<!-- locked -->\n- Terse\n## Narrative\n',
    );
    const llm = stubLLM('{"updates":{"Writing voice":["- Verbose"]}}');
    const result = await backfillModel(fm, llm);
    expect(result?.skippedLocked).toContain('Writing voice');
    expect((await loadModelOfYou(fm))!).toContain('- Terse');
    expect((await loadModelOfYou(fm))!).not.toContain('- Verbose');
  });
});
