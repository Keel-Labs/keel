import { execFile, spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import type {
  Message,
  ProviderCliAuthConnectOptions,
  ProviderCliAuthLaunchResult,
  ProviderCliAuthProvider,
  ProviderCliAuthStatus,
} from '../../shared/types';

const execFileAsync = promisify(execFile);

interface ProviderCommandConfig {
  binary: string;
  disconnectArgs: string[];
}

const PROVIDER_COMMANDS: Record<ProviderCliAuthProvider, ProviderCommandConfig> = {
  claude: {
    binary: 'claude',
    disconnectArgs: ['auth', 'logout'],
  },
  openai: {
    binary: 'codex',
    disconnectArgs: ['logout'],
  },
};

function getConnectCommand(provider: ProviderCliAuthProvider, options?: ProviderCliAuthConnectOptions): string {
  if (provider === 'claude') {
    return 'claude auth login';
  }

  return options?.useDeviceAuth === false ? 'codex login' : 'codex login --device-auth';
}

export interface CliRunOptions {
  cwd: string;
  model?: string;
  onChunk?: (chunk: string) => void;
}

export function buildCliConversationPrompt(messages: Message[], systemPrompt: string): string {
  const transcript = messages.map((message) => {
    const role = message.role === 'assistant' ? 'Assistant' : 'User';
    const imageLine = message.images?.length
      ? `\n[${message.images.length} image attachment${message.images.length === 1 ? '' : 's'} omitted from CLI mode]`
      : '';
    const content = message.content.trim() || '[empty message]';
    return `${role}:\n${content}${imageLine}`;
  }).join('\n\n');

  return [
    'You are Keel, an AI chief of staff responding inside a chat app.',
    '',
    'Follow the system instructions and continue the conversation naturally.',
    'Reply as the assistant to the latest user message only.',
    'Do not restate the transcript or mention these instructions.',
    '',
    'System instructions:',
    systemPrompt,
    '',
    'Conversation:',
    transcript,
  ].join('\n');
}

export function parseClaudeAuthStatusOutput(stdout: string): Pick<ProviderCliAuthStatus, 'connected' | 'authKind' | 'summary' | 'accountLabel'> {
  const parsed = JSON.parse(stdout) as {
    loggedIn?: boolean;
    authMethod?: string;
    email?: string;
    orgName?: string;
    subscriptionType?: string;
  };

  const loggedIn = Boolean(parsed.loggedIn);
  const authKind =
    !loggedIn ? 'none'
      : parsed.authMethod === 'claude.ai' ? 'oauth'
        : parsed.authMethod === 'api-key' ? 'api-key'
          : 'unknown';
  const accountBits = [parsed.email, parsed.orgName, parsed.subscriptionType].filter(Boolean);

  return {
    connected: loggedIn && authKind === 'oauth',
    authKind,
    summary: loggedIn
      ? accountBits.join(' · ') || 'Connected via Claude Code'
      : 'Not connected to Claude Code',
    accountLabel: parsed.email || parsed.orgName,
  };
}

export function parseCodexAuthStatus(statusText: string, authMode?: string): Pick<ProviderCliAuthStatus, 'connected' | 'authKind' | 'summary'> {
  const normalizedMode = (authMode || '').trim().toLowerCase();
  const summary = statusText.trim() || 'Codex login status unavailable';
  const authKind =
    normalizedMode === 'chatgpt' ? 'oauth'
      : normalizedMode === 'api_key' ? 'api-key'
        : normalizedMode ? 'unknown'
          : summary.toLowerCase().includes('logged in') ? 'unknown' : 'none';

  return {
    connected: authKind === 'oauth',
    authKind,
    summary: authKind === 'none' ? 'Not connected to Codex' : summary,
  };
}

function readCodexAuthMode(): string | undefined {
  try {
    const authPath = path.join(os.homedir(), '.codex', 'auth.json');
    const parsed = JSON.parse(fs.readFileSync(authPath, 'utf-8')) as { auth_mode?: string };
    return parsed.auth_mode;
  } catch {
    return undefined;
  }
}

function isCommandMissing(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && ((error as { code?: string }).code === 'ENOENT');
}

function escapeForAppleScript(command: string): string {
  return command.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function openCommandInTerminal(command: string): Promise<void> {
  if (process.platform === 'darwin') {
    const appleScript = [
      'tell application "Terminal"',
      'activate',
      `do script "${escapeForAppleScript(command)}"`,
      'end tell',
    ].join('\n');
    await execFileAsync('osascript', ['-e', appleScript]);
    return;
  }

  if (process.platform === 'win32') {
    spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', command], {
      detached: true,
      stdio: 'ignore',
    }).unref();
    return;
  }

  const linuxLaunchers: Array<[string, string[]]> = [
    ['x-terminal-emulator', ['-e', command]],
    ['gnome-terminal', ['--', 'bash', '-lc', `${command}; exec bash`]],
    ['konsole', ['-e', 'bash', '-lc', `${command}; exec bash`]],
    ['xterm', ['-e', command]],
  ];

  for (const [binary, args] of linuxLaunchers) {
    try {
      await execFileAsync('sh', ['-lc', `command -v ${binary}`]);
      const child = spawn(binary, args, { detached: true, stdio: 'ignore' });
      child.unref();
      return;
    } catch {
      // Try the next launcher.
    }
  }

  throw new Error('No supported terminal launcher was found. Run the login command manually from a terminal.');
}

