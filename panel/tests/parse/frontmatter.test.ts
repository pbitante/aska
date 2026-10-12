import { describe, expect, it } from 'vitest';
import { splitFrontmatter } from '../../src/parse/frontmatter';

describe('splitFrontmatter', () => {
  it('parses fields, body, and the file line of a key', () => {
    const src = '---\nname: x\ndescription: hello\n---\n\n## A\ntext\n';
    const { fm, diagnostics } = splitFrontmatter('x.md', src);
    expect(diagnostics).toEqual([]);
    expect(fm!.data).toEqual({ name: 'x', description: 'hello' });
    expect(fm!.lineOf(['description'])).toBe(3);
    expect(fm!.bodyStartLine).toBe(5);
    expect(fm!.body).toBe('\n## A\ntext\n');
  });

  it('gives nested keys their own line', () => {
    const src = '---\nname: x\nunits:\n  primary:\n    - a\n    - b:\n        threshold: low\n---\n';
    const { fm } = splitFrontmatter('x.md', src);
    expect(fm!.lineOf(['units', 'primary', 1])).toBe(6);
  });

  it('treats CRLF and a BOM exactly like LF', () => {
    const lf = '---\nname: x\n---\n## A\nt\n';
    const crlf = `\uFEFF${lf.replace(/\n/g, '\r\n')}`;
    const a = splitFrontmatter('x.md', lf).fm!;
    const b = splitFrontmatter('x.md', crlf).fm!;
    expect(b.data).toEqual(a.data);
    expect(b.body).toBe(a.body);
    expect(b.bodyStartLine).toBe(a.bodyStartLine);
    expect(b.lineOf(['name'])).toBe(a.lineOf(['name']));
  });

  it('gives a block-valued key its own line, not its value\'s line', () => {
    const src = '---\nname: x\ntone:\n  a: 1\n---\n';
    const { fm } = splitFrontmatter('x.md', src);
    expect(fm!.lineOf(['tone'])).toBe(3);
  });

  it('falls back to the nearest ancestor when a nested path segment is missing', () => {
    const src = '---\nname: x\nunits:\n  primary:\n    - a\n---\n';
    const { fm } = splitFrontmatter('x.md', src);
    expect(fm!.lineOf(['units', 'primary', 99])).toBe(4);
  });

  it.each([
    ['no frontmatter', '# hi\n'],
    ['unclosed', '---\nname: x\n'],
    ['empty', '---\n---\n'],
    ['a list', '---\n- a\n- b\n---\n'],
    ['a scalar', '---\njust text\n---\n'],
    ['invalid yaml', '---\nname: [x\n---\n'],
    ['an unresolved alias', '---\nname: *nope\n---\n'],
    [
      'an alias bomb',
      `---\n${Array.from({ length: 5 }, (_, i) => {
        const prev = i === 0 ? "['x','x','x','x','x','x','x','x','x']" : `[*a${i - 1},*a${i - 1},*a${i - 1},*a${i - 1},*a${i - 1},*a${i - 1},*a${i - 1},*a${i - 1},*a${i - 1}]`;
        return `a${i}: &a${i} ${prev}`;
      }).join('\n')}\n---\n`,
    ],
  ])('rejects %s with one E_FRONTMATTER', (_label, src) => {
    const { fm, diagnostics } = splitFrontmatter('x.md', src);
    expect(fm).toBeUndefined();
    expect(diagnostics.map((d) => d.code)).toEqual(['E_FRONTMATTER']);
  });
});
