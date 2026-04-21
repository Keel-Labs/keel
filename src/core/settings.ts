import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Settings } from '../shared/types';

function getDefaultBrainPath(): string {
  if (process.env.KEEL_DEFAULT_BRAIN_PATH) {
    return process.env.KEEL_DEFAULT_BRAIN_PATH;
  }

  return path.join(os.homedir() || process.env.HOME || '~', 'Keel');
}

function getStableConfigDir(): string {
  if (process.env.KEEL_CONFIG_DIR) {
    return process.env.KEEL_CONFIG_DIR;
  }

  const home = os.homedir() || process.env.HOME || '~';

  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Keel');
  }

  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Keel');
  }

  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'keel');
}

export function getDefaultSettings(): Settings {
  return {
    theme: 'system',
    hasCompletedOnboarding: false,
    provider: 'claude',
    anthropicApiKey: '',
    claudeModel: 'claude-sonnet-4-20250514',
    openaiApiKey: '',
    openaiModel: 'gpt-4o',
    openrouterApiKey: '',
    openrouterModel: '',
    openrouterBaseUrl: 'https://openrouter.ai/api/v1',
    ollamaModel: 'llama3.2',
    personality: 'default',
    brainPath: getDefaultBrainPath(),
    userName: '',
    timezone: '',
  };
}

function getLegacyConfigPath(brainPath?: string): string {
  const base = brainPath || getDefaultBrainPath();
  return path.join(base, '.config', 'settings.json');
}

function getStableConfigPath(): string {
  return path.join(getStableConfigDir(), 'settings.json');
}

function writeSettingsFile(configPath: string, settings: Settings): void {
  const configDir = path.dirname(configPath);
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(settings, null, 2), 'utf-8');
}

function normalizeSettings(parsed: Partial<Settings>, defaults: Settings): Settings {
  const { xClientId: _legacyXClientId, ...nextParsed } = parsed as Partial<Settings> & { xClientId?: string };
  const settings = { ...defaults, ...nextParsed };

  if (typeof parsed.hasCompletedOnboarding !== 'boolean') {
    settings.hasCompletedOnboarding = Object.keys(parsed).length > 0;
  }

  return settings;
}

function tryReadSettings(configPath: string, defaults: Settings): Settings | null {
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    return normalizeSettings(JSON.parse(raw), defaults);
  } catch {
    return null;
  }
}

export function loadSettings(): Settings {
  const defaults = getDefaultSettings();
  const stableConfigPath = getStableConfigPath();
  const stableSettings = tryReadSettings(stableConfigPath, defaults);

  if (stableSettings) {
    return stableSettings;
  }

  const legacyConfigPath = getLegacyConfigPath();
  const legacySettings = tryReadSettings(legacyConfigPath, defaults);

  if (legacySettings) {
    writeSettingsFile(stableConfigPath, legacySettings);
    return legacySettings;
  }

  return defaults;
}

export function saveSettings(settings: Settings): void {
  const normalized = normalizeSettings(settings, getDefaultSettings());
  writeSettingsFile(getStableConfigPath(), normalized);
  writeSettingsFile(getLegacyConfigPath(normalized.brainPath), normalized);
}
