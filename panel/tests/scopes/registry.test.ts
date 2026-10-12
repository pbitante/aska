import { chmodSync, mkdirSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Registry } from '../../src/scopes/registry';
import { unitMd } from '../helpers/md';
import { registryFor } from '../helpers/scopes';
import { makeTree } from '../helpers/tree';

const canList = (dir: string): boolean => {
  try {
    readdirSync(dir);
    return true;
  } catch {
    return false;
  }
};

describe('Registry', () => {
  it('warns about a personas folder it cannot read, and says nothing about one that is missing', () => {
    const root = makeTree({ 'u/personas/a.unit.md': unitMd('a'), 'p/.keep': '' });
    const dir = join(root, 'u/personas');
    chmodSync(dir, 0o000);
    try {
      const reg = new Registry([{ kind: 'user', root: join(root, 'u') }, { kind: 'project', root: join(root, 'p') }]);
      if (canList(dir)) return; // running as root: permissions can't hide a folder
      expect(reg.diagnostics).toEqual([expect.objectContaining({ code: 'W_SCOPE_UNREADABLE', level: 'warning', loc: { file: dir, line: 1 } })]);
      expect(reg.diagnostics[0]!.message).toContain('EACCES');
    } finally {
      chmodSync(dir, 0o755);
    }
  });

  it('indexes files per kind with canonical names', () => {
    const { reg } = registryFor({ 'project/units/a.md': unitMd('a'), 'acme/units/b.md': unitMd('b'), 'user/personas/p.md': 'x' });
    expect(reg.all('unit').map((f) => f.canonical)).toEqual(['a', 'acme:b']);
    expect(reg.all('persona').map((f) => [f.canonical, f.scope.kind])).toEqual([['p', 'user']]);
  });

  it('gives a plugin persona a namespaced canonical name', () => {
    const { reg } = registryFor({ 'acme/personas/p.md': 'x' });
    expect(reg.all('persona').map((f) => f.canonical)).toEqual(['acme:p']);
  });

  it('resolves a bare name to the most specific scope and records the shadow', () => {
    const { reg } = registryFor({ 'project/units/a.md': unitMd('a'), 'user/units/a.md': unitMd('a'), 'acme/units/a.md': unitMd('a') });
    const l = reg.lookup('unit', 'a');
    expect(l.file!.scope.kind).toBe('project');
    expect(l.shadow!.shadowed.map((f) => f.canonical)).toEqual(['a', 'acme:a']);
    expect(l.shadow!.shadowed.map((f) => f.scope.kind)).toEqual(['user', 'plugin']);
  });

  it('resolves a namespaced name to the plugin file without a shadow', () => {
    const { reg } = registryFor({ 'project/units/a.md': unitMd('a'), 'acme/units/a.md': unitMd('a') });
    const l = reg.lookup('unit', 'acme:a');
    expect(l.file!.canonical).toBe('acme:a');
    expect(l.shadow).toBeUndefined();
  });

  it('errors on a bare name defined only by two plugins', () => {
    const { reg } = registryFor({ 'acme/units/a.md': unitMd('a'), 'beta/units/a.md': unitMd('a') });
    const l = reg.lookup('unit', 'a', { file: 'p.md', line: 4 });
    expect(l.file).toBeUndefined();
    expect(l.diagnostic).toMatchObject({ code: 'E_AMBIGUOUS', loc: { file: 'p.md', line: 4 } });
    expect(l.diagnostic!.fix).toContain('acme:a, beta:a');
  });

  it('prefers a user file even when two plugins define the name', () => {
    const { reg } = registryFor({ 'user/units/a.md': unitMd('a'), 'acme/units/a.md': unitMd('a'), 'beta/units/a.md': unitMd('a') });
    const l = reg.lookup('unit', 'a');
    expect(l.file!.scope.kind).toBe('user');
    expect(l.diagnostic).toBeUndefined();
  });

  it('suggests a close name for an unknown reference', () => {
    const { reg } = registryFor({ 'user/units/edge-cases.md': unitMd('edge-cases') });
    const l = reg.lookup('unit', 'edge-case');
    expect(l.diagnostic).toMatchObject({ code: 'E_UNKNOWN_REF', fix: 'Did you mean "edge-cases"?' });
  });

  it('suggests a canonical form when the closest bare name is ambiguous across plugins', () => {
    const { reg } = registryFor({ 'a/units/edge-cases.md': unitMd('edge-cases'), 'b/units/edge-cases.md': unitMd('edge-cases') });
    const l = reg.lookup('unit', 'edge-case');
    expect(l.diagnostic).toMatchObject({ code: 'E_UNKNOWN_REF', fix: 'Did you mean "a:edge-cases"?' });
  });

  it('looks only below a scope when asked (same-name extends)', () => {
    const { reg, scopes } = registryFor({ 'project/personas/r.md': 'x', 'user/personas/r.md': 'x' });
    expect(reg.lookup('persona', 'r', undefined, scopes[0]).file!.scope.kind).toBe('user');
    expect(reg.lookup('persona', 'r', undefined, scopes[1]).diagnostic!.code).toBe('E_UNKNOWN_REF');
  });

  it('ignores below for a namespaced reference, even when below is the plugin scope itself', () => {
    const { reg, scopes } = registryFor({ 'acme/units/r.md': unitMd('r') });
    const pluginScope = scopes.find((s) => s.kind === 'plugin')!;
    const l = reg.lookup('unit', 'acme:r', undefined, pluginScope);
    expect(l.file!.canonical).toBe('acme:r');
  });

  it('still reports ambiguity for a bare name restricted by below', () => {
    const { reg, scopes } = registryFor({
      'project/units/x.md': unitMd('x'),
      'a/units/x.md': unitMd('x'),
      'b/units/x.md': unitMd('x'),
    });
    const projectScope = scopes.find((s) => s.kind === 'project')!;
    const l = reg.lookup('unit', 'x', undefined, projectScope);
    expect(l.file).toBeUndefined();
    expect(l.diagnostic).toMatchObject({ code: 'E_AMBIGUOUS' });
  });

  it('ignores missing scope directories', () => {
    const { reg } = registryFor({});
    expect(reg.all('unit')).toEqual([]);
  });

  it('indexes only regular files whose stem is non-empty, warning about a ":" in the stem', () => {
    const { root, scopes } = registryFor({ 'user/units/ok.md': unitMd('ok'), 'user/units/.md': 'bad' });
    mkdirSync(join(root, 'home/.claude/personas/dir.unit.md'), { recursive: true });
    writeFileSync(join(root, 'home/.claude/personas/acme:z.unit.md'), unitMd('acme:z'));
    const reg = new Registry(scopes);
    expect(reg.all('unit').map((f) => f.canonical)).toEqual(['ok']);
    expect(reg.diagnostics.map((d) => d.code)).toEqual(['W_BAD_FILENAME']);
    expect(reg.diagnostics[0]!.level).toBe('warning');
    expect(reg.diagnostics[0]!.message).toContain('acme:z.unit.md');
    expect(reg.diagnostics[0]!.fix).toBeTruthy();
  });

  it('de-duplicates scope roots by realpath, keeping the first (most specific)', () => {
    const root = makeTree({ 'real/personas/a.unit.md': unitMd('a') });
    symlinkSync(join(root, 'real'), join(root, 'alias'));
    const project = { kind: 'project' as const, root: join(root, 'real') };
    const plugin = { kind: 'plugin' as const, root: join(root, 'alias'), plugin: 'acme' };
    const reg = new Registry([project, plugin]);
    expect(reg.all('unit').map((f) => f.canonical)).toEqual(['a']);
    expect(reg.all('unit').map((f) => f.scope.kind)).toEqual(['project']);
  });

  it('indexes a symlinked unit file, and skips a dangling symlink without throwing', () => {
    const root = makeTree({ 'target/a.md': unitMd('a'), 'home/personas/b.unit.md': unitMd('b') });
    symlinkSync(join(root, 'target/a.md'), join(root, 'home/personas/a.unit.md'));
    symlinkSync(join(root, 'target/missing.md'), join(root, 'home/personas/dangling.unit.md'));
    const scope = { kind: 'user' as const, root: join(root, 'home') };
    const files = new Registry([scope]).all('unit');
    expect(files.map((f) => f.canonical).sort()).toEqual(['a', 'b']);
  });

  it('excludes a symlink to a directory even when it has a ".md" stem', () => {
    const root = makeTree({ 'realdir/.keep': '', 'home/personas/.keep': '' });
    symlinkSync(join(root, 'realdir'), join(root, 'home/personas/dir.unit.md'));
    const scope = { kind: 'user' as const, root: join(root, 'home') };
    const files = new Registry([scope]).all('unit');
    expect(files).toEqual([]);
  });
});

