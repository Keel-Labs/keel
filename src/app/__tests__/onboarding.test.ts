import { describe, expect, it } from 'vitest';
import { consumeForceOnboardingFlag, FORCE_ONBOARDING_ONCE_KEY, shouldShowOnboarding } from '../onboarding';
import type { Settings } from '../../shared/types';

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    theme: 'dark',
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
    brainPath: '/tmp/keel',
    teamBrainPath: '',
    userName: '',
    dailyBriefTime: '',
    eodTime: '',
    timezone: '',
    ...overrides,
  };
}

describe('onboarding startup gating', () => {
  it('shows onboarding on true first run', () => {
    expect(shouldShowOnboarding(makeSettings())).toBe(true);
  });

  it('skips onboarding after completion even without an API key', () => {
    expect(shouldShowOnboarding(makeSettings({
      hasCompletedOnboarding: true,
      anthropicApiKey: '',
      openaiApiKey: '',
      openrouterApiKey: '',
      provider: 'claude',
    }))).toBe(false);
  });

  it('honors the one-shot debug override', () => {
    expect(shouldShowOnboarding(makeSettings({ hasCompletedOnboarding: true }), {
      forceOnboarding: true,
    })).toBe(true);
  });
});

describe('consumeForceOnboardingFlag', () => {
  it('returns true once and clears the flag', () => {
    const storage = new Map<string, string>([[FORCE_ONBOARDING_ONCE_KEY, '1']]);
    const fakeStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => {
        storage.delete(key);
      },
    };

    expect(consumeForceOnboardingFlag(fakeStorage)).toBe(true);
    expect(storage.has(FORCE_ONBOARDING_ONCE_KEY)).toBe(false);
    expect(consumeForceOnboardingFlag(fakeStorage)).toBe(false);
  });
});
