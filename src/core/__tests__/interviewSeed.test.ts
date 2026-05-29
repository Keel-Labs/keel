import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { FileManager } from '../fileManager';
import { seedModelFromInterview } from '../workflows/interviewSeed';
import { loadModelOfYou, parseModel, saveModelOfYou, MODEL_OF_YOU_TEMPLATE } from '../modelOfYou';
import type { ModelInterviewAnswers } from '../../shared/types';

let tmpDir: string;
let fm: FileManager;

const FULL: ModelInterviewAnswers = {
  workingOn: 'Ship the mobile app\nLaunch Pro',
  people: '',
  recurringTheme: 'Getting Keel to the App Store',
  avoided: 'Recording the demo video',
  voice: 'Terse and direct, no fluff',
};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-interview-'));
  fm = new FileManager(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function body(content: string, heading: string): string | undefined {
  return parseModel(content).sections.find((s) => s.heading === heading)?.body;
}

describe('seedModelFromInterview', () => {
  it('creates the model file and maps answers to sections', async () => {
    const { seededSections } = await seedModelFromInterview(fm, FULL);
    const content = (await loadModelOfYou(fm))!;

    expect(seededSections).toEqual(['Goals', 'Recurring themes', 'Things avoided', 'Writing voice']);
    expect(body(content, 'Goals')).toBe('- Ship the mobile app\n- Launch Pro');
    expect(body(content, 'Recurring themes')).toContain('App Store');
    expect(body(content, 'Things avoided')).toContain('demo video');
    expect(body(content, 'Writing voice')).toContain('Terse and direct');
    // Skipped (empty) answer leaves its section untouched.
    expect(body(content, 'People')).toBe('');
  });

  it('splits inline enumerations into separate bullets', async () => {
    await seedModelFromInterview(fm, { ...FULL, workingOn: '1. App 2. Pro 3. Docs' });
    expect(body((await loadModelOfYou(fm))!, 'Goals')).toBe('- App\n- Pro\n- Docs');
  });

  it('treats interview answers as ground truth, overwriting an existing section', async () => {
    await saveModelOfYou(fm, MODEL_OF_YOU_TEMPLATE.replace('## Goals\n', '## Goals\n- old goal\n'));
    await seedModelFromInterview(fm, { ...FULL, workingOn: 'new goal' });
    const goals = body((await loadModelOfYou(fm))!, 'Goals');
    expect(goals).toBe('- new goal');
    expect(goals).not.toContain('old goal');
  });

  it('all-empty answers produce a valid (empty) model file', async () => {
    const { seededSections } = await seedModelFromInterview(fm, {
      workingOn: '', people: '', recurringTheme: '', avoided: '', voice: '',
    });
    expect(seededSections).toEqual([]);
    expect((await loadModelOfYou(fm))!).toContain('## Goals');
  });
});
