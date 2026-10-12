import { rmSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatListing, listRows } from '../../src/cli/list';
import { panelMd, personaMd, unitMd } from '../helpers/md';
import { registryFor } from '../helpers/scopes';

const files = () => ({
  'project/units/security.md': unitMd('security', { description: 'Project security', threshold: 'high' }),
  'acme/units/security.md': unitMd('security', { description: 'Plugin security', threshold: 'low', appliesWhen: 'input arrives' }),
  'acme/units/cost.md': unitMd('cost', { description: 'Money' }),
  'user/units/broken.md': unitMd('broken', { threshold: 'severe' }),
  'user/personas/base.md': personaMd(['name: base', 'description: Base.', 'units:', '  primary: [cost]']),
  'project/personas/kid.md': personaMd(['name: kid', 'extends: base'], ''),
});

describe('listRows', () => {
  it('lists units in scope order with every spec field', () => {
    const { reg } = registryFor(files());
    const { units } = listRows(reg);
    expect(units.map((u) => [u.canonical, u.scope, u.plugin])).toEqual([
      ['security', 'project', null],
      ['broken', 'user', null],
      ['acme:cost', 'plugin', 'acme'],
      ['acme:security', 'plugin', 'acme'],
    ]);
    const pluginSec = units[3]!;
    expect(Object.keys(pluginSec)).toEqual(['canonical', 'name', 'scope', 'plugin', 'path', 'description', 'shadowedBy', 'valid', 'errorCount', 'threshold', 'appliesWhen']);
    expect(pluginSec).toMatchObject({ description: 'Plugin security', threshold: 'low', appliesWhen: 'input arrives', valid: true, errorCount: 0 });
    expect(pluginSec.shadowedBy!.endsWith('/proj/.claude/personas/security.unit.md')).toBe(true);
    expect(units[0]!.shadowedBy).toBeNull();
  });

  it('keeps invalid files, marked, with the fields it could read', () => {
    const { reg } = registryFor(files());
    const broken = listRows(reg).units.find((u) => u.name === 'broken')!;
    expect(broken).toMatchObject({ valid: false, threshold: 'severe', description: 'About broken' });
    expect(broken.errorCount).toBeGreaterThanOrEqual(1);
  });

  it('lists an unreadable file as invalid with null fields', () => {
    const { reg, root } = registryFor(files());
    const path = `${root}/home/.claude/personas/broken.unit.md`;
    rmSync(path);
    const row = listRows(reg).units.find((u) => u.name === 'broken')!;
    expect(row).toMatchObject({ valid: false, errorCount: 1, description: null, threshold: null, appliesWhen: null });
  });

  it('lists personas with extends', () => {
    const { reg } = registryFor(files());
    expect(listRows(reg).personas.map((p) => [p.canonical, p.scope, p.extends, p.valid])).toEqual([
      ['kid', 'project', 'base', true],
      ['base', 'user', null, true],
    ]);
  });

  it('does not mark either plugin row as shadowed when two plugins share a name', () => {
    const { reg } = registryFor({ 'acme/units/x.md': unitMd('x'), 'beta/units/x.md': unitMd('x') });
    expect(listRows(reg).units.map((u) => [u.canonical, u.shadowedBy])).toEqual([['acme:x', null], ['beta:x', null]]);
  });

  it('sorts plugin rows by plugin namespace first, even when unit names interleave', () => {
    const { reg } = registryFor({
      'acme/units/a.md': unitMd('a'),
      'beta/units/b.md': unitMd('b'),
      'acme/units/c.md': unitMd('c'),
    });
    expect(listRows(reg).units.map((u) => u.canonical)).toEqual(['acme:a', 'acme:c', 'beta:b']);
  });

  it('is deterministic', () => {
    const { reg } = registryFor(files());
    expect(JSON.stringify(listRows(reg))).toBe(JSON.stringify(listRows(reg)));
  });
});

