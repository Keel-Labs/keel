import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../connectors/googleDocs';

describe('parseMarkdown — GFM tables', () => {
  it('parses a basic Markdown table into a table section', () => {
    const md = [
      '| Name | Role | Notes |',
      '| --- | --- | --- |',
      '| Ada  | Eng  | Pioneer |',
      '| Bob  | PM   | Joined 2024 |',
    ].join('\n');

    const sections = parseMarkdown(md);

    expect(sections).toHaveLength(1);
    const table = sections[0];
    expect(table.type).toBe('table');
    if (table.type !== 'table') return;
    expect(table.headers).toEqual(['Name', 'Role', 'Notes']);
    expect(table.rows).toEqual([
      ['Ada', 'Eng', 'Pioneer'],
      ['Bob', 'PM', 'Joined 2024'],
    ]);
  });

  it('still parses surrounding paragraphs around the table', () => {
    const md = [
      'Intro paragraph.',
      '',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      'Trailing paragraph.',
    ].join('\n');

    const sections = parseMarkdown(md);
    const types = sections.map((s) => s.type);
    expect(types).toEqual(['paragraph', 'table', 'paragraph']);
    const table = sections[1];
    if (table.type !== 'table') throw new Error('expected table section');
    expect(table.headers).toEqual(['A', 'B']);
    expect(table.rows).toEqual([['1', '2']]);
  });

  it('does not treat a row of pipes without a separator as a table', () => {
    const md = ['| Not | A | Table |', '| Just | More | Text |'].join('\n');
    const sections = parseMarkdown(md);
    expect(sections.every((s) => s.type !== 'table')).toBe(true);
  });

  it('strips inline markdown from cell contents', () => {
    const md = [
      '| Col |',
      '| --- |',
      '| **bold** and `code` |',
    ].join('\n');
    const sections = parseMarkdown(md);
    const table = sections[0];
    expect(table.type).toBe('table');
    if (table.type !== 'table') return;
    expect(table.rows).toEqual([['bold and code']]);
  });
});
