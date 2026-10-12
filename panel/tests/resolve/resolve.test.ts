import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { effectiveThreshold, type EffectivePersona, type Resolution } from '../../src/model/effective';
import { resolvePersona } from '../../src/resolve/resolve';
import { personaMd, unitMd } from '../helpers/md';
import { registryFor } from '../helpers/scopes';

const UNITS: Record<string, string> = Object.fromEntries(
  ['a', 'b', 'c', 'd', 'e'].map((n) => [`user/units/${n}.md`, unitMd(n)]),
);
const base = (lines: string[], body?: string) => personaMd(['name: base', 'description: Base persona.', ...lines], body);
const kid = (lines: string[], body = '') => personaMd(['name: kid', 'extends: base', ...lines], body);

function run(baseMd: string, kidMd?: string, extra: Record<string, string> = {}, ref = 'kid'): Resolution {
  const files: Record<string, string> = { ...UNITS, 'user/personas/base.md': baseMd, ...extra };
  if (kidMd) files['project/personas/kid.md'] = kidMd;
  return resolvePersona(registryFor(files).reg, ref);
}
const tiers = (e: EffectivePersona) => ({
  primary: e.units.primary.map((u) => u.canonical),
  secondary: e.units.secondary.map((u) => u.canonical),
  deprioritized: e.units.deprioritized.map((u) => u.canonical),
});
const clashes = (r: Resolution) => r.report.clashes.map((c) => `${c.id}:${c.decision}`);
const codes = (r: Resolution) => r.diagnostics.map((d) => d.code);
const unit = (e: EffectivePersona, id: string) =>
  [...e.units.primary, ...e.units.secondary, ...e.units.deprioritized].find((u) => u.canonical === id)!;

