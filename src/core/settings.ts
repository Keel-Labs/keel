import * as fs from 'fs';
import * as path from 'path';
import type { Settings } from '../shared/types';

const DEFAULT_SETTINGS: Settings = {
  provider: 'claude',
  anthropicApiKey: '',
  claudeModel: 'claude-sonnet-4-20250514',
  openaiApiKey: '',
  openaiModel: 'gpt-4o',
  openrouterApiKey: '',
  openrouterModel: '',
  openrouterBaseUrl: 'https://openrouter.ai/api/v1',
  ollamaModel: 'llama3.2',
  brainPath: path.join(process.env.HOME || '~', 'Keel'),
  dailyBriefTime: '',
  eodTime: '',
  googleClientId: '',
  googleClientSecret: '',
};

function getConfigPath(brainPath?: string): string {
  const base = brainPath || DEFAULT_SETTINGS.brainPath;
  return path.join(base, '.config', 'settings.json');
}

export function loadSettings(): Settings {
  const configPath = getConfigPath();
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  const configPath = getConfigPath(settings.brainPath);
  const configDir = path.dirname(configPath);
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(settings, null, 2), 'utf-8');
}
