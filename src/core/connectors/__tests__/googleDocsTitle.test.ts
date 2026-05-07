// Regression tests for the Google Doc export title selection bug.
// In production we saw two failure modes:
//   (a) titles defaulting to "Keel Export" when the LLM omitted the field
//   (b) titles set to the user's literal last chat message
// The fix moves the fallback from a hardcoded default to a content-derived
// title, and the toolExecutor drops obviously-prompt-shaped titles before
// they reach the connector. These tests cover the deriver in isolation.

import { describe, it, expect } from 'vitest';
import { deriveTitleFromMarkdown } from '../googleDocs';

describe('deriveTitleFromMarkdown', () => {
  it('uses the first H1 when present', () => {
    const md = '# Q3 Sales Plan\n\nSome body text.';
    expect(deriveTitleFromMarkdown(md)).toBe('Q3 Sales Plan');
  });

  it('strips inline markdown from headings', () => {
    const md = '# **Quarterly** *plan* with `code` and a [link](https://x.com)';
    expect(deriveTitleFromMarkdown(md)).toBe('Quarterly plan with code and a link');
  });

  it('falls back to H2 when no H1', () => {
    const md = '## Section A\n\nBody.';
    expect(deriveTitleFromMarkdown(md)).toBe('Section A');
  });

  it('falls back to first non-empty line when no headings', () => {
    const md = '\n\nSome opening sentence.\n\nMore.';
    expect(deriveTitleFromMarkdown(md)).toBe('Some opening sentence.');
  });

  it('skips list items when picking the fallback line', () => {
    const md = '- first bullet\n- second bullet\n\nReal opener.';
    expect(deriveTitleFromMarkdown(md)).toBe('Real opener.');
  });

  it('returns "Keel Export" only when content is empty', () => {
    expect(deriveTitleFromMarkdown('')).toBe('Keel Export');
    expect(deriveTitleFromMarkdown('   \n\n  ')).toBe('Keel Export');
  });

  it('truncates very long titles at a word boundary', () => {
    const longHeading = '# ' + 'word '.repeat(40).trim();
    const result = deriveTitleFromMarkdown(longHeading);
    expect(result.length).toBeLessThanOrEqual(81); // 80 + ellipsis
    expect(result.endsWith('…')).toBe(true);
    expect(result.startsWith('word')).toBe(true);
  });

  it('does NOT echo back user-prompt-shaped text — bug regression', () => {
    // The original symptom: the model passed the user's last message as title.
    // The deriver runs only when title is empty, but the test pins the contract:
    // given real markdown content, the deriver picks the content's heading,
    // never anything resembling a user prompt.
    const md = '# Sales by Region\n\n| Region | Revenue |\n| --- | --- |\n| West | $1M |';
    const userPrompt = 'Great. a Google document for me with this table?';
    const result = deriveTitleFromMarkdown(md);
    expect(result).toBe('Sales by Region');
    expect(result).not.toBe(userPrompt);
  });
});