describe('resolvePersona: root and chain', () => {
  it('resolves a root persona with default thresholds', () => {
    const r = run(base(['units:', '  primary: [a, b]', '  secondary: [c]']), undefined, {}, 'base');
    expect(r.diagnostics).toEqual([]);
    expect(tiers(r.effective!)).toEqual({ primary: ['a', 'b'], secondary: ['c'], deprioritized: [] });
    expect(effectiveThreshold(unit(r.effective!, 'a'))).toBe('medium');
    expect(r.effective!.description).toBe('Base persona.');
  });

  it('takes the name from the child and inherits the description', () => {
    const r = run(base(['units:', '  primary: [a]']), kid([]));
    expect(r.effective).toMatchObject({ name: 'kid', canonical: 'kid', description: 'Base persona.' });
  });

  it('records inputs and their scopes', () => {
    const r = run(base(['units:', '  primary: [a]']), kid([]));
    expect(r.effective!.inputs.some((p) => p.endsWith('/proj/.claude/personas/kid.persona.md'))).toBe(true);
    expect(r.effective!.inputs.some((p) => p.endsWith('/home/.claude/personas/a.unit.md'))).toBe(true);
    expect([...r.effective!.inputScopes].sort()).toEqual(['project', 'user']);
  });

  it('returns inputs already sorted', () => {
    const r = run(base(['units:', '  primary: [a]']), kid([]));
    expect(r.effective!.inputs).toEqual([...r.effective!.inputs].sort());
  });

  it('includes a scope that only a unit contributes', () => {
    const r = run(
      base(['units:', '  primary: [a, acme:p]']),
      kid([]),
      { 'acme/units/p.md': unitMd('p') },
    );
    expect([...r.effective!.inputScopes].sort()).toEqual(['plugin', 'project', 'user']);
  });

  it('records source as the requested file path', () => {
    const r = run(base(['units:', '  primary: [a]']), kid([]));
    expect(r.effective!.source.endsWith('/proj/.claude/personas/kid.persona.md')).toBe(true);
  });

  it('resolves same-name extends in the next lower scope', () => {
    const r = run(base(['units:', '  primary: [a]']), undefined, {
      'project/personas/base.md': personaMd(['name: base', 'extends: base', 'units:', '  secondary: [e]'], ''),
    }, 'base');
    expect(r.diagnostics.filter((d) => d.level === 'error')).toEqual([]);
    expect(tiers(r.effective!).secondary).toEqual(['e']);
  });

  it('does not report the parent of a same-name extends as a shadow, since it is used, not shadowed', () => {
    const r = run(base(['units:', '  primary: [a]']), undefined, {
      'project/personas/base.md': personaMd(['name: base', 'extends: base', 'units:', '  secondary: [e]'], ''),
    }, 'base');
    expect(r.report.shadows).toEqual([]);
  });

  it('reports an extends cycle', () => {
    const r = run(base(['units:', '  primary: [a]']), undefined, {
      'user/personas/p1.md': personaMd(['name: p1', 'extends: p2'], ''),
      'user/personas/p2.md': personaMd(['name: p2', 'extends: p1'], ''),
    }, 'p1');
    expect(codes(r)).toEqual(['E_CYCLE']);
    expect(r.diagnostics[0]!.fix).toContain('namespaced');
    expect(r.effective).toBeUndefined();
  });

  it('suggests the namespaced form when a same-name extends has no match below a plugin scope', () => {
    const r = run(base(['units:', '  primary: [a]']), undefined, {
      'acme/personas/rev.md': personaMd(['name: rev', 'description: Acme rev.', 'units:', '  primary: [a]']),
      'beta/personas/rev.md': personaMd(['name: rev', 'extends: rev', 'units:', '  primary: [a]'], ''),
    }, 'beta:rev');
    expect(codes(r)).toEqual(['E_UNKNOWN_REF']);
    expect(r.diagnostics[0]!.fix).toContain('<plugin>:rev');
  });

  it('reports unknown units and returns no effective persona', () => {
    const r = run(base(['units:', '  primary: [a, zzz]']), undefined, {}, 'base');
    expect(codes(r)).toEqual(['E_UNKNOWN_REF']);
    expect(r.effective).toBeUndefined();
  });

  it('rejects two references to the same resolved unit in one file', () => {
    const r = run(base(['units:', '  primary: [x]', '  secondary: [acme:x]']), undefined, { 'acme/units/x.md': unitMd('x') }, 'base');
    expect(codes(r)).toContain('E_DUPLICATE_UNIT');
  });

  it('reports a duplicate unit once and returns no effective persona', () => {
    const r = run(base(['units:', '  primary: [x]', '  secondary: [acme:x]']), undefined, { 'acme/units/x.md': unitMd('x') }, 'base');
    expect(codes(r)).toEqual(['E_DUPLICATE_UNIT']);
    expect(r.effective).toBeUndefined();
  });

  it('turns a read failure for a registry-listed file into E_READ instead of throwing', () => {
    const { reg, root } = registryFor({ ...UNITS, 'user/personas/base.md': base(['units:', '  primary: [a]']) });
    rmSync(join(root, 'home/.claude/personas/a.unit.md'));
    const r = resolvePersona(reg, 'base');
    expect(codes(r)).toEqual(['E_READ']);
    expect(r.effective).toBeUndefined();
  });

  it('warns about more than 7 primary units', () => {
    const many = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((i) => [`user/units/u${i}.md`, unitMd(`u${i}`)]));
    const r = run(base(['units:', '  primary: [u1, u2, u3, u4, u5, u6, u7, u8]']), undefined, many, 'base');
    expect(codes(r)).toEqual(['W_TOO_MANY_PRIMARY']);
  });
});

