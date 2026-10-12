import { describe, expect, it } from 'vitest';
import type { ClashReport, Clash } from '../../src/model/effective';
import type { FileRef, Scope, Shadow } from '../../src/model/types';
import { activationLine, formatReport } from '../../src/resolve/report';

const scope = (kind: Scope['kind'], plugin?: string): Scope => ({ kind, root: `/${kind}`, plugin });
const file = (canonical: string, s: Scope): FileRef => ({ kind: 'persona', name: canonical.split(':').pop()!, scope: s, path: `/${canonical}.md`, canonical });
const clash = (id: string, layer: FileRef, decision: Clash['decision']): Clash =>
  ({ id, layer, child: 'c', parent: 'p', decision, dropped: [], loc: { file: layer.path, line: 1 } });

describe('activationLine', () => {
  const kid = file('kid', scope('project'));
  const mid = file('acme:mid', scope('plugin', 'acme'));

  it('counts unreviewed and stale entries from user and project layers only', () => {
    const report: ClashReport = {
      clashes: [clash('a.tier', kid, 'unreviewed'), clash('b.tier', kid, 'unreviewed'), clash('c.tier', mid, 'unreviewed'), clash('d.tier', kid, 'child')],
      stale: [{ layer: kid, key: 'x', id: 'x', loc: { file: '/kid.md', line: 4 } }],
      shadows: [],
    };
    expect(activationLine('kid', report)).toBe('kid: 2 unreviewed overrides, 1 stale override — run persona explain kid');
  });

  it('returns undefined when only plugin layers or shadows have entries', () => {
    expect(activationLine('kid', { clashes: [clash('c.tier', mid, 'unreviewed')], stale: [], shadows: [] })).toBeUndefined();
  });

  it('ignores a stale entry from a plugin layer', () => {
    const report: ClashReport = { clashes: [], stale: [{ layer: mid, key: 'x', id: 'x', loc: { file: '/mid.md', line: 4 } }], shadows: [] };
    expect(activationLine('kid', report)).toBeUndefined();
  });

  it('returns undefined when the report has only shadows', () => {
    const shadow: Shadow = { kind: 'persona', name: 'mid', used: kid, shadowed: [mid] };
    expect(activationLine('kid', { clashes: [], stale: [], shadows: [shadow] })).toBeUndefined();
  });
});

describe('formatReport', () => {
  it('lists clashes with keep/flip lines, drops, stale entries and shadow pins', () => {
    const kid = file('kid', scope('project'));
    const used: FileRef = { kind: 'unit', name: 'a', scope: scope('project'), path: '/p/a.md', canonical: 'a' };
    const shadowed: FileRef = { kind: 'unit', name: 'a', scope: scope('plugin', 'acme'), path: '/acme/a.md', canonical: 'acme:a' };
    const text = formatReport({
      clashes: [{ ...clash('a.tier', kid, 'unreviewed'), dropped: ['inherited note'] }],
      stale: [{ layer: kid, key: 'stance', id: 'stance', loc: { file: '/kid.md', line: 5 } }],
      shadows: [{ kind: 'unit', name: 'a', used, shadowed: [shadowed] }],
    });
    expect(text).toContain('[unreviewed] a.tier');
    expect(text).toContain('dropped: inherited note');
    expect(text).toContain('"a.tier: parent"');
    expect(text).toContain('stance in /kid.md:5 matches no clash');
    expect(text).toContain('pin with acme:a');
  });

  it('quotes a clash key in the keep/flip line when it is not a safe plain scalar', () => {
    const kid = file('kid', scope('project'));
    const text = formatReport({ clashes: [clash('section:notes: extra', kid, 'unreviewed')], stale: [], shadows: [] });
    expect(text).toContain('"section:notes: extra": child');
    expect(text).toContain('"section:notes: extra": parent');
  });

  it('says so when there is nothing to report', () => {
    expect(formatReport({ clashes: [], stale: [], shadows: [] })).toBe('No clashes, stale overrides or shadows.');
  });
});
