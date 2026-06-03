// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ProBriefDashboard from '../components/ProBriefDashboard';
import type { ProStatus } from '../../shared/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function setKeel(overrides: Partial<typeof window.keel>) {
  (window as any).keel = { ...(window as any).keel, ...overrides };
}

async function mount() {
  await act(async () => {
    root.render(<ProBriefDashboard />);
  });
  // Let async operations flush
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  // Default mock: free user
  setKeel({
    proStatus: async () => ({
      isPro: false,
      reason: 'no-active-entitlement',
    } as ProStatus),
    listFiles: async () => [],
    readFile: async () => '## Morning Brief\nTest brief',
    onMemoryUpdated: () => () => {},
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('ProBriefDashboard', () => {
  it('renders upsell teaser for free users', async () => {
    await mount();
    expect(container.textContent).toContain('Keel Pro Daily Briefs');
    expect(container.textContent).toContain('Upgrade to Pro');
  });

  it('calls proStatus on mount and handles loading', async () => {
    const proStatusSpy = vi.fn(async () => ({
      isPro: false,
      reason: 'no-active-entitlement',
    } as ProStatus));
    setKeel({ proStatus: proStatusSpy });
    await mount();
    expect(proStatusSpy).toHaveBeenCalled();
  });

  it('shows Pro empty state for subscribed users with no briefs', async () => {
    setKeel({
      proStatus: async () => ({
        isPro: true,
        subscription: { tier: 'pro' },
      } as ProStatus),
      listFiles: async () => [],
      onMemoryUpdated: () => () => {},
    });

    await mount();
    expect(container.textContent).toContain('Daily Briefs');
    expect(container.textContent).toContain('No briefings yet');
  });

  it('calls proStatus on mount', async () => {
    const proStatusSpy = vi.fn(async () => ({
      isPro: false,
      reason: 'no-active-entitlement',
    } as ProStatus));

    setKeel({ proStatus: proStatusSpy });

    await mount();
    expect(proStatusSpy).toHaveBeenCalled();
  });

  it('subscribes to memory updates', async () => {
    const onMemorySpy = vi.fn(() => () => {});
    setKeel({
      proStatus: async () => ({
        isPro: true,
        subscription: { tier: 'pro' },
      } as ProStatus),
      listFiles: async () => [],
      onMemoryUpdated: onMemorySpy,
    });

    await mount();
    expect(onMemorySpy).toHaveBeenCalled();
  });
});
