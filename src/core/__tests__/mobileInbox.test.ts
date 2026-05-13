import { describe, expect, it } from 'vitest';
import {
  parseInboxName,
  parseFrontmatter,
  validateFrontmatter,
} from '../mobileInbox';

describe('parseInboxName', () => {
  it('accepts the canonical pattern', () => {
    const got = parseInboxName('20260509T142233Z__a1b2c3d4__9f0e.md');
    expect(got).not.toBeNull();
    expect(got).toMatchObject({
      timestamp: '20260509T142233Z',
      deviceId: 'a1b2c3d4',
      nonce: '9f0e',
    });
  });

  it('lowercases the hex device-id and nonce', () => {
    const got = parseInboxName('20260509T142233Z__A1B2C3D4__9F0E.md');
    expect(got?.deviceId).toBe('a1b2c3d4');
    expect(got?.nonce).toBe('9f0e');
  });

  it('rejects Dropbox-style conflict copies', () => {
    expect(
      parseInboxName('20260509T142233Z__a1b2c3d4__9f0e (conflicted copy 2026-05-09).md')
    ).toBeNull();
  });

  it('rejects iCloud-style duplicate suffixes', () => {
    expect(parseInboxName('20260509T142233Z__a1b2c3d4__9f0e 2.md')).toBeNull();
  });

  it('rejects in-progress atomic-write staging names', () => {
    expect(parseInboxName('.tmp__20260509T142233Z__a1b2c3d4__9f0e.md')).toBeNull();
  });

  it('rejects unsupported extensions (v0 is text-only)', () => {
    expect(parseInboxName('20260509T142233Z__a1b2c3d4__9f0e.m4a')).toBeNull();
    expect(parseInboxName('20260509T142233Z__a1b2c3d4__9f0e.jpg')).toBeNull();
    expect(parseInboxName('20260509T142233Z__a1b2c3d4__9f0e.json')).toBeNull();
  });

  it('rejects malformed timestamps and short device-ids', () => {
    expect(parseInboxName('2026-05-09T14:22:33Z__a1b2c3d4__9f0e.md')).toBeNull();
    expect(parseInboxName('20260509T142233Z__a1b__9f0e.md')).toBeNull();
    expect(parseInboxName('20260509T142233Z__a1b2c3d4__9f.md')).toBeNull();
  });
});

describe('parseFrontmatter', () => {
  it('extracts a flat block and returns the body separately', () => {
    const raw = `---
keel-capture: 1
kind: capture
device: iPhone 15 Pro
---

Body text goes here.
`;
    const { frontmatter, body } = parseFrontmatter(raw);
    expect(frontmatter['keel-capture']).toBe(1);
    expect(frontmatter.kind).toBe('capture');
    expect(frontmatter.device).toBe('iPhone 15 Pro');
    expect(body.trim()).toBe('Body text goes here.');
  });

  it('treats empty / null / ~ values as JS null', () => {
    const raw = `---
location: null
foo: ~
bar:
---
`;
    const { frontmatter } = parseFrontmatter(raw);
    expect(frontmatter.location).toBeNull();
    expect(frontmatter.foo).toBeNull();
    expect(frontmatter.bar).toBeNull();
  });

  it('handles CRLF line endings (Windows phone sync edge case)', () => {
    const raw = '---\r\nkeel-capture: 1\r\nkind: capture\r\n---\r\nhello\r\n';
    const { frontmatter, body } = parseFrontmatter(raw);
    expect(frontmatter['keel-capture']).toBe(1);
    expect(body.trim()).toBe('hello');
  });

  it('returns empty frontmatter when no block is present', () => {
    const { frontmatter, body } = parseFrontmatter('just a body, no header');
    expect(frontmatter).toEqual({});
    expect(body).toBe('just a body, no header');
  });
});

describe('validateFrontmatter', () => {
  it('accepts capture kind with integer marker', () => {
    expect(validateFrontmatter({ 'keel-capture': 1, kind: 'capture' })).toBeNull();
  });

  it('accepts kb-source kind with string marker', () => {
    expect(validateFrontmatter({ 'keel-capture': '1', kind: 'kb-source' })).toBeNull();
  });

  it('rejects missing marker', () => {
    expect(validateFrontmatter({ kind: 'capture' })).toMatch(/keel-capture/);
  });

  it('rejects unknown kind', () => {
    expect(validateFrontmatter({ 'keel-capture': 1, kind: 'audio' })).toMatch(/unsupported kind/);
  });

  it('rejects missing kind', () => {
    expect(validateFrontmatter({ 'keel-capture': 1 })).toMatch(/unsupported kind/);
  });
});
