import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '../../src/diagnostics';
import { parseUnit } from '../../src/parse/unit';
import { unitMd } from '../helpers/md';

const parse = (name: string, src: string) => parseUnit(`/s/units/${name}.md`, src);
const codes = (r: { diagnostics: Diagnostic[] }) => r.diagnostics.map((d) => d.code);

describe('parseUnit', () => {
  it('parses a valid unit', () => {
    const r = parse('rollback-safety', unitMd('rollback-safety', { appliesWhen: 'deploys', threshold: 'high', questions: ['q1', 'q2'] }));
    expect(r.diagnostics).toEqual([]);
    expect(r.unit).toMatchObject({
      name: 'rollback-safety',
      description: 'About rollback-safety',
      appliesWhen: 'deploys',
      threshold: 'high',
      looksFor: 'Things about rollback-safety.',
      questions: ['q1', 'q2'],
      redFlags: ['rollback-safety is broken'],
      goodLooksLike: 'rollback-safety is fine.',
    });
  });

  it('rejects the reserved unit name "outside-scope"', () => {
    const r = parse('outside-scope', unitMd('outside-scope'));
    expect(codes(r)).toEqual(['E_FIELD_TYPE']);
    expect(r.diagnostics[0]!.fix).toContain('outside-scope is reserved for judgments');
    expect(r.unit).toBeUndefined();
  });

  it('requires the name to match the filename', () => {
    const r = parse('other', unitMd('x'));
    expect(codes(r)).toContain('E_NAME_MISMATCH');
    expect(r.unit).toBeUndefined();
  });

  it('requires description and threshold', () => {
    const src = '---\nname: x\n---\n\n## Looks for\na\n\n## Questions\n- q\n\n## Red flags\n- r\n\n## Good looks like\ng\n';
    const r = parse('x', src);
    expect(codes(r)).toEqual(['E_REQUIRED', 'E_REQUIRED']);
    expect(r.unit).toBeUndefined();
  });

  it('rejects an empty description', () => {
    const r = parse('x', unitMd('x', { description: "''" }));
    expect(codes(r)).toEqual(['E_FIELD_TYPE']);
    expect(r.unit).toBeUndefined();
  });

  it('rejects wrongly typed fields without crashing', () => {
    const src = unitMd('x').replace('name: x', 'name: 123').replace('threshold: medium', 'threshold: [low]');
    const r = parse('x', src);
    expect(r.unit).toBeUndefined();
    expect(codes(r)).toEqual(['E_FIELD_TYPE', 'E_SEVERITY']);
  });

  it('rejects an unknown threshold value', () => {
    const r = parse('x', unitMd('x', { threshold: 'severe' }));
    expect(codes(r)).toEqual(['E_SEVERITY']);
    expect(r.unit).toBeUndefined();
  });

  it('suggests a close threshold value', () => {
    const r = parse('x', unitMd('x', { threshold: 'higt' }));
    expect(r.diagnostics[0]!.fix).toContain('high');
  });

  it('warns about unknown frontmatter fields but still parses', () => {
    const r = parse('x', unitMd('x').replace('threshold: medium', 'threshold: medium\nseverity: high'));
    expect(codes(r)).toEqual(['W_UNKNOWN_FIELD']);
    expect(r.unit).toBeDefined();
  });

  it('rejects unknown headings with a suggestion', () => {
    const r = parse('x', unitMd('x', { extraBody: '\n## Red flag\n- typo\n' }));
    expect(codes(r)).toEqual(['E_UNIT_HEADING_UNKNOWN']);
    expect(r.diagnostics[0]!.fix).toContain('## Red flags');
    expect(r.unit).toBeUndefined();
  });

  it('rejects duplicate headings', () => {
    const r = parse('x', unitMd('x', { extraBody: '\n## Questions\n- again\n' }));
    expect(codes(r)).toEqual(['E_HEADING_DUPLICATE']);
    expect(r.unit).toBeUndefined();
  });

  it('rejects text before the first heading', () => {
    const src = unitMd('x').replace('---\n\n## Looks for', '---\nintro\n## Looks for');
    const r = parse('x', src);
    expect(codes(r)).toEqual(['E_PREAMBLE']);
    expect(r.unit).toBeUndefined();
  });

  it('reports a missing heading', () => {
    const src = unitMd('x').replace('## Good looks like\nx is fine.\n', '');
    const r = parse('x', src);
    expect(codes(r)).toEqual(['E_HEADING_MISSING']);
    expect(r.unit).toBeUndefined();
  });

  it('suppresses E_HEADING_MISSING for a heading an unknown heading already suggests', () => {
    const src = unitMd('x').replace('## Red flags\n- x is broken', '## Red flag\n- x is broken');
    const r = parse('x', src);
    expect(codes(r)).toEqual(['E_UNIT_HEADING_UNKNOWN']);
    expect(r.unit).toBeUndefined();
  });

  it('reports an empty prose section', () => {
    const src = unitMd('x').replace('## Looks for\nThings about x.\n', '## Looks for\n');
    const r = parse('x', src);
    expect(codes(r)).toEqual(['E_SECTION_EMPTY']);
    expect(r.diagnostics[0]!.fix).toBeTruthy();
    expect(r.unit).toBeUndefined();
  });

  it('reports an empty list section', () => {
    const src = unitMd('x').replace('## Questions\n- Is x ok?\n', '## Questions\n');
    const r = parse('x', src);
    expect(codes(r)).toEqual(['E_SECTION_EMPTY']);
    expect(r.diagnostics[0]!.fix).toBeTruthy();
    expect(r.unit).toBeUndefined();
  });

  it('rejects non-bullet text in a list section, at its line', () => {
    const r = parse('x', unitMd('x').replace('- Is x ok?', '- Is x ok?\nnot a bullet'));
    expect(codes(r)).toEqual(['E_LIST_FORMAT']);
    expect(r.diagnostics[0]!.loc!.line).toBe(12);
    expect(r.diagnostics[0]!.fix).not.toContain('Start each item with -');
    expect(r.unit).toBeUndefined();
  });

  it('describes a bare bullet marker as empty, not as missing a dash', () => {
    const r = parse('x', unitMd('x').replace('- Is x ok?', '- Is x ok?\n-'));
    expect(codes(r)).toEqual(['E_LIST_FORMAT']);
    expect(r.diagnostics[0]!.fix).toContain('no text');
  });

  it('reports an unclosed fence and suppresses the heading-missing cascade it would otherwise cause', () => {
    const src = unitMd('x', { extraBody: '\n```\nmore\n' });
    const r = parse('x', src);
    expect(codes(r)).toEqual(['E_FENCE_UNCLOSED']);
    expect(r.diagnostics[0]!.fix).toBeTruthy();
    expect(r.unit).toBeUndefined();
  });
});

describe('parseUnit: typed filenames', () => {
  it('matches name against the stem of a .unit.md file', () => {
    expect(parseUnit('/s/personas/x.unit.md', unitMd('x')).diagnostics).toEqual([]);
    const r = parseUnit('/s/personas/y.unit.md', unitMd('x'));
    expect(r.diagnostics.map((d) => d.code)).toEqual(['E_NAME_MISMATCH']);
    expect(r.diagnostics[0]!.fix).toContain('x.unit.md');
  });
});
