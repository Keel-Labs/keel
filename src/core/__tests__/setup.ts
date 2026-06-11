import { vi } from 'vitest';

// Mock Pro as active for all tests by default
// Tests that need to verify free-tier behavior can override this
vi.mock('../pro/entitlements', () => ({
  getProStatus: vi.fn(async () => ({
    isPro: true,
    subscription: { tier: 'pro' as const },
  })),
}));
