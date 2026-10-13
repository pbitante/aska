import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyPatch, templateFor } from '../../src/author/patch';
import { Registry } from '../../src/scopes/registry';
import { parsePanel } from '../../src/parse/panel';
import { personaMd } from '../helpers/md';

const P = personaMd([
  'name: p # the p persona',
  'description: P.',
  'units:',
  '  primary:',
  '    - a:',
  '        threshold: low',
  '        add_questions: [Is a ok?]',
  '  secondary: [b]',
]);

describe('applyPatch', () => {
  it('sets a field and keeps comments, untouched keys and sections', () => {
    const r = applyPatch('persona', 'p', P, { set: { description: 'New.' } });
    expect(r.usage).toBeUndefined();
    expect(r.raw).toContain('name: p # the p persona');
    expect(r.raw).toContain('description: New.');
    expect(r.raw).toContain('secondary: [b]');
    expect(r.raw).toContain('## Stance\nCareful.');
  });

  it('keeps add_questions on an entry that stays in primary, and writes bare refs without settings', () => {
    const r = applyPatch('persona', 'p', P, { set: { 'units.primary': [{ ref: 'a', threshold: 'medium' }, { ref: 'c' }] } });
    expect(r.raw).toMatch(/- a:\n\s+threshold: medium\n\s+add_questions:/);
    expect(r.raw).toMatch(/\n\s+- c\n/);
    expect(r.warnings).toEqual([]);
  });

  it('warns when settings are dropped because a unit left primary', () => {
    const r = applyPatch('persona', 'p', P, { set: { 'units.primary': [{ ref: 'b' }], 'units.secondary': [{ ref: 'a', threshold: 'high' }] } });
    expect(r.warnings.map((w) => w.code)).toEqual(['W_DROPPED_SETTINGS']);
    expect(r.raw).not.toContain('add_questions');
  });

  it('replaces sections and unsets fields', () => {
    const r = applyPatch('persona', 'p', P, { unset: ['units.secondary'], sections: { Stance: 'Bold.' } });
    expect(r.raw).not.toContain('secondary');
    expect(r.raw).toContain('## Stance\n\nBold.\n');
  });

  it('rejects paths the forms do not own, bad shapes, and extends on an existing file', () => {
    expect(applyPatch('persona', 'p', P, { set: { judgment: {} } }).usage).toMatch(/use save/);
    expect(applyPatch('persona', 'p', P, { set: { 'units.exclude': ['a'] } }).usage).toMatch(/use save/);
    expect(applyPatch('persona', 'p', P, { set: { extends: 'acme:r' } }).usage).toMatch(/only be set when creating/);
    expect(applyPatch('persona', 'p', P, { set: { 'units.primary': [{ ref: 'a', add_questions: ['x'] }] } }).usage).toBeDefined();
    expect(applyPatch('persona', 'p', P, { sections: { Verdict: 'x' } }).usage).toMatch(/use save/);
    expect(applyPatch('unit', 'a', undefined, { set: { threshold: 'severe' } }).usage).toBeDefined();
    expect(applyPatch('unit', 'a', undefined, 'not an object').usage).toBeDefined();
    expect(applyPatch('panel', 'x', undefined, { bogus: 1 }).usage).toBeDefined();
  });

  it('creates from a template', () => {
    const r = applyPatch('panel', 'trio', undefined, { set: { description: 'Three.', personas: ['p', 'q'] }, sections: { '': 'Be brief.' } });
    const parsed = parsePanel('/x/trio.panel.md', r.raw!);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.panel).toMatchObject({ name: 'trio', description: 'Three.', notes: 'Be brief.' });
  });

  it('leaves every shipped file byte-identical under an empty patch', () => {
    const repo = fileURLToPath(new URL('../..', import.meta.url));
    const reg = new Registry([{ kind: 'plugin', root: repo, plugin: 'aska' }]);
    for (const kind of ['unit', 'persona', 'panel'] as const) {
      for (const f of reg.all(kind)) {
        const raw = readFileSync(f.path, 'utf8');
        expect(applyPatch(kind, f.name, raw, {}).raw, f.path).toBe(raw);
      }
    }
  });

  it('creates a name-and-extends-only child', () => {
    expect(applyPatch('persona', 'g', undefined, { set: { extends: 'acme:r' } }).raw).toBe('---\nname: g\nextends: acme:r\n---\n');
    expect(templateFor('persona', 'g', 'acme:r')).toBe('---\nname: g\nextends: acme:r\n---\n');
  });

  it('treats an empty "units:" as absent and creates the tier', () => {
    const empty = personaMd(['name: p', 'description: P.', 'units:']);
    const r = applyPatch('persona', 'p', empty, { set: { 'units.primary': [{ ref: 'a' }] } });
    expect(r.usage).toBeUndefined();
    expect(r.errors).toBeUndefined();
    expect(r.raw).toMatch(/units:\n\s+primary:\n\s+- a\n/);
  });

  it('reports a scalar or list "units" as a file error instead of throwing', () => {
    const scalar = personaMd(['name: p', 'description: P.', 'units: a']);
    const r = applyPatch('persona', 'p', scalar, { set: { 'units.primary': [{ ref: 'a' }] } }, '/x/p.persona.md');
    expect(r.raw).toBeUndefined();
    expect(r.usage).toBeUndefined();
    expect(r.errors).toEqual([expect.objectContaining({ level: 'error', code: 'E_FIELD_TYPE', loc: { file: '/x/p.persona.md', line: 4 } })]);
  });

  it('reports non-mapping frontmatter as a file error instead of throwing', () => {
    const notAMap = '---\njust text\n---\n\nBody.\n';
    const r = applyPatch('persona', 'p', notAMap, { set: { description: 'X' } }, '/x/p.persona.md');
    expect(r.raw).toBeUndefined();
    expect(r.usage).toBeUndefined();
    expect(r.errors).toEqual([expect.objectContaining({ level: 'error', code: 'E_FRONTMATTER' })]);
  });

  it('rejects an extends value with a newline or a trailing comment instead of injecting it', () => {
    expect(applyPatch('persona', 'g', undefined, { set: { extends: 'x\njudgment: {}' } }).usage).toBeDefined();
    expect(applyPatch('persona', 'g', undefined, { set: { extends: 'acme:r # x' } }).usage).toBeDefined();
  });

  it('rejects section text containing a "## " heading line instead of silently splitting the section', () => {
    expect(applyPatch('persona', 'p', P, { sections: { Stance: '## Injected\nMore.' } }).usage).toMatch(/use save/);
    expect(applyPatch('persona', 'p', P, { sections: { Stance: '## Stance again' } }).usage).toMatch(/use save/);
  });

  it('allows a "## " line inside fenced code in section text', () => {
    const r = applyPatch('persona', 'p', P, { sections: { Stance: '```\n## not a heading\n```' } });
    expect(r.usage).toBeUndefined();
    expect(r.raw).toContain('## not a heading');
  });

  it('appends a missing section under the canonical heading, not the caller\'s spelling', () => {
    const noTieBreaking = personaMd(['name: p', 'description: P.', 'units:', '  primary: [a]'], '## Stance\nCareful.\n');
    const r = applyPatch('persona', 'p', noTieBreaking, { sections: { 'tie-breaking': 'Speed.' } });
    expect(r.usage).toBeUndefined();
    expect(r.raw).toContain('## Tie-breaking');
    expect(r.raw).not.toContain('## tie-breaking');
  });

  it('sets and unsets a persona model', () => {
    expect(applyPatch('persona', 'p', P, { set: { model: 'fable' } }).raw).toContain('model: fable');
    const set = applyPatch('persona', 'p', P, { set: { model: 'sonnet' } });
    expect(set.usage).toBeUndefined();
    expect(set.raw).toContain('model: sonnet');
    const unset = applyPatch('persona', 'p', set.raw!, { unset: ['model'] });
    expect(unset.raw).not.toContain('model:');
  });

  it('rejects an unknown model, and model on units and panels', () => {
    expect(applyPatch('persona', 'p', P, { set: { model: 'Sonnet' } }).usage).toBe('"model" must be one of haiku, sonnet, opus, fable');
    expect(applyPatch('unit', 'u', undefined, { set: { model: 'sonnet' } }).usage).toMatch(/can't be patched on a unit/);
    expect(applyPatch('panel', 'q', undefined, { set: { model: 'sonnet' } }).usage).toMatch(/can't be patched on a panel/);
  });
});
