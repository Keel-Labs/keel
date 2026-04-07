import { describe, expect, it } from 'vitest';
import { formatWikiChatCitations } from '../wikiChatCitations';

describe('formatWikiChatCitations', () => {
  it('replaces inline wiki paths with stable numbered references', () => {
    const result = formatWikiChatCitations(
      'The network becomes the attack surface (knowledge-bases/jeetu-leadership-offsite/wiki/concepts/compiled/network-security-as-the-immediate-attack-surface.md).'
    );

    expect(result.content).toContain('The network becomes the attack surface [[1]](knowledge-bases/jeetu-leadership-offsite/wiki/concepts/compiled/network-security-as-the-immediate-attack-surface.md).');
    expect(result.content).toContain('**References**');
    expect(result.content).toContain('1. [Concept: Network Security As The Immediate Attack Surface](knowledge-bases/jeetu-leadership-offsite/wiki/concepts/compiled/network-security-as-the-immediate-attack-surface.md)');
  });

  it('deduplicates repeated citations and converts the trailing wiki citation block into references', () => {
    const result = formatWikiChatCitations([
      'Point one (knowledge-bases/base/wiki/sources/we-have-a-crisis.md).',
      'Point two (knowledge-bases/base/wiki/sources/we-have-a-crisis.md).',
      '',
      '**Wiki citations**',
      '- [knowledge-bases/base/wiki/sources/we-have-a-crisis.md]',
    ].join('\n'));

    expect(result.content).toContain('Point one.');
    expect(result.content).toContain('Point two [[1]](knowledge-bases/base/wiki/sources/we-have-a-crisis.md).');
    expect(result.content.match(/1\. \[Source: We Have A Crisis]/g)?.length).toBe(1);
  });

  it('maps raw source citations to the visible wiki source page', () => {
    const result = formatWikiChatCitations(
      'The detailed notes are here (knowledge-bases/base/raw/anthropic-crisis/source.md).'
    );

    expect(result.content).toContain('[[1]](knowledge-bases/base/wiki/sources/anthropic-crisis.md)');
    expect(result.references[0]?.navigationPath).toBe('knowledge-bases/base/wiki/sources/anthropic-crisis.md');
  });

  it('rewrites inline source lines that use backticked file paths', () => {
    const result = formatWikiChatCitations([
      'Open question remains unresolved.',
      'Source: `knowledge-bases/cisco-cloud-control/wiki/open-questions/compiled/what-is-the-exact-relationship-between-ai-canvas.md`',
    ].join('\n'));

    expect(result.content).toContain('Source: [[1]](knowledge-bases/cisco-cloud-control/wiki/open-questions/compiled/what-is-the-exact-relationship-between-ai-canvas.md)');
    expect(result.content).not.toContain('`knowledge-bases/cisco-cloud-control/');
  });

  it('converts plain numbered citations into clickable references', () => {
    const result = formatWikiChatCitations([
      'Key takeaway [1].',
      '',
      '**Wiki citations**',
      '- [knowledge-bases/base/wiki/sources/slide-1.md]',
    ].join('\n'));

    expect(result.content).toContain('Key takeaway [[1]](knowledge-bases/base/wiki/sources/slide-1.md).');
  });

  it('keeps only the last citation in a consecutive run of lines with the same source', () => {
    const result = formatWikiChatCitations([
      '- First point [1]',
      '- Second point [1]',
      '- Third point [1]',
      '',
      '**Wiki citations**',
      '- [knowledge-bases/base/wiki/sources/slide-1.md]',
    ].join('\n'));

    expect(result.content).toContain('- First point');
    expect(result.content).toContain('- Second point');
    expect(result.content).toContain('- Third point [[1]](knowledge-bases/base/wiki/sources/slide-1.md)');
    expect(result.content).not.toContain('- First point [[1]](knowledge-bases/base/wiki/sources/slide-1.md)');
    expect(result.content).not.toContain('- Second point [[1]](knowledge-bases/base/wiki/sources/slide-1.md)');
  });

  it('renders successive citations as separate markdown links', () => {
    const result = formatWikiChatCitations([
      'Combined evidence [1][2].',
      '',
      '**Wiki citations**',
      '- [knowledge-bases/base/wiki/sources/slide-1.md]',
      '- [knowledge-bases/base/wiki/concepts/compiled/platform-of-record.md]',
    ].join('\n'));

    expect(result.content).toContain('Combined evidence [[1]](knowledge-bases/base/wiki/sources/slide-1.md) [[2]](knowledge-bases/base/wiki/concepts/compiled/platform-of-record.md).');
  });
});
