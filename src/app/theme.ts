import type { Settings } from '../shared/types';

const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)';

export function resolveTheme(theme: Settings['theme']): 'dark' | 'light' {
  if (theme !== 'system') return theme;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }
  return window.matchMedia(COLOR_SCHEME_QUERY).matches ? 'dark' : 'light';
}

export function applyTheme(theme: Settings['theme']): void {
  if (typeof document === 'undefined') return;
  const resolvedTheme = resolveTheme(theme);
  document.documentElement.dataset.theme = resolvedTheme;
  document.body.dataset.theme = resolvedTheme;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', resolvedTheme === 'light' ? '#f6f1e8' : '#1a1a1a');
  }
}
