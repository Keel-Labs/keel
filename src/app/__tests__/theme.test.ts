import { afterEach, describe, expect, it } from 'vitest';
import { applyTheme, resolveTheme } from '../theme';

const originalWindow = global.window;
const originalDocument = global.document;

afterEach(() => {
  global.window = originalWindow;
  global.document = originalDocument;
});

describe('theme helpers', () => {
  it('resolves system theme from the OS preference', () => {
    global.window = {
      matchMedia: () => ({ matches: false }),
    } as any;

    expect(resolveTheme('system')).toBe('light');
  });

  it('applies the resolved system theme to document datasets and theme-color', () => {
    const documentElement = { dataset: {} as Record<string, string> };
    const body = { dataset: {} as Record<string, string> };
    const meta = { setAttribute: (_name: string, value: string) => { meta.content = value; }, content: '' };

    global.window = {
      matchMedia: () => ({ matches: true }),
    } as any;
    global.document = {
      documentElement,
      body,
      querySelector: () => meta,
    } as any;

    applyTheme('system');

    expect(documentElement.dataset.theme).toBe('dark');
    expect(body.dataset.theme).toBe('dark');
    expect(meta.content).toBe('#1a1a1a');
  });
});
