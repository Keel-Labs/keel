import { app } from 'electron';
import log from 'electron-log/main';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadSettings } from '../src/core/settings';

// All diagnostics stay on disk. Nothing is ever sent off the user's machine.
// Path is the OS default: ~/Library/Logs/Keel/main.log on macOS.

let initialized = false;

export function initLogger(): void {
  if (initialized) return;
  initialized = true;

  log.transports.file.maxSize = 10 * 1024 * 1024; // 10 MB before rotation
  log.transports.file.level = 'info';
  log.transports.console.level = 'debug';
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

  log.initialize();

  process.on('uncaughtException', (err) => {
    log.error('uncaughtException:', err?.stack || err);
  });
  process.on('unhandledRejection', (reason) => {
    const r = reason as Error | undefined;
    log.error('unhandledRejection:', r?.stack || r);
  });

  log.info(`Keel ${app.getVersion()} starting on ${process.platform} ${os.arch()} (Node ${process.versions.node}, Electron ${process.versions.electron})`);
}

export const logger = log;

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

function sanitize(text: string): string {
  // Replace the user's home directory with ~ to avoid leaking the username.
  const home = os.homedir();
  if (!home) return text;
  return text.split(home).join('~');
}

function readLastLines(filePath: string, n: number): string {
  try {
    if (!fs.existsSync(filePath)) return '(no log file yet)';
    const buf = fs.readFileSync(filePath, 'utf8');
    const lines = buf.split('\n');
    const tail = lines.slice(Math.max(0, lines.length - n)).join('\n');
    return sanitize(tail);
  } catch (err) {
    return `(failed to read log: ${(err as Error).message})`;
  }
}

function configuredProviders(): string {
  try {
    const s = loadSettings();
    const present: string[] = [];
    if (s.anthropicApiKey) present.push('Anthropic');
    if (s.openaiApiKey) present.push('OpenAI');
    if (s.openrouterApiKey) present.push('OpenRouter');
    if (s.ollamaModel) present.push('Ollama');
    return present.length ? present.join(', ') : '(none)';
  } catch {
    return '(unable to read settings)';
  }
}

function activeSettingsSummary(): string {
  try {
    const s = loadSettings();
    const modelByProvider: Record<string, string> = {
      claude: s.claudeModel,
      openai: s.openaiModel,
      openrouter: s.openrouterModel,
      ollama: s.ollamaModel,
    };
    const lines = [
      `provider: ${s.provider}`,
      `model: ${modelByProvider[s.provider] || '(default)'}`,
      `brainPath: ${sanitize(s.brainPath || '')}`,
      `theme: ${s.theme}`,
      `personality: ${s.personality || '(default)'}`,
      `timezone: ${s.timezone || '(auto)'}`,
    ];
    return lines.join('\n');
  } catch (err) {
    return `(unable to read settings: ${(err as Error).message})`;
  }
}

export function buildDiagnostics(): string {
  const version = app.getVersion();
  const logFile = log.transports.file.getFile().path;
  const tail = readLastLines(logFile, 100);

  return [
    '## Keel diagnostic info',
    '',
    `- App version: ${version}`,
    `- Platform: ${process.platform} ${os.arch()} (${os.release()})`,
    `- Node: ${process.versions.node} / Electron: ${process.versions.electron} / Chrome: ${process.versions.chrome}`,
    `- Configured providers: ${configuredProviders()}`,
    '',
    '### Settings',
    '```',
    activeSettingsSummary(),
    '```',
    '',
    `### Last 100 lines of log (${sanitize(logFile)})`,
    '```',
    tail,
    '```',
  ].join('\n');
}
