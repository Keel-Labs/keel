import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { FileManager } from '../fileManager';
import type { LLMClient } from '../llmClient';
import { updateModelFromEod } from '../workflows/modelUpdate';
import {
  MODEL_OF_YOU_PATH,
  MODEL_OF_YOU_TEMPLATE,
  loadModelOfYou,
  parseModel,
  saveModelOfYou,
} from '../modelOfYou';

let tmpDir: string;
let fm: FileManager;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-modelupd-'));
  fm = new FileManager(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// Minimal stub: updateModelFromEod only ever calls llmClient.chat().
function stubLLM(response: string): LLMClient {
  let lastSystemPrompt = '';
  let lastUserContent = '';
  const client = {
    chat: async (messages: { content: string }[], systemPrompt: string) => {
      lastSystemPrompt = systemPrompt;
      lastUserContent = messages[messages.length - 1]?.content ?? '';
      return response;
    },
    _lastSystemPrompt: () => lastSystemPrompt,
    _lastUserContent: () => lastUserContent,
  };
  return client as unknown as LLMClient;
}

describe('updateModelFromEod', () => {
  it('is a no-op when no model file exists (non-Pro / unseeded)', async () => {
    const llm = stubLLM('{"updates":{"Goals":["- should not be written"]}}');
    const result = await updateModelFromEod(fm, llm, { eodSummary: 'Shipped a thing.' });
    expect(result).toBeUndefined();
    expect(await loadModelOfYou(fm)).toBeNull();
  });

  it('applies merged section bodies and a narrative', async () => {
    await saveModelOfYou(fm, MODEL_OF_YOU_TEMPLATE);
    const llm = stubLLM(
      JSON.stringify({
        updates: {
          Goals: ['- [now] Ship the mobile app', '- [strategic] Launch Pro'],
          'Recurring themes': ['- Shipping Keel — first noticed: 2026-04-06'],
        },
        narrative: 'I noticed Medha keeps circling back to shipping.\nUpdated: 2026-05-28.',
      }),
    );

    const result = await updateModelFromEod(fm, llm, {
      eodSummary: 'Worked on the mobile app build.',
      userName: 'Medha',
    });

    expect(result?.updated).toBe(true);
    expect(result?.changedSections).toContain('Goals');
    expect(result?.changedSections).toContain('Narrative');

    const parsed = parseModel((await loadModelOfYou(fm))!);
    expect(parsed.sections.find((s) => s.heading === 'Goals')?.body).toContain('Ship the mobile app');
    expect(parsed.sections.find((s) => s.heading === 'Narrative')?.body).toContain('keeps circling back');
  });

  it('never mutates a locked section', async () => {
    const locked = MODEL_OF_YOU_TEMPLATE.replace(
      '## Writing voice\n',
      '## Writing voice\n<!-- locked -->\n- Terse and imperative\n',
    );
    await saveModelOfYou(fm, locked);
    const llm = stubLLM('{"updates":{"Writing voice":["- Flowery and verbose"]}}');

    const result = await updateModelFromEod(fm, llm, { eodSummary: 'x', userName: 'Medha' });
    expect(result?.skippedLocked).toContain('Writing voice');

    const parsed = parseModel((await loadModelOfYou(fm))!);
    const voice = parsed.sections.find((s) => s.heading === 'Writing voice');
    expect(voice?.body).toContain('Terse and imperative');
    expect(voice?.body).not.toContain('Flowery');
  });

  it('ignores hallucinated section names', async () => {
    await saveModelOfYou(fm, MODEL_OF_YOU_TEMPLATE);
    const llm = stubLLM('{"updates":{"Favorite Color":["- Blue"]}}');
    const result = await updateModelFromEod(fm, llm, { eodSummary: 'x' });
    expect(result?.updated).toBe(false);
    expect(parseModel((await loadModelOfYou(fm))!).sections.some((s) => s.heading === 'Favorite Color')).toBe(false);
  });

  it('tolerates non-JSON LLM output without throwing', async () => {
    await saveModelOfYou(fm, MODEL_OF_YOU_TEMPLATE);
    const llm = stubLLM('Sorry, I cannot help with that.');
    const result = await updateModelFromEod(fm, llm, { eodSummary: 'x' });
    expect(result).toBeUndefined();
    // File left intact.
    expect(await loadModelOfYou(fm)).toContain('## Goals');
  });

  it('feeds captures (own words) and withholds the EOD summary from voice sourcing', async () => {
    await saveModelOfYou(fm, MODEL_OF_YOU_TEMPLATE);
    await fm.writeFile('inbox/2026-05-20-cap.md', '## Original\nI need to ship the mobile app.');
    const llm = stubLLM('{"updates":{}}');
    await updateModelFromEod(fm, llm, { eodSummary: 'Keel-voiced recap text.', userName: 'Medha' });

    const userContent = (llm as unknown as { _lastUserContent: () => string })._lastUserContent();
    const systemPrompt = (llm as unknown as { _lastSystemPrompt: () => string })._lastSystemPrompt();
    expect(userContent).toContain('I need to ship the mobile app.');
    // The prompt instructs that voice/style must not be drawn from the EOD summary.
    expect(systemPrompt).toMatch(/Writing voice and Working style: draw ONLY from the user/);
  });
});