describe('resolvePersona: merge table (default and flip)', () => {
  it('adds a new unit at the child tier, after inherited entries', () => {
    const r = run(base(['units:', '  primary: [a]', '  secondary: [c]']), kid(['units:', '  secondary: [d]']));
    expect(tiers(r.effective!)).toEqual({ primary: ['a'], secondary: ['c', 'd'], deprioritized: [] });
    expect(clashes(r)).toEqual([]);
  });

  it('adds a new deprioritized unit after inherited entries', () => {
    const r = run(base(['units:', '  primary: [a]', '  deprioritized: [c]']), kid(['units:', '  deprioritized: [d]']));
    expect(tiers(r.effective!).deprioritized).toEqual(['c', 'd']);
  });

  it('interleaves moved-in and new secondary units in the layer order', () => {
    const r = run(base(['units:', '  primary: [a]', '  secondary: [c]']), kid(['units:', '  secondary: [d, a, e]']));
    expect(tiers(r.effective!).secondary).toEqual(['c', 'd', 'a', 'e']);
  });

  it('keeps an inherited unit in place when relisted in its tier, applying additions parent-first', () => {
    const r = run(
      base(['units:', '  primary:', '    - a', '    - b:', '        add_questions: [p1]', '    - c']),
      kid(['units:', '  primary:', '    - b:', '        add_questions: [k1, p1]']),
    );
    expect(tiers(r.effective!).primary).toEqual(['a', 'b', 'c']);
    expect(unit(r.effective!, 'b').addQuestions).toEqual(['p1', 'k1']);
    expect(clashes(r)).toEqual([]);
  });

  it('merges add_red_flags, keeping the inherited one first', () => {
    const r = run(
      base(['units:', '  primary:', '    - a:', '        add_red_flags: [p1]']),
      kid(['units:', '  primary:', '    - a:', '        add_red_flags: [k1]']),
    );
    expect(unit(r.effective!, 'a').addRedFlags).toEqual(['p1', 'k1']);
    expect(clashes(r)).toEqual([]);
  });

  it('keeps an inherited secondary unit in place when relisted in its tier', () => {
    const r = run(
      base(['units:', '  primary: [a]', '  secondary: [b, c]']),
      kid(['units:', '  secondary:', '    - b:', '        threshold: high']),
    );
    expect(tiers(r.effective!).secondary).toEqual(['b', 'c']);
  });

  it('places new primaries first, in the child order', () => {
    const r = run(base(['units:', '  primary: [a, b]']), kid(['units:', '  primary: [d, c]']));
    expect(tiers(r.effective!).primary).toEqual(['d', 'c', 'a', 'b']);
  });

  it('moves a unit between tiers (tier clash) and flips it back', () => {
    const b1 = base(['units:', '  primary: [a, b]', '  secondary: [c]']);
    const moved = run(b1, kid(['units:', '  secondary: [a]']));
    expect(tiers(moved.effective!)).toEqual({ primary: ['b'], secondary: ['c', 'a'], deprioritized: [] });
    expect(clashes(moved)).toEqual(['a.tier:unreviewed']);
    expect(moved.report.clashes[0]).toMatchObject({ child: 'secondary', parent: 'primary' });

    const flipped = run(b1, kid(['units:', '  secondary: [a]', 'overrides:', '  a.tier: parent']));
    expect(tiers(flipped.effective!)).toEqual({ primary: ['a', 'b'], secondary: ['c'], deprioritized: [] });
    expect(clashes(flipped)).toEqual(['a.tier:parent']);
  });

  it('keeps settings the unchanged tier still allows when a .tier flip is kept', () => {
    const b1 = base(['units:', '  primary: [a]', '  secondary: [c]']);
    const r = run(b1, kid(['units:', '  primary:', '    - c:', '        threshold: high', '        add_questions: [q]', 'overrides:', '  c.tier: parent']));
    const c = unit(r.effective!, 'c');
    expect(c.tier).toBe('secondary');
    expect(effectiveThreshold(c)).toBe('high');
    expect(c.addQuestions).toEqual([]);
    expect(clashes(r)).toEqual(['c.tier:parent', 'c.threshold:unreviewed']);
    expect(r.report.clashes[0]!.dropped).toEqual(['add_questions from kid']);
  });

  it('places a unit moved into primary first', () => {
    const r = run(base(['units:', '  primary: [a]', '  secondary: [c]']), kid(['units:', '  primary: [c]']));
    expect(tiers(r.effective!).primary).toEqual(['c', 'a']);
    expect(clashes(r)).toEqual(['c.tier:unreviewed']);
  });

  it('drops settings the new tier disallows and lists them on the tier clash', () => {
    const b1 = base(['units:', '  primary:', '    - a:', '        threshold: low', '        add_questions: [q]']);
    const moved = run(b1, kid(['units:', '  deprioritized:', '    - a:', '        note: n']));
    const a = unit(moved.effective!, 'a');
    expect(a).toMatchObject({ tier: 'deprioritized', note: 'n', thresholdSet: undefined, addQuestions: [] });
    expect(effectiveThreshold(a)).toBe('critical');
    expect(clashes(moved)).toEqual(['a.tier:unreviewed']);
    expect(moved.report.clashes[0]!.dropped).toEqual(['inherited threshold low', 'inherited add_questions']);

    const flipped = run(b1, kid(['units:', '  deprioritized:', '    - a:', '        note: n', 'overrides:', '  a.tier: parent']));
    const a2 = unit(flipped.effective!, 'a');
    expect(a2).toMatchObject({ tier: 'primary', thresholdSet: 'low', addQuestions: ['q'], note: undefined });
    expect(flipped.report.clashes[0]!.dropped).toEqual(['note from kid']);
  });

  it('drops the inherited note when leaving deprioritized', () => {
    const b1 = base(['units:', '  primary: [b]', '  deprioritized:', '    - a:', '        note: n']);
    const r = run(b1, kid(['units:', '  primary: [a]']));
    const a = unit(r.effective!, 'a');
    expect(a.note).toBeUndefined();
    expect(r.report.clashes[0]!.dropped).toContain('inherited note');
  });

  it('drops the inherited add_red_flags when moving from primary to secondary', () => {
    const b1 = base(['units:', '  primary:', '    - a:', '        add_red_flags: [r1]']);
    const r = run(b1, kid(['units:', '  secondary: [a]']));
    const a = unit(r.effective!, 'a');
    expect(a.addRedFlags).toEqual([]);
    expect(r.report.clashes[0]!.dropped).toEqual(['inherited add_red_flags']);
  });

  it('compares a leaving-deprioritized threshold change against the unit file default', () => {
    const b1 = base(['units:', '  primary: [b]', '  deprioritized: [a]']);
    const r = run(b1, kid(['units:', '  primary:', '    - a:', '        threshold: critical']));
    expect(clashes(r)).toEqual(['a.tier:unreviewed', 'a.threshold:unreviewed']);
    expect(r.report.clashes[1]).toMatchObject({ id: 'a.threshold', child: 'critical', parent: 'medium' });
  });

  it('falls back to the unit file threshold when leaving deprioritized', () => {
    const r = run(
      base(['units:', '  primary: [b]', '  deprioritized: [a]']),
      kid(['units:', '  primary: [a]']),
      { 'user/units/a.md': unitMd('a', { threshold: 'low' }) },
    );
    expect(effectiveThreshold(unit(r.effective!, 'a'))).toBe('low');
  });

  it('changes a threshold (threshold clash) and flips it', () => {
    const b1 = base(['units:', '  primary: [a]']);
    const changed = run(b1, kid(['units:', '  primary:', '    - a:', '        threshold: high']));
    expect(effectiveThreshold(unit(changed.effective!, 'a'))).toBe('high');
    expect(changed.report.clashes[0]).toMatchObject({ id: 'a.threshold', child: 'high', parent: 'medium', decision: 'unreviewed' });

    const flipped = run(b1, kid(['units:', '  primary:', '    - a:', '        threshold: high', 'overrides:', '  a.threshold: parent']));
    expect(effectiveThreshold(unit(flipped.effective!, 'a'))).toBe('medium');
  });

  it('raises no clash when the threshold is unchanged', () => {
    const r = run(base(['units:', '  primary: [a]']), kid(['units:', '  primary:', '    - a:', '        threshold: medium']));
    expect(clashes(r)).toEqual([]);
  });

  it('moves a unit and changes its threshold: two independent clashes', () => {
    const r = run(base(['units:', '  primary: [a, b]']), kid(['units:', '  secondary:', '    - a:', '        threshold: high', 'overrides:', '  a.tier: child', '  a.threshold: parent']));
    expect(clashes(r)).toEqual(['a.tier:child', 'a.threshold:parent']);
    expect(unit(r.effective!, 'a')).toMatchObject({ tier: 'secondary' });
    expect(effectiveThreshold(unit(r.effective!, 'a'))).toBe('medium');
  });

  it('changes a deprioritized note (note clash) and flips it', () => {
    const b1 = base(['units:', '  primary: [a]', '  deprioritized:', '    - c:', '        note: x']);
    const changed = run(b1, kid(['units:', '  deprioritized:', '    - c:', '        note: y']));
    expect(unit(changed.effective!, 'c').note).toBe('y');
    expect(clashes(changed)).toEqual(['c.note:unreviewed']);
    const flipped = run(b1, kid(['units:', '  deprioritized:', '    - c:', '        note: y', 'overrides:', '  c.note: parent']));
    expect(unit(flipped.effective!, 'c').note).toBe('x');
  });

  it('excludes an inherited unit (excluded clash) and flips it', () => {
    const b1 = base(['units:', '  primary: [a, b]']);
    const ex = run(b1, kid(['units:', '  exclude: [b]']));
    expect(tiers(ex.effective!).primary).toEqual(['a']);
    expect(clashes(ex)).toEqual(['b.excluded:unreviewed']);
    const kept = run(b1, kid(['units:', '  exclude: [b]', 'overrides:', '  b.excluded: parent']));
    expect(tiers(kept.effective!).primary).toEqual(['a', 'b']);
  });

  it('warns when excluding a unit that was not inherited', () => {
    const r = run(base(['units:', '  primary: [a]']), kid(['units:', '  exclude: [e]']));
    expect(codes(r)).toEqual(['W_EXCLUDE_NOOP']);
    expect(clashes(r)).toEqual([]);
  });

  it('reorders primaries with primary_order (primary-order clash) and flips it', () => {
    const b1 = base(['units:', '  primary: [a, b, c]']);
    const re = run(b1, kid(['units:', '  primary_order: [c, a]']));
    expect(tiers(re.effective!).primary).toEqual(['c', 'a', 'b']);
    expect(re.report.clashes[0]).toMatchObject({ id: 'primary-order', child: 'c, a, b', parent: 'a, b, c' });
    const flipped = run(b1, kid(['units:', '  primary_order: [c, a]', 'overrides:', '  primary-order: parent']));
    expect(tiers(flipped.effective!).primary).toEqual(['a', 'b', 'c']);
  });

  it('does not raise primary-order when only new units move', () => {
    const r = run(base(['units:', '  primary: [a, b, c]']), kid(['units:', '  primary: [d]', '  primary_order: [a]']));
    expect(tiers(r.effective!).primary).toEqual(['a', 'd', 'b', 'c']);
    expect(clashes(r)).toEqual([]);
  });

  it('rejects primary_order entries that are not primary', () => {
    const r = run(base(['units:', '  primary: [a]', '  secondary: [c]']), kid(['units:', '  primary_order: [c]']));
    expect(codes(r)).toEqual(['E_PRIMARY_ORDER']);
  });

  it('rejects a primary_order duplicate reached via two spellings of one unit', () => {
    const r = run(
      base(['units:', '  primary: [x, a]']),
      kid(['units:', '  primary_order: [x, acme:x]']),
      { 'acme/units/x.md': unitMd('x') },
    );
    expect(codes(r)).toEqual(['E_PRIMARY_ORDER']);
    expect(r.diagnostics[0]!.message).toContain('acme:x is the same unit as x');
    expect(r.effective).toBeUndefined();
  });

  it('replaces stance and tie-breaking (clashes) and flips them', () => {
    const b1 = base(['units:', '  primary: [a]']);
    const changed = run(b1, kid([], '## Stance\nBold.\n\n## Tie-breaking\nSpeed wins.\n'));
    expect(changed.effective!.stance.text).toBe('Bold.');
    expect(changed.effective!.tieBreaking.text).toBe('Speed wins.');
    expect(clashes(changed)).toEqual(['stance:unreviewed', 'tie-breaking:unreviewed']);
    const flipped = run(b1, kid(['overrides:', '  stance: parent'], '## Stance\nBold.\n'));
    expect(flipped.effective!.stance.text).toBe('Careful.');
  });

  it('flips a tie-breaking replacement back to the parent text', () => {
    const b1 = base(['units:', '  primary: [a]']);
    const flipped = run(b1, kid(['overrides:', '  tie-breaking: parent'], '## Tie-breaking\nSpeed wins.\n'));
    expect(flipped.effective!.tieBreaking.text).toBe('Safety first.');
  });

  it('raises no clash for identical stance text, so an override for it is stale', () => {
    const r = run(base(['units:', '  primary: [a]']), kid(['overrides:', '  stance: parent'], '## Stance\nCareful.\n'));
    expect(clashes(r)).toEqual([]);
    expect(r.report.stale.map((s) => s.key)).toEqual(['stance']);
    expect(codes(r)).toEqual(['W_STALE_OVERRIDE']);
  });

  it('adds new extra prose sections and replaces existing ones by heading', () => {
    const b1 = base(['units:', '  primary: [a]'], '## Stance\nCareful.\n\n## Context\nA\n\n## Tie-breaking\nSafety first.\n');
    const r = run(b1, kid([], '## context\nB\n\n## Audience\nC\n'));
    expect(r.effective!.extraSections.map((s) => [s.key, s.text])).toEqual([['context', 'B'], ['audience', 'C']]);
    expect(clashes(r)).toEqual(['section:context:unreviewed']);
    const flipped = run(b1, kid(['overrides:', '  section:context: parent'], '## context\nB\n'));
    expect(flipped.effective!.extraSections[0]!.text).toBe('A');
  });

  it('merges judgment sections by name and flips a redefinition', () => {
    const b1 = base(['units:', '  primary: [a]', 'judgment:', '  sections:', '    - name: Checks', '      ask: a']);
    const r = run(b1, kid(['judgment:', '  sections:', '    - name: checks', '      ask: b', '    - name: Risks', '      ask: r']));
    expect(r.effective!.judgmentSections).toEqual([{ name: 'checks', ask: 'b' }, { name: 'Risks', ask: 'r' }]);
    expect(clashes(r)).toEqual(['judgment:checks:unreviewed']);
    const flipped = run(b1, kid(['judgment:', '  sections:', '    - name: checks', '      ask: b', 'overrides:', '  judgment:checks: parent']));
    expect(flipped.effective!.judgmentSections).toEqual([{ name: 'Checks', ask: 'a' }]);
  });

  it('merges capabilities and tools, and flips a redeclared capability', () => {
    const b1 = base(['units:', '  primary: [a]', 'capabilities:', '  skills:', '    - name: s', '      when: w1', '  tools: [Bash]']);
    const r = run(b1, kid(['capabilities:', '  skills:', '    - name: s', '      when: w2', '  mcp:', '    - name: m', '      when: w3', '  tools: [Bash, WebFetch]']));
    expect(r.effective!.capabilities).toEqual([{ kind: 'skills', name: 's', when: 'w2' }, { kind: 'mcp', name: 'm', when: 'w3' }]);
    expect(r.effective!.tools).toEqual(['Bash', 'WebFetch']);
    expect(clashes(r)).toEqual(['capability:skills:s:unreviewed']);
    const flipped = run(b1, kid(['capabilities:', '  skills:', '    - name: s', '      when: w2', 'overrides:', '  capability:skills:s: parent']));
    expect(flipped.effective!.capabilities[0]!.when).toBe('w1');
  });
});