describe('formatListing', () => {
  it('groups by scope and marks shadowed and invalid rows', () => {
    const { reg } = registryFor(files());
    const text = formatListing(listRows(reg), ['units', 'personas'], 120);
    expect(text).toContain('units:');
    expect(text).toContain('  project');
    expect(text).toContain('  plugin acme');
    expect(text).toMatch(/security .*\(shadowed by project\)/);
    expect(text).toMatch(/broken .*\(invalid: \d+ errors?\)/);
    expect(text).toContain('personas:');
    expect(text).toMatch(/kid .*extends base/);
  });

  it('prints only the requested kinds and survives a tiny width', () => {
    const { reg } = registryFor(files());
    const text = formatListing(listRows(reg), ['personas'], 20);
    expect(text).not.toContain('units:');
    expect(text.split('\n').length).toBeGreaterThan(2);
  });

  it('does not repeat a plugin heading when two plugins interleave by name', () => {
    const { reg } = registryFor({
      'acme/units/a.md': unitMd('a'),
      'beta/units/b.md': unitMd('b'),
      'acme/units/c.md': unitMd('c'),
    });
    const text = formatListing(listRows(reg), ['units'], 120);
    expect(text.match(/plugin acme/g)).toHaveLength(1);
    expect(text.match(/plugin beta/g)).toHaveLength(1);
  });

  it('truncates long descriptions to the width', () => {
    const { reg } = registryFor({ 'user/units/long.md': unitMd('long', { description: 'x'.repeat(200) }) });
    const line = formatListing(listRows(reg), ['units'], 60).split('\n').find((l) => l.includes('long'))!;
    expect(line.length).toBeLessThanOrEqual(60);
    expect(line).toContain('…');
  });

  it('collapses whitespace runs in a multi-line description before truncating, without affecting JSON', () => {
    const { reg } = registryFor({ 'user/units/multi.md': unitMd('multi', { description: '|\n  line one\n  line two' }) });
    const rows = listRows(reg);
    expect(rows.units[0]!.description).toBe('line one\nline two');
    const lines = formatListing(rows, ['units'], 120).split('\n');
    expect(lines.find((l) => l.includes('line one'))).toContain('line one line two');
    expect(lines.some((l) => l.includes('line two') && !l.includes('line one'))).toBe(false);
  });
});

describe('listRows: persona units', () => {
  const tierFiles = () => ({
    'user/units/a.md': unitMd('a', { description: 'Alpha', threshold: 'medium' }),
    'user/units/b.md': unitMd('b', { description: 'Beta', threshold: 'high' }),
    'user/units/c.md': unitMd('c', { description: 'Gamma', threshold: 'low' }),
    'user/units/d.md': unitMd('d', { description: 'Delta' }),
    // primary_order needs extends (E_NEEDS_EXTENDS), so this root persona expresses ranking
    // order directly via declaration order instead.
    'user/personas/base.md': personaMd([
      'name: base', 'description: Base.', 'units:',
      '  primary: [b, a]',
      '  secondary:',
      '    - c:',
      '        threshold: high',
      '  deprioritized: [d]',
    ]),
    'project/personas/kid.md': personaMd([
      'name: kid', 'extends: base', 'units:',
      '  exclude: [d]',
      '  primary_order: [a, b]',
      '  secondary:',
      '    - c:',
      '        threshold: critical',
      'overrides:',
      '  primary-order: child',
      '  c.threshold: child',
    ], ''),
    'project/personas/bad.md': personaMd(['name: bad', 'description: Bad.', 'units:', '  primary: [nope]']),
  });
  const row = (name: string) => listRows(registryFor(tierFiles()).reg).personas.find((p) => p.name === name)!;

  it('lists units by tier, primary in ranking order, with effective thresholds', () => {
    expect(row('base').units).toEqual({
      primary: [
        { canonical: 'b', description: 'Beta', threshold: 'high' },
        { canonical: 'a', description: 'Alpha', threshold: 'medium' },
      ],
      secondary: [{ canonical: 'c', description: 'Gamma', threshold: 'high' }],
      deprioritized: [{ canonical: 'd', description: 'Delta', threshold: 'critical' }],
    });
  });

  it('applies extends, exclude, a primary_order override and a threshold override on an inherited unit', () => {
    const units = row('kid').units!;
    expect(units.primary.map((u) => u.canonical)).toEqual(['a', 'b']);
    expect(units.secondary).toEqual([{ canonical: 'c', description: 'Gamma', threshold: 'critical' }]);
    expect(units.deprioritized).toEqual([]);
  });

  it('gives units null when the persona does not resolve, even though it parses', () => {
    expect(row('bad')).toMatchObject({ valid: true, units: null });
  });

  it('gives units null for an unreadable persona', () => {
    const { reg, root } = registryFor(tierFiles());
    rmSync(`${root}/home/.claude/personas/base.persona.md`);
    const rows = listRows(reg).personas;
    expect(rows.find((p) => p.name === 'base')).toMatchObject({ valid: false, units: null });
    expect(rows.find((p) => p.name === 'kid')!.units).toBeNull();
  });

  it('sets units to null on a shadowed row, keeping it on the winner', () => {
    const { reg } = registryFor({
      'acme/units/a.md': unitMd('a'),
      'acme/personas/g.md': personaMd(['name: g', 'description: Plugin g.', 'units:', '  primary: [a]']),
      'user/personas/g.md': personaMd(['name: g', 'description: User g.', 'units:', '  primary: [acme:a]']),
    });
    const rows = listRows(reg).personas;
    const plugin = rows.find((p) => p.canonical === 'acme:g')!;
    expect(plugin.shadowedBy).not.toBeNull();
    expect(plugin.units).toBeNull();
    const winner = rows.find((p) => p.canonical === 'g')!;
    expect(winner.shadowedBy).toBeNull();
    expect(winner.units!.primary.map((u) => u.canonical)).toEqual(['acme:a']);
  });

  it('sets units to null on a shadowed user row even though its canonical matches the winning project row', () => {
    const { reg } = registryFor({
      'project/units/a.md': unitMd('a'),
      'project/personas/g.md': personaMd(['name: g', 'description: Project g.', 'units:', '  primary: [a]']),
      'user/personas/g.md': personaMd(['name: g', 'description: User g.', 'units:', '  primary: [a]']),
    });
    const rows = listRows(reg).personas;
    const projectRow = rows.find((p) => p.scope === 'project')!;
    const userRow = rows.find((p) => p.scope === 'user')!;
    expect(projectRow.shadowedBy).toBeNull();
    expect(projectRow.units!.primary.map((u) => u.canonical)).toEqual(['a']);
    expect(userRow.shadowedBy).not.toBeNull();
    expect(userRow.units).toBeNull();
  });

  it('keeps persona row keys in a fixed order, and leaves text output free of units', () => {
    const rows = listRows(registryFor(tierFiles()).reg);
    expect(Object.keys(rows.personas[0]!)).toEqual(['canonical', 'name', 'scope', 'plugin', 'path', 'description', 'shadowedBy', 'valid', 'errorCount', 'extends', 'units']);
    expect(Object.keys(row('base').units!)).toEqual(['primary', 'secondary', 'deprioritized']);
    const text = formatListing(rows, ['personas'], 200);
    for (const s of ['Alpha', 'Beta', 'primary']) expect(text).not.toContain(s);
  });
});

