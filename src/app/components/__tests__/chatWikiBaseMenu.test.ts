import { describe, expect, it } from 'vitest';
import { filterWikiBases } from '../chatWikiBaseMenu';

const WIKI_BASES = [
  {
    basePath: 'knowledge-bases/star-wars-ecosystem',
    slug: 'star-wars-ecosystem',
    title: 'Star Wars Ecosystem',
    description: 'Dense interlinked sample wiki.',
    updatedAt: 3,
  },
  {
    basePath: 'knowledge-bases/founder-notes',
    slug: 'founder-notes',
    title: 'Founder Notes',
    description: 'Product strategy and operating cadence.',
    updatedAt: 2,
  },
  {
    basePath: 'knowledge-bases/customer-research',
    slug: 'customer-research',
    title: 'Customer Research',
    description: 'Interview summaries and JTBD themes.',
    updatedAt: 1,
  },
];

describe('filterWikiBases', () => {
  it('returns every wiki base when the search is blank', () => {
    expect(filterWikiBases(WIKI_BASES, '   ')).toEqual(WIKI_BASES);
  });

  it('filters by title matches', () => {
    expect(filterWikiBases(WIKI_BASES, 'founder')).toEqual([WIKI_BASES[1]]);
  });

  it('does not match against descriptions', () => {
    expect(filterWikiBases(WIKI_BASES, 'interview')).toEqual([]);
  });
});
