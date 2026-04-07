import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getDefaultSettings, loadSettings, saveSettings } from '../settings';
import type { Settings } from '../../shared/types';

let tmpDir: string;

function stableConfigPath(): string {
  return path.join(process.env.KEEL_CONFIG_DIR as string, 'settings.json');
}

function legacyConfigPath(brainPath: string): string {
  return path.join(brainPath, '.config', 'settings.json');
}

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    ...getDefaultSettings(),
    ...overrides,
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-settings-test-'));
  process.env.KEEL_CONFIG_DIR = path.join(tmpDir, 'app-config');
  process.env.KEEL_DEFAULT_BRAIN_PATH = path.join(tmpDir, 'default-brain');
});

afterEach(() => {
  delete process.env.KEEL_CONFIG_DIR;
  delete process.env.KEEL_DEFAULT_BRAIN_PATH;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('settings persistence', () => {
  it('returns defaults for a pristine install', () => {
    const settings = loadSettings();

    expect(settings.hasCompletedOnboarding).toBe(false);
    expect(settings.theme).toBe('system');
    expect(settings.brainPath).toBe(path.join(tmpDir, 'default-brain'));
  });

  it('persists settings in a stable location and reloads custom brain paths', () => {
    const customBrainPath = path.join(tmpDir, 'custom-brain');
    const saved = makeSettings({
      brainPath: customBrainPath,
      hasCompletedOnboarding: true,
      userName: 'Sam',
    });

    saveSettings(saved);

    expect(fs.existsSync(stableConfigPath())).toBe(true);
    expect(fs.existsSync(legacyConfigPath(customBrainPath))).toBe(true);
    expect(loadSettings()).toEqual(saved);
  });

  it('migrates a legacy settings file and infers onboarding completion', () => {
    const legacySettings = {
      provider: 'openai',
      openaiApiKey: 'test-key',
      brainPath: path.join(tmpDir, 'legacy-brain'),
    };

    const legacyPath = legacyConfigPath(path.join(tmpDir, 'default-brain'));
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(legacyPath, JSON.stringify(legacySettings, null, 2), 'utf-8');

    const loaded = loadSettings();

    expect(loaded.provider).toBe('openai');
    expect(loaded.openaiApiKey).toBe('test-key');
    expect(loaded.hasCompletedOnboarding).toBe(true);
    expect(fs.existsSync(stableConfigPath())).toBe(true);
  });
});