describe('listRows: panels', () => {
  it('lists a panel\'s models, and none for a panel whose models are invalid', () => {
    const { reg } = registryFor({
      'user/units/a.md': unitMd('a'),
      'user/personas/g.md': personaMd(['name: g', 'description: G.', 'units:', '  primary: [a]']),
      'user/personas/h.md': personaMd(['name: h', 'description: H.', 'units:', '  primary: [a]']),
      'project/panels/cheap.md': panelMd('cheap', ['g', 'h'], { extra: ['models:', '  h: haiku'] }),
      'project/panels/odd.md': panelMd('odd', ['g', 'h'], { extra: ['models:', '  h: gpt-4'] }),
    });
    const rows = listRows(reg).panels;
    expect(rows.map((p) => [p.canonical, p.valid, p.models])).toEqual([['cheap', true, { h: 'haiku' }], ['odd', false, {}]]);
  });

  it('lists panels with personas and resolution errors counted', () => {
    const { reg } = registryFor({
      'user/units/a.md': unitMd('a'),
      'user/personas/g.md': personaMd(['name: g', 'description: G.', 'units:', '  primary: [a]']),
      'project/panels/ok.md': panelMd('ok', ['g', 'g']),
      'project/panels/bad.md': panelMd('bad', ['g', 'nobody']),
    });
    const rows = listRows(reg).panels;
    expect(rows.map((p) => [p.canonical, p.valid])).toEqual([['bad', false], ['ok', false]]);
    expect(rows[0]!.personas).toEqual(['g', 'nobody']);
    expect(rows[0]!.errorCount).toBe(1);
    expect(Object.keys(rows[0]!)).toEqual(['canonical', 'name', 'scope', 'plugin', 'path', 'description', 'personas', 'models', 'shadowedBy', 'valid', 'errorCount']);
    expect(rows[0]!.models).toEqual({});
    expect(formatListing(listRows(reg), ['panels'], 100)).toMatch(/bad .*personas g, nobody/);
  });
});
