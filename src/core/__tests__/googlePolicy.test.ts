// Compliance-load-bearing module: these tests document the invariant
// Google asked us to demonstrate during OAuth verification — that
// Google user data cannot reach an LLM provider whose terms allow
// training on it. If these tests regress, OAuth verification is at
// risk. Update GOOGLE_COMPATIBLE_PROVIDERS deliberately, not by
// "fixing" a test.

import { describe, it, expect } from 'vitest';
import {
  canConnectGoogle,
  canSwitchProvider,
  isGoogleCompatible,
  suggestCompatibleProvider,
  GOOGLE_COMPATIBLE_PROVIDERS,
} from '../googlePolicy';
import { getDefaultSettings } from '../settings';

describe('googlePolicy', () => {
  describe('allowlist', () => {
    it('includes claude, openai, ollama', () => {
      expect(GOOGLE_COMPATIBLE_PROVIDERS.has('claude')).toBe(true);
      expect(GOOGLE_COMPATIBLE_PROVIDERS.has('openai')).toBe(true);
      expect(GOOGLE_COMPATIBLE_PROVIDERS.has('ollama')).toBe(true);
    });

    it('excludes openrouter', () => {
      // The reason this module exists. Do not add openrouter without
      // a TOS change from them or a parallel architecture change here.
      expect(GOOGLE_COMPATIBLE_PROVIDERS.has('openrouter')).toBe(false);
      expect(isGoogleCompatible('openrouter')).toBe(false);
    });
  });

  describe('canConnectGoogle', () => {
    it('allows connecting when on a compatible provider', () => {
      expect(canConnectGoogle('claude').ok).toBe(true);
      expect(canConnectGoogle('openai').ok).toBe(true);
      expect(canConnectGoogle('ollama').ok).toBe(true);
    });

    it('blocks connecting on OpenRouter with a user-facing reason', () => {
      const result = canConnectGoogle('openrouter');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/OpenRouter/);
        expect(result.reason).toMatch(/Google/);
      }
    });
  });

  describe('canSwitchProvider', () => {
    it('allows any switch when Google is not connected', () => {
      expect(canSwitchProvider('openrouter', false).ok).toBe(true);
      expect(canSwitchProvider('claude', false).ok).toBe(true);
    });

    it('allows switching between compatible providers when Google connected', () => {
      expect(canSwitchProvider('claude', true).ok).toBe(true);
      expect(canSwitchProvider('openai', true).ok).toBe(true);
      expect(canSwitchProvider('ollama', true).ok).toBe(true);
    });

    it('blocks switching to OpenRouter when Google connected', () => {
      const result = canSwitchProvider('openrouter', true);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.requiresGoogleDisconnect).toBe(true);
        expect(result.reason).toMatch(/disconnect/i);
      }
    });
  });

  describe('suggestCompatibleProvider', () => {
    it('prefers claude when its key is set', () => {
      const s = { ...getDefaultSettings(), anthropicApiKey: 'sk-ant-x' };
      expect(suggestCompatibleProvider(s)).toBe('claude');
    });

    it('falls back to openai when only openai is configured', () => {
      const s = { ...getDefaultSettings(), anthropicApiKey: '', openaiApiKey: 'sk-x' };
      expect(suggestCompatibleProvider(s)).toBe('openai');
    });

    it('returns claude as last-resort default', () => {
      const s = { ...getDefaultSettings(), anthropicApiKey: '', openaiApiKey: '', ollamaModel: '' };
      expect(suggestCompatibleProvider(s)).toBe('claude');
    });
  });
});
