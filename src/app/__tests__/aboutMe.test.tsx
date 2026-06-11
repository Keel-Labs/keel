// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import AboutMe from '../components/AboutMe';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function setKeel(readFile: (p: string) => Promise<string>) {
  (window as unknown as { keel: { readFile: typeof readFile } }).keel = { readFile };
}

async function mount() {
  await act(async () => {
    root.render(<AboutMe />);
  });
  // Let the readFile promise + state update flush.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const SEED = `<!-- Keel model-of-you. Edit freely. -->

## Goals
- [now] Ship the mobile app
- [strategic] Launch Pro

## People
<!-- Nothing recorded yet. Add real people here. -->

## Writing voice
<!-- locked -->
- Terse and imperative

## Narrative
Medha is the founder of Keel.
Updated: 2026-05-28.`;

describe('AboutMe', () => {
  it('renders sections, bullets, lock chip, empty hint, and prose from the model file', async () => {
    setKeel(async () => SEED);
    await mount();
    const text = container.textContent ?? '';

    expect(text).toContain('About Me');
    expect(text).toContain('Goals');
    expect(text).toContain('Ship the mobile app');
    expect(text).toContain('Launch Pro');
    // Locked section shows a chip and keeps its content.
    expect(text).toContain('Locked');
    expect(text).toContain('Terse and imperative');
    // People placeholder comment becomes a muted empty hint, not raw comment syntax.
    expect(text).toContain('Add real people here.');
    // No raw comment syntax leaks into the rendered sections (the footnote
    // legitimately shows <!-- locked --> as instructional text, so scope to the grid).
    expect(container.querySelector('.about-me__grid')?.textContent ?? '').not.toContain('<!--');
    // Narrative prose renders.
    expect(text).toContain('founder of Keel');
    // Bullets render as list items.
    expect(container.querySelectorAll('.about-me__list li').length).toBeGreaterThanOrEqual(2);
    // Exactly one lock chip (Writing voice).
    expect(container.querySelectorAll('.about-me__lock-chip').length).toBe(1);
  });

  it('shows the Pro upsell teaser when no model file exists', async () => {
    setKeel(async () => {
      throw new Error('ENOENT');
    });
    await mount();
    const text = container.textContent ?? '';
    expect(text).toContain('Let Keel learn who you are');
    expect(text).toContain('Every chat gets more you-aware');
    expect(container.querySelector('.about-me__card')).toBeNull();
  });

  it('treats an empty file as no model (teaser)', async () => {
    setKeel(async () => '   \n');
    await mount();
    expect(container.textContent ?? '').toContain('Let Keel learn who you are');
  });

  it('renders an Archive section with the de-emphasized modifier', async () => {
    setKeel(async () => `## Goals\n- [now] Ship\n\n## Archive\n- Old goal — archived 2026-05-24 (done)`);
    await mount();
    const archiveCard = Array.from(container.querySelectorAll('.about-me__card')).find((c) =>
      /Archive/.test(c.querySelector('.about-me__card-title')?.textContent ?? ''),
    );
    expect(archiveCard).toBeTruthy();
    expect(archiveCard!.className).toContain('about-me__card--archive');
    expect(archiveCard!.textContent).toContain('Old goal');
  });
});
