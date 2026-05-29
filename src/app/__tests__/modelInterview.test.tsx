// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ModelInterview from '../components/ModelInterview';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('ModelInterview', () => {
  it('renders all five questions', async () => {
    (window as any).keel = { seedModelOfYou: vi.fn() };
    await act(async () => {
      root.render(<ModelInterview onComplete={() => {}} onCancel={() => {}} />);
    });
    expect(container.querySelectorAll('textarea').length).toBe(5);
    expect(container.textContent).toContain('What are you working on right now?');
  });

  it('submit is disabled until at least one answer is entered', async () => {
    (window as any).keel = { seedModelOfYou: vi.fn() };
    await act(async () => {
      root.render(<ModelInterview onComplete={() => {}} onCancel={() => {}} />);
    });
    const submit = Array.from(container.querySelectorAll('button')).find((b) =>
      /Save & build/.test(b.textContent ?? ''),
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(ta, 'Ship the app');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(submit.disabled).toBe(false);
  });

  it('calls seedModelOfYou with the answers and then onComplete', async () => {
    const seed = vi.fn().mockResolvedValue({ seededSections: ['Goals'] });
    const onComplete = vi.fn();
    (window as any).keel = { seedModelOfYou: seed };
    await act(async () => {
      root.render(<ModelInterview onComplete={onComplete} onCancel={() => {}} />);
    });

    const ta = container.querySelector('#q-workingOn') as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(ta, 'Ship the app');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const submit = Array.from(container.querySelectorAll('button')).find((b) =>
      /Save & build/.test(b.textContent ?? ''),
    ) as HTMLButtonElement;
    await act(async () => {
      submit.click();
    });
    await flush();

    expect(seed).toHaveBeenCalledTimes(1);
    expect(seed.mock.calls[0][0].workingOn).toBe('Ship the app');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
