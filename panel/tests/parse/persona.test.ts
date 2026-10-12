import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '../../src/diagnostics';
import { parsePersona } from '../../src/parse/persona';
import { personaMd } from '../helpers/md';

const parse = (name: string, front: string[], body?: string) => parsePersona(`/s/personas/${name}.md`, personaMd(front, body));
const codes = (r: { diagnostics: Diagnostic[] }) => r.diagnostics.map((d) => d.code);

describe('parsePersona', () => {
  it('parses a full root persona', () => {
    const r = parse('example', [
      'name: example',
      'description: Weighs safety.',
      'units:',
      '  primary:',
      '    - edge-cases',
      '    - rollback-safety:',
      '        threshold: low',
      '        add_questions:',
      '          - Has the rollback run in staging?',
      '  secondary:',
      '    - acme:cost:',
      '        threshold: high',
      '    - maintainability:',
      '  deprioritized:',
      '    - code-style:',
      '        note: Only if it hides a bug.',
      'judgment:',
      '  sections:',
      '    - name: Suggested checks',
      '      ask: Checks that would catch the findings.',
      'capabilities:',
      '  skills:',
      '    - name: superpowers:test-driven-development',
      '      when: proposing a fix',
      '  mcp:',
      '    - name: playwright',
      '      when: checking UI',
      '  tools: [Bash]',
    ], '## Stance\nSkeptical.\n\n## Context\nWe ship weekly.\n\n## Tie-breaking\nSafety wins.\n');
    expect(r.diagnostics).toEqual([]);
    const p = r.persona!;
    expect(p.units.map((u) => [u.ref, u.tier])).toEqual([
      ['edge-cases', 'primary'],
      ['rollback-safety', 'primary'],
      ['acme:cost', 'secondary'],
      ['maintainability', 'secondary'],
      ['code-style', 'deprioritized'],
    ]);
    expect(p.units[1]).toMatchObject({ threshold: 'low', addQuestions: ['Has the rollback run in staging?'] });
    expect(p.units[2]!.threshold).toBe('high');
    expect(p.units[3]!.threshold).toBeUndefined();
    expect(p.units[4]!.note).toBe('Only if it hides a bug.');
    expect(p.judgmentSections.map((s) => s.name)).toEqual(['Suggested checks']);
    expect(p.capabilities.map((c) => [c.kind, c.name, c.when])).toEqual([
      ['skills', 'superpowers:test-driven-development', 'proposing a fix'],
      ['mcp', 'playwright', 'checking UI'],
    ]);
    expect(p.tools).toEqual(['Bash']);
    expect(p.stance!.text).toBe('Skeptical.');
    expect(p.tieBreaking!.text).toBe('Safety wins.');
    expect(p.extraSections.map((s) => [s.heading, s.text])).toEqual([['Context', 'We ship weekly.']]);
  });

  it('accepts a minimal child persona', () => {
    const r = parse('kid', ['name: kid', 'extends: base'], '');
    expect(r.diagnostics).toEqual([]);
    expect(r.persona).toMatchObject({ name: 'kid', extends: 'base', units: [], overrides: [] });
  });

  it('parses exclude, primary_order and overrides on a child', () => {
    const r = parse('kid', ['name: kid', 'extends: base', 'units:', '  exclude: [b]', '  primary_order: [c, a]', 'overrides:', '  b.excluded: child', '  stance: parent'], '');
    expect(r.diagnostics).toEqual([]);
    expect(r.persona!.units).toMatchObject([{ ref: 'b', tier: 'exclude' }]);
    expect(r.persona!.primaryOrder!.refs).toEqual(['c', 'a']);
    expect(r.persona!.overrides.map((o) => [o.key, o.value])).toEqual([['b.excluded', 'child'], ['stance', 'parent']]);
  });

  it('rejects unknown settings and settings not allowed in the tier', () => {
    const r = parse('x', ['name: x', 'description: d', 'units:', '  primary:', '    - a:', '        weight: 2', '  secondary:', '    - b:', '        add_questions: [q]']);
    expect(codes(r)).toEqual(['E_SETTING_UNKNOWN', 'E_SETTING_TIER']);
    expect(r.persona).toBeUndefined();
  });

  it('allows only note in deprioritized', () => {
    const r = parse('x', ['name: x', 'description: d', 'units:', '  primary: [a]', '  deprioritized:', '    - c:', '        threshold: low']);
    expect(codes(r)).toEqual(['E_SETTING_TIER']);
    expect(r.persona).toBeUndefined();
  });

  it('rejects unknown keys under units', () => {
    const r = parse('x', ['name: x', 'description: d', 'units:', '  primary: [a]', '  tertiary: [b]']);
    expect(codes(r)).toEqual(['E_FIELD_UNKNOWN']);
    expect(r.persona).toBeUndefined();
  });

  it('rejects the same unit reference twice in one file', () => {
    const r = parse('x', ['name: x', 'description: d', 'units:', '  primary: [a]', '  secondary: [a]']);
    expect(codes(r)).toEqual(['E_DUPLICATE_UNIT']);
    expect(r.persona).toBeUndefined();
  });

  it('describes a same-tier duplicate without saying "both primary and primary"', () => {
    const r = parse('x', ['name: x', 'description: d', 'units:', '  primary: [a, a]']);
    expect(codes(r)).toEqual(['E_DUPLICATE_UNIT']);
    expect(r.diagnostics[0]!.message).not.toContain('both primary and primary');
    expect(r.diagnostics[0]!.message).toContain('twice in primary');
  });

  it('needs extends for exclude, primary_order and overrides', () => {
    const r = parse('x', ['name: x', 'description: d', 'units:', '  primary: [a]', '  exclude: [b]', '  primary_order: [a]', 'overrides:', '  stance: parent']);
    expect(codes(r)).toEqual(['E_NEEDS_EXTENDS', 'E_NEEDS_EXTENDS', 'E_NEEDS_EXTENDS']);
    expect(r.persona).toBeUndefined();
  });

  it('needs extends for an empty exclude list or a null primary_order, by key presence', () => {
    const r = parse('x', ['name: x', 'description: d', 'units:', '  primary: [a]', '  exclude: []', '  primary_order:']);
    expect(codes(r)).toEqual(['E_NEEDS_EXTENDS', 'E_NEEDS_EXTENDS']);
  });

  it('rejects override values other than child or parent', () => {
    const r = parse('x', ['name: x', 'extends: base', 'overrides:', '  stance: mine'], '');
    expect(codes(r)).toEqual(['E_OVERRIDE_VALUE']);
    expect(r.persona).toBeUndefined();
  });

  it('points an overrides error at its own key, not the overrides root', () => {
    const r = parse('x', ['name: x', 'extends: base', 'overrides:', '  a: child', '  b: mine'], '');
    expect(r.diagnostics[0]!.loc!.line).toBe(6);
  });

  it('rejects judgment sections that collide with core headings or each other', () => {
    const r = parse('x', ['name: x', 'extends: base', 'judgment:', '  sections:', '    - name: Findings', '      ask: a', '    - name: Extra', '      ask: a', '    - name: extra', '      ask: b'], '');
    expect(codes(r)).toEqual(['E_JUDGMENT_SECTION', 'E_JUDGMENT_SECTION']);
    expect(r.persona).toBeUndefined();
  });

  it('rejects an unknown key on judgment itself', () => {
    const r = parse('x', ['name: x', 'extends: base', 'judgment:', '  foo: bar'], '');
    expect(codes(r)).toEqual(['E_FIELD_UNKNOWN']);
    expect(r.persona).toBeUndefined();
  });

  it('rejects an unknown key on a judgment section entry', () => {
    const r = parse('x', ['name: x', 'extends: base', 'judgment:', '  sections:', '    - name: Suggested checks', '      ask: a', '      required: true'], '');
    expect(codes(r)).toEqual(['E_FIELD_UNKNOWN']);
    expect(r.persona).toBeUndefined();
  });

  it('rejects an unknown top-level key on capabilities', () => {
    const r = parse('x', ['name: x', 'extends: base', 'capabilities:', '  hooks: []'], '');
    expect(codes(r)).toEqual(['E_FIELD_UNKNOWN']);
    expect(r.persona).toBeUndefined();
  });

  it('rejects unknown keys on a capability, including the removed required field', () => {
    const r = parse('x', ['name: x', 'extends: base', 'capabilities:', '  mcp:', '    - name: playwright', '      when: UI', '      required: true'], '');
    expect(codes(r)).toEqual(['E_FIELD_UNKNOWN']);
    expect(r.persona).toBeUndefined();
  });

  it('compares capability names trimmed when checking for duplicates', () => {
    const r = parse('x', ['name: x', 'extends: base', 'capabilities:', '  mcp:', '    - name: playwright', '      when: a', '    - name: " playwright "', '      when: b'], '');
    expect(codes(r)).toEqual(['E_DUPLICATE']);
    expect(r.persona).toBeUndefined();
  });

  it('requires description, a primary unit, Stance and Tie-breaking for a root persona', () => {
    const r = parse('x', ['name: x'], '## Notes\nhi\n');
    expect(codes(r)).toEqual(['E_ROOT_REQUIRED', 'E_ROOT_REQUIRED', 'E_ROOT_REQUIRED', 'E_ROOT_REQUIRED']);
    expect(r.persona).toBeUndefined();
    expect(r.diagnostics.every((d) => !!d.fix)).toBe(true);
  });

  it('does not cascade an invalid extends into root-persona errors', () => {
    const r = parse('x', ['name: x', 'extends: 5']);
    expect(codes(r)).toEqual(['E_FIELD_TYPE']);
    expect(r.persona).toBeUndefined();
  });

  it('does not ask for extends again when extends is present but invalid', () => {
    const r = parse('x', ['name: x', 'extends: 5', 'units:', '  exclude: [a]'], '');
    expect(codes(r)).toEqual(['E_FIELD_TYPE']);
  });

  it('does not duplicate the primary-unit root error when units.primary has a type error', () => {
    const r = parse('x', ['name: x', 'description: d', 'units:', '  primary: a']);
    expect(codes(r)).toEqual(['E_FIELD_TYPE']);
    expect(r.persona).toBeUndefined();
  });

  it('does not duplicate the description root error when description has a type error', () => {
    const r = parse('x', ['name: x', 'description: 5', 'units:', '  primary: [a]']);
    expect(codes(r)).toEqual(['E_FIELD_TYPE']);
    expect(r.persona).toBeUndefined();
  });

  it('warns about a near-miss section heading and hints at E_ROOT_REQUIRED', () => {
    const r = parse('x', ['name: x', 'description: d', 'units:', '  primary: [a]'], '## Tie breaking\nx\n');
    expect(codes(r)).toEqual(['W_SECTION_NEAR_MISS', 'E_ROOT_REQUIRED', 'E_ROOT_REQUIRED']);
    const rootRequired = r.diagnostics.find((d) => d.code === 'E_ROOT_REQUIRED' && d.message.includes('Tie-breaking'));
    expect(rootRequired!.fix).toContain('Tie breaking');
  });

  it('reports an unclosed fence in the body', () => {
    const r = parse('x', ['name: x', 'extends: base'], '## Stance\n```\n## Tie-breaking\nx\n');
    expect(codes(r)).toEqual(['E_FENCE_UNCLOSED']);
    expect(r.diagnostics[0]!.fix).toBeTruthy();
    expect(r.persona).toBeUndefined();
  });

  it('rejects preamble text and duplicate body headings', () => {
    const r = parse('x', ['name: x', 'extends: base'], 'intro\n## Stance\na\n\n## stance\nb\n');
    expect(codes(r)).toEqual(['E_PREAMBLE', 'E_HEADING_DUPLICATE']);
    expect(r.persona).toBeUndefined();
  });

  it('warns about unknown top-level fields', () => {
    const r = parse('x', ['name: x', 'extends: base', 'tone: calm'], '');
    expect(codes(r)).toEqual(['W_UNKNOWN_FIELD']);
    expect(r.persona).toBeDefined();
  });

  it('points a settings error at the setting key\'s line, not the entry line', () => {
    const r = parse('x', ['name: x', 'description: d', 'units:', '  primary:', '    - a', '    - b:', '        weight: 2']);
    expect(r.diagnostics[0]!.loc!.line).toBe(8);
  });

  it('points a capability field error at the extra key\'s line, not the item line', () => {
    const r = parse(
      'x',
      [
        'name: x',
        'extends: base',
        'capabilities:',
        '  mcp:',
        '    - name: playwright',
        '      when: UI',
        '      required: true',
      ],
      '',
    );
    expect(r.diagnostics[0]!.loc!.line).toBe(8);
  });
});
