import type { Settings } from '../shared/types';

export const FORCE_ONBOARDING_ONCE_KEY = 'keel.debug.forceOnboardingOnce';

export function shouldShowOnboarding(
  settings: Settings,
  options: { forceOnboarding?: boolean } = {},
): boolean {
  if (options.forceOnboarding) {
    return true;
  }

  return !settings.hasCompletedOnboarding;
}

export function consumeForceOnboardingFlag(
  storage: Pick<Storage, 'getItem' | 'removeItem'> | null | undefined,
): boolean {
  if (!storage) {
    return false;
  }

  if (storage.getItem(FORCE_ONBOARDING_ONCE_KEY) !== '1') {
    return false;
  }

  storage.removeItem(FORCE_ONBOARDING_ONCE_KEY);
  return true;
}