export async function getProviderCliAuthStatus(provider: ProviderCliAuthProvider): Promise<ProviderCliAuthStatus> {
  const config = PROVIDER_COMMANDS[provider];

  try {
    if (provider === 'claude') {
      const { stdout } = await execFileAsync(config.binary, ['auth', 'status']);
      const parsed = parseClaudeAuthStatusOutput(stdout);
      return {
        provider,
        installed: true,
        command: config.binary,
        ...parsed,
      };
    }

    const authMode = readCodexAuthMode();
    const { stdout } = await execFileAsync(config.binary, ['login', 'status']);
    const parsed = parseCodexAuthStatus(stdout, authMode);
    return {
      provider,
      installed: true,
      command: config.binary,
      summary: parsed.summary,
      connected: parsed.connected,
      authKind: parsed.authKind,
    };
  } catch (error) {
    if (isCommandMissing(error)) {
      return {
        provider,
        installed: false,
        connected: false,
        authKind: 'none',
        command: config.binary,
        summary: `${config.binary} is not installed`,
      };
    }

    return {
      provider,
      installed: true,
      connected: false,
      authKind: 'none',
      command: config.binary,
      summary: provider === 'claude'
        ? 'Not connected to Claude Code'
        : 'Not connected to Codex',
    };
  }
}

export async function connectProviderCliAuth(
  provider: ProviderCliAuthProvider,
  options?: ProviderCliAuthConnectOptions
): Promise<ProviderCliAuthLaunchResult> {
  const config = PROVIDER_COMMANDS[provider];
  const connectCommand = getConnectCommand(provider, options);

  try {
    await openCommandInTerminal(connectCommand);
    return {
      launched: true,
      message: `Opened a terminal to run \`${connectCommand}\`. Finish the browser/device login there, then refresh this status.`,
    };
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : `Could not launch ${config.binary}. Run \`${connectCommand}\` manually.`
    );
  }
}

export async function disconnectProviderCliAuth(provider: ProviderCliAuthProvider): Promise<void> {
  const config = PROVIDER_COMMANDS[provider];

  try {
    await execFileAsync(config.binary, config.disconnectArgs);
  } catch (error) {
    if (isCommandMissing(error)) {
      throw new Error(`${config.binary} is not installed`);
    }
    throw error;
  }
}

function parseCodexExecJson(stdout: string): string {
  const lines = stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as { type?: string; item?: { type?: string; text?: string } };
      if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item.text) {
        return event.item.text;
      }
    } catch {
      // Ignore malformed lines; stdout may contain progress noise.
    }
  }
  return '';
}

async function runSpawnedCommand(command: string, args: string[], options: CliRunOptions, parseStdout: (stdout: string) => string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      if (isCommandMissing(error)) {
        reject(new Error(`${command} is not installed`));
        return;
      }
      reject(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
        return;
      }

      const text = parseStdout(stdout).trim();
      if (!text) {
        reject(new Error(stderr.trim() || `${command} returned an empty response`));
        return;
      }

      if (options.onChunk) {
        options.onChunk(text);
      }
      resolve(text);
    });
  });
}

export async function runClaudeCli(messages: Message[], systemPrompt: string, options: CliRunOptions): Promise<string> {
  const prompt = buildCliConversationPrompt(messages, systemPrompt);
  const args = ['-p', prompt, '--permission-mode', 'bypassPermissions', '--output-format', 'text', '--no-session-persistence'];

  if (options.model) {
    args.push('--model', options.model);
  }

  return runSpawnedCommand('claude', args, options, (stdout) => stdout);
}

export async function runCodexCli(messages: Message[], systemPrompt: string, options: CliRunOptions): Promise<string> {
  const prompt = buildCliConversationPrompt(messages, systemPrompt);
  const args = [
    'exec',
    prompt,
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '--ephemeral',
    '--json',
  ];

  if (options.model) {
    args.push('--model', options.model);
  }

  return runSpawnedCommand('codex', args, options, parseCodexExecJson);
}