describe('Registry: typed layout', () => {
  it('indexes *.persona.md and *.unit.md from one folder and ignores subfolders', () => {
    const { reg } = registryFor({
      'project/units/a.md': unitMd('a'),
      'project/personas/p.md': 'x',
      'project/raw/sub/b.unit.md': unitMd('b'),
      'project/raw/personas/old.md': 'x',
      'project/raw/units/old.md': unitMd('old'),
    });
    expect(reg.all('unit').map((f) => f.name)).toEqual(['a']);
    expect(reg.all('persona').map((f) => f.name)).toEqual(['p']);
    expect(reg.all('unit')[0]!.path.endsWith('/proj/.claude/personas/a.unit.md')).toBe(true);
    expect(reg.diagnostics).toEqual([]);
  });

  it('warns about untyped markdown files and does not index them', () => {
    const { reg } = registryFor({
      'user/raw/notes.md': 'x',
      'user/raw/x.PERSONA.md': 'x',
      'user/units/a.md': unitMd('a'),
      'user/raw/x.persona.md.bak': 'x',
      'user/raw/x.unit.persona.md': 'x',
    });
    expect(reg.diagnostics.map((d) => d.code)).toEqual(['W_UNTYPED_FILE', 'W_UNTYPED_FILE']);
    expect(reg.diagnostics.every((d) => d.level === 'warning')).toBe(true);
    expect(reg.diagnostics.every((d) => (d.fix ?? '').includes('.persona.md'))).toBe(true);
    expect(reg.all('unit').map((f) => f.name)).toEqual(['a']);
    expect(reg.all('persona').map((f) => f.name)).toEqual(['x.unit']);
  });

  it('allows the same name as a unit and as a persona', () => {
    const { reg } = registryFor({ 'user/units/a.md': unitMd('a'), 'user/personas/a.md': 'x' });
    expect(reg.lookup('unit', 'a').file!.kind).toBe('unit');
    expect(reg.lookup('persona', 'a').file!.kind).toBe('persona');
  });

  it('skips an empty stem silently', () => {
    const { reg } = registryFor({ 'user/raw/.persona.md': 'x', 'user/raw/.unit.md': 'x' });
    expect(reg.all('persona')).toEqual([]);
    expect(reg.all('unit')).toEqual([]);
    expect(reg.diagnostics).toEqual([]);
  });
});
