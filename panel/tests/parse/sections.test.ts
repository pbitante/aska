import { describe, expect, it } from 'vitest';
import { parseList, splitSections } from '../../src/parse/sections';

describe('splitSections', () => {
  it('splits ## headings, normalizes keys and keeps ### inside', () => {
    const body = '\n## Looks For \nline one\n\n### detail\nmore\n\n## Questions\n- a\n';
    const { preamble, sections } = splitSections(body, 10);
    expect(preamble).toBeUndefined();
    expect(sections.map((s) => [s.heading, s.key, s.line])).toEqual([
      ['Looks For', 'looks for', 11],
      ['Questions', 'questions', 17],
    ]);
    expect(sections[0]!.text).toBe('line one\n\n### detail\nmore');
    expect(sections[0]!.textLine).toBe(12);
  });

  it('keeps a # that is part of the heading text', () => {
    expect(splitSections('## C# notes\nx\n', 1).sections[0]!.heading).toBe('C# notes');
    expect(splitSections('## Stance ##\nx\n', 1).sections[0]!.heading).toBe('Stance');
  });

  it('ignores ## lines inside fenced code blocks', () => {
    const body = '## Looks for\n```md\n## not a heading\n```\nafter\n';
    const { sections } = splitSections(body, 1);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.text).toBe('```md\n## not a heading\n```\nafter');
  });

  it('does not close a ``` fence with ~~~', () => {
    const body = '## A\n```\n~~~\n## still code\n```\n## B\nx\n';
    expect(splitSections(body, 1).sections.map((s) => s.heading)).toEqual(['A', 'B']);
  });

  it('reports non-blank text before the first heading', () => {
    expect(splitSections('\nintro\n## A\nx\n', 5).preamble).toEqual({ text: 'intro', line: 6 });
  });

  it('collapses internal whitespace in the heading key', () => {
    expect(splitSections('## Looks   For\nx\n', 1).sections[0]!.key).toBe('looks for');
  });

  it('treats ~~~ as a fence opener too', () => {
    const body = '## A\n~~~\n## in\n~~~\n## B\nx\n';
    expect(splitSections(body, 1).sections.map((s) => s.heading)).toEqual(['A', 'B']);
  });

  it('allows a heading indented up to 3 spaces', () => {
    expect(splitSections('   ## B\nx\n', 1).sections.map((s) => s.heading)).toEqual(['B']);
  });

  it('does not treat a heading indented 4 spaces as a heading', () => {
    const { sections, preamble } = splitSections('    ## B\nx\n', 1);
    expect(sections).toHaveLength(0);
    expect(preamble).toBeDefined();
  });

  it('reports an unclosed fence and does not lose the heading after it', () => {
    const { unclosedFence, sections } = splitSections('## Stance\n```\n## Tie-breaking\nx\n', 1);
    expect(unclosedFence).toEqual({ line: 2 });
    expect(sections).toHaveLength(1);
    expect(sections[0]!.text).toBe('```\n## Tie-breaking\nx');
  });

  it('does not report unclosedFence when every fence is closed', () => {
    expect(splitSections('## A\n```\nx\n```\n', 1).unclosedFence).toBeUndefined();
  });

  it('does not close a shorter fence of the same kind', () => {
    const body = '## A\n````\ntext\n```\nstill code\n````\n## B\nx\n';
    expect(splitSections(body, 1).sections.map((s) => s.heading)).toEqual(['A', 'B']);
  });

  it('does not close a fence whose line has an info string', () => {
    const body = '## A\n```\ntext\n```js\nstill code\n```\n## B\nx\n';
    expect(splitSections(body, 1).sections.map((s) => s.heading)).toEqual(['A', 'B']);
  });

  it('does not open a fence indented 4 spaces', () => {
    const body = '## A\n    ```\n## B\nx\n';
    expect(splitSections(body, 1).sections.map((s) => s.heading)).toEqual(['A', 'B']);
  });

  it('does not open a backtick fence whose info string contains a backtick', () => {
    const body = '## A\n```inline``` code\n## B\nx\n';
    expect(splitSections(body, 1).sections.map((s) => s.heading)).toEqual(['A', 'B']);
  });
});

describe('parseList', () => {
  it('parses bullets with continuation lines', () => {
    expect(parseList('- one\n  two\n* three', 1)).toEqual({ items: ['one two', 'three'] });
  });

  it('reports the first line that is not part of a bullet', () => {
    expect(parseList('- one\nstray', 7)).toEqual({ items: ['one'], badLine: 8 });
  });

  it('flags a bare bullet marker as an empty item', () => {
    expect(parseList('- one\n-', 7)).toEqual({ items: ['one'], badLine: 8, badEmpty: true });
  });

  it('folds a nested bullet into the parent item', () => {
    expect(parseList('- one\n    - nested', 1)).toEqual({ items: ['one - nested'] });
  });
});
