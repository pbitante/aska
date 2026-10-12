import { describe, expect, it } from 'vitest';
import { parsePanel } from '../../src/parse/panel';
import { panelMd } from '../helpers/md';

const parse = (name: string, src: string) => parsePanel(`/s/personas/${name}.panel.md`, src);
const codes = (r: { diagnostics: { code: string }[] }) => r.diagnostics.map((d) => d.code);

describe('parsePanel', () => {
  it('parses a valid panel with notes', () => {
    const r = parse('release', panelMd('release', ['guardian', 'acme:accelerator'], { notes: 'We deploy on Fridays.\n' }));
    expect(r.diagnostics).toEqual([]);
    expect(r.panel).toMatchObject({ name: 'release', description: 'Panel release', notes: 'We deploy on Fridays.' });
    expect(r.panel!.personas.map((p) => p.ref)).toEqual(['guardian', 'acme:accelerator']);
  });

  it('enforces 2 to 6 personas', () => {
    expect(codes(parse('p', panelMd('p', ['a'])))).toEqual(['E_PANEL_SIZE']);
    expect(codes(parse('p', panelMd('p', ['a', 'b', 'c', 'd', 'e', 'f', 'g'])))).toEqual(['E_PANEL_SIZE']);
    expect(codes(parse('p', panelMd('p', ['a', 'b', 'c', 'd', 'e', 'f'])))).toEqual([]);
  });

  it('rejects bad references and duplicate strings', () => {
    expect(codes(parse('p', panelMd('p', ['a', 'Bad_Ref'])))).toEqual(['E_FIELD_TYPE']);
    expect(codes(parse('p', panelMd('p', ['a', 'a'])))).toEqual(['E_PANEL_PERSONA']);
  });

  it('rejects non-string entries', () => {
    expect(codes(parse('p', '---\nname: p\ndescription: d\npersonas: [a, 1]\n---\n'))).toEqual(['E_FIELD_TYPE']);
    expect(codes(parse('p', '---\nname: p\ndescription: d\npersonas: [a, {x: y}]\n---\n'))).toEqual(['E_FIELD_TYPE']);
  });

  it('requires name (matching the stem), description and a personas list', () => {
    expect(codes(parse('other', panelMd('p', ['a', 'b'])))).toEqual(['E_NAME_MISMATCH']);
    expect(codes(parse('p', '---\nname: p\npersonas: [a, b]\n---\n'))).toEqual(['E_REQUIRED']);
    expect(codes(parse('p', '---\nname: p\ndescription: d\n---\n'))).toEqual(['E_REQUIRED']);
    expect(codes(parse('p', '---\nname: p\ndescription: d\npersonas: a\n---\n'))).toEqual(['E_FIELD_TYPE']);
  });

  it('warns about unknown fields', () => {
    const r = parse('p', panelMd('p', ['a', 'b'], { extra: ['chair: yes'] }));
    expect(codes(r)).toEqual(['W_UNKNOWN_FIELD']);
    expect(r.panel).toBeDefined();
  });

  it('reads an optional models map from listed personas to haiku, sonnet or opus', () => {
    const r = parse('p', panelMd('p', ['a', 'acme:b'], { extra: ['models:', '  acme:b: sonnet'] }));
    expect(r.diagnostics).toEqual([]);
    expect(r.panel!.models).toEqual({ 'acme:b': 'sonnet' });
    expect(parse('p', panelMd('p', ['a', 'b'])).panel!.models).toEqual({});
  });

  it('rejects a models entry for an unlisted persona, an unknown model, or a models value that is not a map', () => {
    expect(codes(parse('p', panelMd('p', ['a', 'b'], { extra: ['models:', '  c: haiku'] })))).toEqual(['E_PANEL_MODEL']);
    expect(codes(parse('p', panelMd('p', ['a', 'b'], { extra: ['models:', '  a: gpt-4'] })))).toEqual(['E_PANEL_MODEL']);
    expect(codes(parse('p', panelMd('p', ['a', 'b'], { extra: ['models: [a]'] })))).toEqual(['E_FIELD_TYPE']);
  });
});
