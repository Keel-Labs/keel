import type { Settings } from '../shared/types';

export function applyTheme(theme: Settings['theme']): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  document.body.dataset.theme = theme;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', theme === 'light' ? '#f6f1e8' : '#1a1a1a');
  }
}