describe('resolvePersona: overrides, attribution, shadows', () => {
  it('warns about unreviewed clashes with the lines to keep or flip', () => {
    const r = run(base(['units:', '  primary: [a]']), kid(['units:', '  primary:', '    - a:', '        threshold: high']));
    const w = r.diagnostics.find((d) => d.code === 'W_UNREVIEWED')!;
    expect(w.fix).toContain('a.threshold: child');
    expect(w.fix).toContain('a.threshold: parent');
  });

  it('quotes the keep/flip key when the heading is not a safe plain scalar', () => {
    const b1 = base(['units:', '  primary: [a]'], '## Stance\nCareful.\n\n## Notes: extra\nA\n\n## Tie-breaking\nSafety first.\n');
    const r = run(b1, kid([], '## notes: extra\nB\n'));
    const w = r.diagnostics.find((d) => d.code === 'W_UNREVIEWED')!;
    expect(w.fix).toContain('"section:notes: extra": child');
    expect(w.fix).toContain('"section:notes: extra": parent');
  });

  it('does not fold the keep/flip suggestion for a long, unsafe section heading', () => {
    const heading = `Notes: ${'word '.repeat(20).trim()}`;
    expect(heading.length).toBeGreaterThan(100);
    const b1 = base(['units:', '  primary: [a]'], `## Stance\nCareful.\n\n## ${heading}\nA\n\n## Tie-breaking\nSafety first.\n`);
    const r = run(b1, kid([], `## ${heading}\nB\n`));
    const w = r.diagnostics.find((d) => d.code === 'W_UNREVIEWED')!;
    const match = /add (.+?) to keep this/.exec(w.fix!)!;
    const suggestion = match[1]!;
    expect(suggestion).not.toContain('\n');
    const parsed: Record<string, string> = parse(`{${suggestion}}`);
    const expectedKey = `section:${heading.toLowerCase()}`;
    expect(Object.keys(parsed)).toEqual([expectedKey]);
    expect(parsed[expectedKey]).toBe('child');
  });

  it('accepts a non-canonical unit key and says so', () => {
    const r = run(
      base(['units:', '  primary: [a, x]']),
      kid(['units:', '  primary:', '    - x:', '        threshold: high', 'overrides:', '  x.threshold: child']),
      { 'acme/units/x.md': unitMd('x') },
    );
    expect(clashes(r)).toEqual(['acme:x.threshold:child']);
    expect(codes(r)).toEqual(['W_OVERRIDE_KEY_NONCANONICAL']);
  });

  it('keeps the first override on a duplicate canonical key and warns on the second', () => {
    const r = run(
      base(['units:', '  primary: [a, x]']),
      kid(['units:', '  primary:', '    - x:', '        threshold: high', 'overrides:', '  x.threshold: child', '  acme:x.threshold: parent']),
      { 'acme/units/x.md': unitMd('x') },
    );
    expect(clashes(r)).toEqual(['acme:x.threshold:child']);
    expect(codes(r)).toEqual(['W_OVERRIDE_KEY_NONCANONICAL', 'W_OVERRIDE_DUPLICATE']);
  });

  it('normalizes a non-canonical section override key and flips the clash', () => {
    const b1 = base(['units:', '  primary: [a]'], '## Stance\nCareful.\n\n## Context\nA\n\n## Tie-breaking\nSafety first.\n');
    const r = run(b1, kid(['overrides:', '  section:Context: parent'], '## context\nB\n'));
    expect(r.effective!.extraSections[0]!.text).toBe('A');
    expect(clashes(r)).toEqual(['section:context:parent']);
    expect(codes(r)).toEqual(['W_OVERRIDE_KEY_NONCANONICAL']);
  });

  it('quotes the renamed key in the W_OVERRIDE_KEY_NONCANONICAL fix when it is not a safe plain scalar', () => {
    const b1 = base(['units:', '  primary: [a]'], '## Stance\nCareful.\n\n## Notes: extra\nA\n\n## Tie-breaking\nSafety first.\n');
    const r = run(b1, kid(['overrides:', '  "section:Notes: extra": parent'], '## notes: extra\nB\n'));
    const w = r.diagnostics.find((d) => d.code === 'W_OVERRIDE_KEY_NONCANONICAL')!;
    expect(w.fix).toContain('Rename the key to "section:notes: extra"');
    expect(r.effective!.extraSections[0]!.text).toBe('A');
  });

  it('normalizes a non-canonical judgment override key and flips the clash', () => {
    const b1 = base(['units:', '  primary: [a]', 'judgment:', '  sections:', '    - name: Checks', '      ask: a']);
    const r = run(b1, kid(['judgment:', '  sections:', '    - name: checks', '      ask: b', 'overrides:', '  judgment:Checks: parent']));
    expect(r.effective!.judgmentSections).toEqual([{ name: 'Checks', ask: 'a' }]);
    expect(clashes(r)).toEqual(['judgment:checks:parent']);
    expect(codes(r)).toEqual(['W_OVERRIDE_KEY_NONCANONICAL']);
  });

  it('appends the ambiguity hint to a stale override on an ambiguous unit key', () => {
    const r = run(
      base(['units:', '  primary: [a, acme:y]']),
      kid(['units:', '  primary:', '    - acme:y:', '        threshold: high', 'overrides:', '  y.threshold: child']),
      { 'acme/units/y.md': unitMd('y'), 'beta/units/y.md': unitMd('y') },
    );
    expect(clashes(r)).toEqual(['acme:y.threshold:unreviewed']);
    expect(codes(r)).toEqual(['W_UNREVIEWED', 'W_STALE_OVERRIDE']);
    const stale = r.diagnostics.find((d) => d.code === 'W_STALE_OVERRIDE')!;
    expect(stale.fix).toContain('Use one of');
    expect(stale.fix).toContain('acme:y');
    expect(stale.fix).toContain('beta:y');
  });

  it('points a tier clash and its W_UNREVIEWED warning at the unit entry, not line 1', () => {
    const b1 = base(['units:', '  primary: [a, b]', '  secondary: [c]']);
    const r = run(b1, kid(['units:', '  secondary:', '    - a']));
    const clash = r.report.clashes.find((c) => c.id === 'a.tier')!;
    expect(clash.loc.line).toBeGreaterThan(1);
    const w = r.diagnostics.find((d) => d.code === 'W_UNREVIEWED')!;
    expect(w.loc).toEqual(clash.loc);
  });

  it('pins a section clash to the line of the layer\'s own heading', () => {
    const b1 = base(['units:', '  primary: [a]'], '## Stance\nCareful.\n\n## Context\nA\n\n## Tie-breaking\nSafety first.\n');
    const kidMd = kid([], '## context\nB\n');
    const r = run(b1, kidMd);
    const clash = r.report.clashes.find((c) => c.id === 'section:context')!;
    const expectedLine = kidMd.slice(0, kidMd.indexOf('## context')).split('\n').length;
    expect(clash.loc.line).toBe(expectedLine);
  });

  it('pins a judgment clash to the line of the layer\'s own section entry', () => {
    const b1 = base(['units:', '  primary: [a]', 'judgment:', '  sections:', '    - name: Checks', '      ask: a']);
    const kidMd = kid(['judgment:', '  sections:', '    - name: checks', '      ask: b']);
    const r = run(b1, kidMd);
    const clash = r.report.clashes.find((c) => c.id === 'judgment:checks')!;
    const expectedLine = kidMd.slice(0, kidMd.indexOf('- name: checks')).split('\n').length;
    expect(clash.loc.line).toBe(expectedLine);
  });

  it('pins a primary-order clash to the line of the layer\'s own primary_order key', () => {
    const b1 = base(['units:', '  primary: [a, b, c]']);
    const kidMd = kid(['units:', '  primary_order: [c, a]']);
    const r = run(b1, kidMd);
    const clash = r.report.clashes.find((c) => c.id === 'primary-order')!;
    const expectedLine = kidMd.slice(0, kidMd.indexOf('primary_order')).split('\n').length;
    expect(clash.loc.line).toBe(expectedLine);
  });

  it('keeps a dropped setting gone through a further layer', () => {
    const files = {
      'acme/personas/grand.md': personaMd(['name: grand', 'description: Grand.', 'units:', '  primary:', '    - a:', '        add_questions: [q]']),
      'acme/personas/mid.md': personaMd(['name: mid', 'extends: grand', 'units:', '  secondary: [a]'], ''),
    };
    const r = run(
      base(['units:', '  primary: [b]']),
      personaMd(['name: kid', 'extends: acme:mid'], ''),
      files,
    );
    expect(unit(r.effective!, 'a').addQuestions).toEqual([]);
    expect(tiers(r.effective!).secondary).toEqual(['a']);
  });

  it('attributes clashes to the layer that produced them (3 levels)', () => {
    const files = {
      'acme/personas/grand.md': personaMd(['name: grand', 'description: Grand.', 'units:', '  primary: [a]']),
      'acme/personas/mid.md': personaMd(['name: mid', 'extends: grand', 'units:', '  primary:', '    - a:', '        threshold: high'], ''),
    };
    const r = run(
      base(['units:', '  primary: [a]']),
      personaMd(['name: kid', 'extends: acme:mid', 'overrides:', '  a.threshold: parent'], ''),
      files,
    );
    expect(r.report.clashes.map((c) => [c.id, c.layer.canonical, c.decision])).toEqual([['a.threshold', 'acme:mid', 'unreviewed']]);
    expect(r.report.stale.map((s) => [s.key, s.layer.canonical])).toEqual([['a.threshold', 'kid']]);
    expect(effectiveThreshold(unit(r.effective!, 'a'))).toBe('high');
  });

  it('does not warn W_UNREVIEWED for an unreviewed clash declared by a plugin layer, which the user cannot fix', () => {
    const files = {
      'acme/personas/grand.md': personaMd(['name: grand', 'description: Grand.', 'units:', '  primary: [a]']),
      'acme/personas/mid.md': personaMd(['name: mid', 'extends: grand', 'units:', '  primary:', '    - a:', '        threshold: high'], ''),
    };
    const r = run(
      base(['units:', '  primary: [b]']),
      personaMd(['name: kid', 'extends: acme:mid'], ''),
      files,
    );
    expect(r.report.clashes.map((c) => [c.id, c.layer.canonical, c.decision])).toEqual([['a.threshold', 'acme:mid', 'unreviewed']]);
    expect(codes(r)).not.toContain('W_UNREVIEWED');
  });

  it('collects shadows as informational entries', () => {
    const r = run(base(['units:', '  primary: [a]']), kid([]), { 'project/units/a.md': unitMd('a') });
    expect(r.report.shadows.map((s) => [s.kind, s.name, s.used.scope.kind])).toEqual([['unit', 'a', 'project']]);
    expect(codes(r)).toEqual([]);
  });

  it('is deterministic', () => {
    const b1 = base(['units:', '  primary: [a, b]']);
    const k1 = kid(['units:', '  secondary: [a]', '  primary_order: [b]'], '## Stance\nBold.\n');
    const files: Record<string, string> = { ...UNITS, 'user/personas/base.md': b1, 'project/personas/kid.md': k1 };
    const { reg } = registryFor(files);
    const strip = (r: Resolution) => JSON.stringify({ e: r.effective?.units, c: clashes(r), d: codes(r) });
    expect(strip(resolvePersona(reg, 'kid'))).toBe(strip(resolvePersona(reg, 'kid')));
  });
});
