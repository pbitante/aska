import { accessSync, chmodSync, constants } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkInPlace, collectAll } from '../../src/author/check';
import { panelMd, personaMd, unitMd } from '../helpers/md';
import { registryFor } from '../helpers/scopes';

const canRead = (path: string): boolean => {
  try {
    accessSync(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

const files = () => ({
  'user/units/a.md': unitMd('a'),
  'user/personas/p.md': personaMd(['name: p', 'description: P.', 'units:', '  primary: [a]']),
  'user/personas/q.md': personaMd(['name: q', 'description: Q.', 'units:', '  primary: [a]']),
  'project/panels/duo.md': panelMd('duo', ['p', 'q']),
});

describe('check-in-place', () => {
  it('collects no errors for a clean library', () => {
    const { scopes } = registryFor(files());
    expect(collectAll(scopes).filter((d) => d.level === 'error')).toEqual([]);
  });

  it('reports an unreadable unit as E_READ, as validate does, instead of skipping it', () => {
    const { scopes, root } = registryFor(files());
    const unit = join(root, 'home/.claude/personas/a.unit.md');
    chmodSync(unit, 0o000);
    try {
      if (canRead(unit)) return; // running as root: permissions can't make a file unreadable
      expect(collectAll(scopes)).toContainEqual(expect.objectContaining({ code: 'E_READ', loc: { file: unit, line: 1 } }));
    } finally {
      chmodSync(unit, 0o644);
    }
  });

  it('reports the panel a deletion would break, mapped back to real paths', () => {
    const { scopes, root } = registryFor(files());
    const userRoot = join(root, 'home/.claude');
    const r = checkInPlace(scopes, { scope: { kind: 'user', root: userRoot }, path: join(userRoot, 'personas/q.persona.md') }, null);
    expect(r.own).toEqual([]);
    expect(r.broken.map((d) => [d.code, d.loc?.file])).toEqual([['E_PANEL_PERSONA', join(root, 'proj/.claude/personas/duo.panel.md')]]);
  });

  it('reports a candidate file\'s own errors and leaves the real file untouched', () => {
    const { scopes, root } = registryFor(files());
    const userRoot = join(root, 'home/.claude');
    const path = join(userRoot, 'personas/p.persona.md');
    const r = checkInPlace(scopes, { scope: { kind: 'user', root: userRoot }, path }, personaMd(['name: p', 'description: P.', 'units:', '  primary: [nope]']));
    expect(r.own.some((d) => d.code === 'E_UNKNOWN_REF' && d.loc?.file === path)).toBe(true);
    expect(collectAll(scopes).filter((d) => d.level === 'error')).toEqual([]);
  });

  it('checks a new project scope that does not exist yet', () => {
    const { scopes, root } = registryFor({ 'user/units/a.md': unitMd('a') });
    const projRoot = join(root, 'proj/.claude');
    const path = join(projRoot, 'personas/n.persona.md');
    const r = checkInPlace(scopes, { scope: { kind: 'project', root: projRoot }, path }, personaMd(['name: n', 'description: N.', 'units:', '  primary: [a]']));
    expect(r.own.filter((d) => d.level === 'error')).toEqual([]);
    expect(r.broken).toEqual([]);
  });
});
