import { describe, expect, it } from 'vitest';
import {
  buildCliConversationPrompt,
  parseClaudeAuthStatusOutput,
  parseCodexAuthStatus,
} from '../connectors/providerCli';

describe('provider CLI helpers', () => {
  it('builds a transcript prompt with system instructions and image notes', () => {
    const prompt = buildCliConversationPrompt([
      {
        role: 'user',
        content: 'Summarize this.',
        images: [{ data: 'abc', mediaType: 'image/png' }],
        timestamp: 1,
      },
      {
        role: 'assistant',
        content: 'Here is the summary.',
        timestamp: 2,
      },
    ], 'Be concise.');

    expect(prompt).toContain('System instructions:\nBe concise.');
    expect(prompt).toContain('User:\nSummarize this.\n[1 image attachment omitted from CLI mode]');
    expect(prompt).toContain('Assistant:\nHere is the summary.');
  });

  it('parses Claude Code OAuth status output', () => {
    const status = parseClaudeAuthStatusOutput(JSON.stringify({
      loggedIn: true,
      authMethod: 'claude.ai',
      email: 'sam@example.com',
      orgName: 'Keel',
      subscriptionType: 'pro',
    }));

    expect(status.connected).toBe(true);
    expect(status.authKind).toBe('oauth');
    expect(status.accountLabel).toBe('sam@example.com');
    expect(status.summary).toContain('sam@example.com');
  });

  it('distinguishes Codex OAuth from API-key auth', () => {
    const oauthStatus = parseCodexAuthStatus('Logged in using ChatGPT', 'chatgpt');
    expect(oauthStatus.connected).toBe(true);
    expect(oauthStatus.authKind).toBe('oauth');

    const apiKeyStatus = parseCodexAuthStatus('Logged in using API key', 'api_key');
    expect(apiKeyStatus.connected).toBe(false);
    expect(apiKeyStatus.authKind).toBe('api-key');
  });
});
