import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { showFile } from '../../src/author/show';
import { parseArgv, run } from '../../src/cli/main';
import { Registry } from '../../src/scopes/registry';
import { panelMd, personaMd, unitMd } from '../helpers/md';
import { registryFor } from '../helpers/scopes';

export const authorFiles = (): Record<string, string> => ({
  'user/units/a.md': unitMd('a', { description: 'Alpha' }),
  'user/units/b.md': unitMd('b'),
  'user/units/u.md': unitMd('u', { description: 'Unused' }),
  'acme/units/c.md': unitMd('c'),
  'user/personas/p.md': personaMd([
    'name: p # the p persona',
    'description: P.',
    'units:',
    '  primary:',
    '    - a:',
    '        threshold: low',
    '        add_questions: [Is a ok?]',
    '  secondary: [b]',
  ]),
  'user/personas/q.md': personaMd(['name: q', 'description: Q.', 'units:', '  primary: [b]']),
  'project/panels/duo.md': panelMd('duo', ['p', 'q'], { notes: 'Be brief.' }),
  'acme/personas/r.md': personaMd(['name: r', 'description: R.', 'units:', '  primary: [c]']),
});

export function authorCli(files: Record<string, string> = authorFiles()) {
  const { root } = registryFor(files);
  const pluginListJson = JSON.stringify([{ id: 'acme@m', enabled: true, installPath: join(root, 'plugins/acme') }]);
  const execIn = (cwd: string, ...argv: string[]) => {
    const out: string[] = [];
    const code = run(argv, { cwd, home: join(root, 'home'), pluginListJson, out: (s) => out.push(s) });
    const text = out.join('\n');
    return { code, text, json: () => JSON.parse(text) };
  };
  return {
    root,
    path: (rel: string) => join(root, rel),
    exec: (...argv: string[]) => execIn(join(root, 'proj'), ...argv),
    execIn,
    input(name: string, content: string): string {
      const p = join(root, name);
      writeFileSync(p, content);
      return p;
    },
  };
}

describe('parseArgv: author commands', () => {
  it('parses show, and rejects bad kinds, stray flags, and plugin writes on other commands', () => {
    expect(parseArgv(['show', 'persona', 'p', '--json'], '/x')).toMatchObject({ kind: 'author', command: 'show', fileKind: 'persona', name: 'p', json: true, force: false });
    expect(parseArgv(['show', 'persona', 'r', '--scope', 'plugin'], '/x')).toMatchObject({ kind: 'author', scope: 'plugin' });
    expect(parseArgv(['show', 'thing', 'p'], '/x').kind).toBe('usage');
    expect(parseArgv(['show', 'persona'], '/x').kind).toBe('usage');
    expect(parseArgv(['show', 'persona', 'p', 'extra'], '/x').kind).toBe('usage');
    expect(parseArgv(['show', 'unit', 'a', '--force'], '/x').kind).toBe('usage');
    expect(parseArgv(['show', 'unit', 'a', '--file', 'f'], '/x').kind).toBe('usage');
    expect(parseArgv(['show', 'unit', 'a', '--panel'], '/x').kind).toBe('usage');
    expect(parseArgv(['validate', '--expect-hash', 'h'], '/x').kind).toBe('usage');
    expect(parseArgv(['validate', '--force'], '/x').kind).toBe('usage');
    expect(parseArgv(['render', 'x', '--scope', 'plugin'], '/x').kind).toBe('usage');
  });

  it('rejects names that are not kebab-case for save, patch and delete, and non-REF names for show', () => {
    expect(parseArgv(['delete', 'unit', '../x', '--scope', 'user'], '/x').kind).toBe('usage');
    expect(parseArgv(['save', 'unit', 'a/b', '--scope', 'user', '--file', 'f'], '/x').kind).toBe('usage');
    expect(parseArgv(['patch', 'persona', 'A', '--scope', 'user', '--file', 'f'], '/x').kind).toBe('usage');
    expect(parseArgv(['show', 'unit', '../x'], '/x').kind).toBe('usage');
    expect(parseArgv(['show', 'unit', 'a/b'], '/x').kind).toBe('usage');
    expect(parseArgv(['show', 'persona', 'A'], '/x').kind).toBe('usage');
    expect(parseArgv(['show', 'persona', 'acme:r'], '/x')).toMatchObject({ kind: 'author', name: 'acme:r' });
  });
});

describe('show', () => {
  it('shows a persona as data: fields as written, sections, raw and hash', () => {
    const c = authorCli();
    const r = c.exec('show', 'persona', 'p', '--json');
    expect(r.code).toBe(0);
    const j = r.json();
    expect(j).toMatchObject({ kind: 'persona', name: 'p', canonical: 'p', scope: 'user', plugin: null, path: c.path('home/.claude/personas/p.persona.md'), diagnostics: [] });
    expect(j.raw).toBe(readFileSync(j.path, 'utf8'));
    expect(j.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(j.fields.units).toEqual({ primary: [{ a: { threshold: 'low', add_questions: ['Is a ok?'] } }], secondary: ['b'] });
    expect(j.sections).toEqual({ Stance: 'Careful.', 'Tie-breaking': 'Safety first.' });
  });

  it('shows panel notes under the "" section and unit sections by heading', () => {
    const c = authorCli();
    expect(c.exec('show', 'panel', 'duo', '--json').json()).toMatchObject({ scope: 'project', fields: { personas: ['p', 'q'] }, sections: { '': 'Be brief.' } });
    const u = c.exec('show', 'unit', 'a', '--json').json();
    expect(Object.keys(u.sections)).toEqual(['Looks for', 'Questions', 'Red flags', 'Good looks like']);
    expect(u.fields).toMatchObject({ name: 'a', description: 'Alpha', threshold: 'medium' });
  });

  it('shows the winning file without --scope, and a plugin file with --scope plugin', () => {
    const c = authorCli();
    expect(c.exec('show', 'persona', 'r', '--json').json()).toMatchObject({ scope: 'plugin', plugin: 'acme', canonical: 'acme:r' });
    expect(c.exec('show', 'persona', 'acme:r', '--scope', 'plugin', '--json').json()).toMatchObject({ canonical: 'acme:r' });
    expect(c.exec('show', 'persona', 'p', '--scope', 'project', '--json').code).toBe(1);
  });

  it('gives a stable hash and E_UNKNOWN_REF for an unknown name', () => {
    const c = authorCli();
    expect(c.exec('show', 'unit', 'a', '--json').json().hash).toBe(c.exec('show', 'unit', 'a', '--json').json().hash);
    const r = c.exec('show', 'unit', 'nope', '--json');
    expect(r.code).toBe(1);
    expect(r.json().diagnostics[0]).toMatchObject({ level: 'error', code: 'E_UNKNOWN_REF' });
  });

  it('prints the raw file without --json', () => {
    const c = authorCli();
    const r = c.exec('show', 'unit', 'a');
    expect(r.code).toBe(0);
    expect(r.text).toContain('name: a');
  });
});

describe('show: every shipped file', () => {
  it('round-trips raw text and parses with no errors', () => {
    const repo = fileURLToPath(new URL('../..', import.meta.url));
    const reg = new Registry([{ kind: 'plugin', root: repo, plugin: 'aska' }]);
    for (const kind of ['unit', 'persona', 'panel'] as const) {
      for (const f of reg.all(kind)) {
        const s = showFile(f);
        expect(s.raw, f.path).toBe(readFileSync(f.path, 'utf8'));
        expect(s.diagnostics.filter((d) => d.level === 'error'), f.path).toEqual([]);
        expect(Object.keys(s.sections).length, f.path).toBeGreaterThan(kind === 'panel' ? -1 : 1);
      }
    }
  });
});

describe('save', () => {
  const save = (c: ReturnType<typeof authorCli>, kind: string, name: string, scope: string, content: string, ...extra: string[]) =>
    c.exec('save', kind, name, '--scope', scope, '--file', c.input(`in-${name}.md`, content), '--json', ...extra);

  it('writes a valid new file and returns its hash', () => {
    const c = authorCli();
    const content = unitMd('d', { description: 'Delta' });
    const r = save(c, 'unit', 'd', 'user', content);
    expect(r.code).toBe(0);
    const p = c.path('home/.claude/personas/d.unit.md');
    expect(r.json()).toMatchObject({ written: true, path: p, hash: createHash('sha256').update(content).digest('hex') });
    expect(readFileSync(p, 'utf8')).toBe(content);
  });

  it('refuses a persona citing an unknown unit and leaves the file untouched', () => {
    const c = authorCli();
    const p = c.path('home/.claude/personas/p.persona.md');
    const before = readFileSync(p, 'utf8');
    const r = save(c, 'persona', 'p', 'user', personaMd(['name: p', 'description: P.', 'units:', '  primary: [nope]']));
    expect(r.code).toBe(1);
    expect(r.json().written).toBe(false);
    expect(r.json().diagnostics.some((d: { code: string }) => d.code === 'E_UNKNOWN_REF')).toBe(true);
    expect(readFileSync(p, 'utf8')).toBe(before);
  });

  it('refuses a unit change that breaks it, and keeps the old file', () => {
    const c = authorCli();
    const p = c.path('home/.claude/personas/a.unit.md');
    const before = readFileSync(p, 'utf8');
    expect(save(c, 'unit', 'a', 'user', unitMd('a', { threshold: 'severe' })).code).toBe(1);
    expect(readFileSync(p, 'utf8')).toBe(before);
  });

  it('refuses a file whose name does not match', () => {
    const c = authorCli();
    const r = save(c, 'unit', 'd', 'user', unitMd('e'));
    expect(r.code).toBe(1);
    expect(r.json().diagnostics[0]).toMatchObject({ code: 'E_NAME_MISMATCH', line: 2 });
    expect(existsSync(c.path('home/.claude/personas/d.unit.md'))).toBe(false);
  });

  it('pins E_NAME_MISMATCH to the actual line of the name field, not always line 2', () => {
    const c = authorCli();
    const content = personaMd(['description: Q.', 'name: q', 'units:', '  primary: [a]']);
    const r = save(c, 'persona', 'p', 'user', content);
    expect(r.code).toBe(1);
    expect(r.json().diagnostics[0]).toMatchObject({ code: 'E_NAME_MISMATCH', line: 3 });
  });

  it('refuses with E_STALE when the file changed, or exists when "none" was expected', () => {
    const c = authorCli();
    const hash = c.exec('show', 'unit', 'a', '--json').json().hash;
    writeFileSync(c.path('home/.claude/personas/a.unit.md'), unitMd('a', { description: 'Changed elsewhere' }));
    expect(save(c, 'unit', 'a', 'user', unitMd('a'), '--expect-hash', hash).json().diagnostics[0].code).toBe('E_STALE');
    expect(save(c, 'unit', 'a', 'user', unitMd('a'), '--expect-hash', 'none').json().diagnostics[0].code).toBe('E_STALE');
  });

  it('returns warnings and still writes', () => {
    const c = authorCli();
    const r = save(c, 'persona', 'p', 'user', personaMd(['name: p', 'description: P.', 'colour: blue', 'units:', '  primary: [a]']));
    expect(r.code).toBe(0);
    expect(r.json().diagnostics.some((d: { code: string }) => d.code === 'W_UNKNOWN_FIELD')).toBe(true);
  });

  it('creates the user personas folder when it does not exist yet', () => {
    const c = authorCli({ 'project/units/a.md': unitMd('a') });
    expect(save(c, 'unit', 'z', 'user', unitMd('z')).code).toBe(0);
    expect(existsSync(c.path('home/.claude/personas/z.unit.md'))).toBe(true);
  });

  it('creates <git root>/.claude/personas for --scope project when the project has no .claude yet', () => {
    const c = authorCli({ 'user/units/a.md': unitMd('a') });
    expect(save(c, 'unit', 'z', 'project', unitMd('z')).code).toBe(0);
    expect(existsSync(c.path('proj/.claude/personas/z.unit.md'))).toBe(true);
  });

  it('gives E_NO_SCOPE for --scope project outside any project', () => {
    const c = authorCli();
    const f = c.input('outside.md', unitMd('z'));
    const r = c.execIn(c.root, 'save', 'unit', 'z', '--scope', 'project', '--file', f, '--json');
    expect(r.code).toBe(1);
    expect(r.json().diagnostics[0].code).toBe('E_NO_SCOPE');
  });

  it('refuses a parent edit that breaks a child\'s primary_order, located in the child\'s file', () => {
    const c = authorCli({
      ...authorFiles(),
      'user/personas/child.md': personaMd(['name: child', 'extends: p', 'units:', '  primary_order: [a]']),
    });
    const p = c.path('home/.claude/personas/p.persona.md');
    const before = readFileSync(p, 'utf8');
    const r = save(c, 'persona', 'p', 'user', personaMd(['name: p', 'description: P.', 'units:', '  primary: [b]', '  secondary: [a]']));
    expect(r.code).toBe(1);
    expect(r.json().written).toBe(false);
    expect(r.json().diagnostics).toContainEqual(expect.objectContaining({ code: 'E_PRIMARY_ORDER', file: c.path('home/.claude/personas/child.persona.md') }));
    expect(readFileSync(p, 'utf8')).toBe(before);
  });

  it('parses save and rejects missing scope, plugin scope and missing file', () => {
    expect(parseArgv(['save', 'unit', 'a', '--scope', 'user', '--file', 'f', '--expect-hash', 'none'], '/x')).toMatchObject({ kind: 'author', command: 'save', file: '/x/f', expectHash: 'none' });
    expect(parseArgv(['save', 'unit', 'a', '--file', 'f'], '/x').kind).toBe('usage');
    expect(parseArgv(['save', 'unit', 'a', '--scope', 'plugin', '--file', 'f'], '/x').kind).toBe('usage');
    expect(parseArgv(['save', 'unit', 'a', '--scope', 'user'], '/x').kind).toBe('usage');
  });
});

describe('save: symlinked targets', () => {
  const save = (c: ReturnType<typeof authorCli>, kind: string, name: string, scope: string, content: string, ...extra: string[]) =>
    c.exec('save', kind, name, '--scope', scope, '--file', c.input(`in-${name}.md`, content), '--json', ...extra);

  // Moves the real file for an existing link path aside and replaces it with a symlink to that
  // real file, simulating a dotfiles setup (GNU stow, home-manager, chezmoi symlink mode).
  const linkify = (link: string, relativeLink: boolean): string => {
    const real = join(dirname(link), '..', 'dot', basename(link));
    mkdirSync(dirname(real), { recursive: true });
    renameSync(link, real);
    symlinkSync(relativeLink ? relative(dirname(link), real) : real, link);
    return real;
  };

  it('refuses a project-scope save through a symlink that leaves the project, and allows one inside it', () => {
    const c = authorCli();
    const userUnit = c.path('home/.claude/personas/a.unit.md');
    const before = readFileSync(userUnit, 'utf8');
    const planted = c.path('proj/.claude/personas/z.unit.md');
    mkdirSync(dirname(planted), { recursive: true });
    symlinkSync(userUnit, planted);
    const r = save(c, 'unit', 'z', 'project', unitMd('z'));
    expect(r.code).toBe(1);
    expect(r.json()).toMatchObject({ written: false, diagnostics: [{ code: 'E_WRITE_SYMLINK' }] });
    expect(readFileSync(userUnit, 'utf8')).toBe(before);

    const inside = c.path('proj/shared/y.unit.md');
    mkdirSync(dirname(inside), { recursive: true });
    writeFileSync(inside, unitMd('y'));
    symlinkSync(inside, c.path('proj/.claude/personas/y.unit.md'));
    expect(save(c, 'unit', 'y', 'project', unitMd('y', { description: 'Kept inside.' })).json().written).toBe(true);
    expect(readFileSync(inside, 'utf8')).toContain('Kept inside.');
  });

  it('leaves the real file byte-identical when a save through an absolute symlink is refused', () => {
    const c = authorCli();
    const link = c.path('home/.claude/personas/a.unit.md');
    const before = readFileSync(link, 'utf8');
    const real = linkify(link, false);
    const r = save(c, 'unit', 'a', 'user', unitMd('a', { threshold: 'severe' }));
    expect(r.code).toBe(1);
    expect(r.json().written).toBe(false);
    expect(readFileSync(real, 'utf8')).toBe(before);
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
  });

  it('keeps the link and updates the linked file on a successful save', () => {
    const c = authorCli();
    const link = c.path('home/.claude/personas/a.unit.md');
    const real = linkify(link, false);
    const content = unitMd('a', { description: 'Updated' });
    const r = save(c, 'unit', 'a', 'user', content);
    expect(r.code).toBe(0);
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readFileSync(real, 'utf8')).toBe(content);
    expect(readFileSync(link, 'utf8')).toBe(content);
  });

  it('works with a relative file symlink', () => {
    const c = authorCli();
    const link = c.path('home/.claude/personas/a.unit.md');
    const real = linkify(link, true);
    const content = unitMd('a', { description: 'Relative' });
    const r = save(c, 'unit', 'a', 'user', content);
    expect(r.code).toBe(0);
    expect(readFileSync(real, 'utf8')).toBe(content);
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
  });

  it('works for save and delete when personas/ itself is a symlinked folder', () => {
    const c = authorCli();
    const personasDir = c.path('home/.claude/personas');
    const realDir = c.path('dot-personas');
    renameSync(personasDir, realDir);
    symlinkSync(realDir, personasDir);
    const content = unitMd('z', { description: 'New' });
    const r = save(c, 'unit', 'z', 'user', content);
    expect(r.code).toBe(0);
    expect(readFileSync(join(realDir, 'z.unit.md'), 'utf8')).toBe(content);
    const del = c.exec('delete', 'unit', 'z', '--scope', 'user', '--json');
    expect(del.code).toBe(0);
    expect(existsSync(join(realDir, 'z.unit.md'))).toBe(false);
  });
});

describe('save: filesystem errors', () => {
  it('reports E_WRITE instead of crashing when the personas dir is read-only', () => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) return;
    const c = authorCli();
    const dir = c.path('home/.claude/personas');
    chmodSync(dir, 0o555);
    try {
      const r = c.exec('save', 'unit', 'z', '--scope', 'user', '--file', c.input('in-z.md', unitMd('z')), '--json');
      expect(r.code).toBe(1);
      expect(r.json().written).toBe(false);
      expect(r.json().diagnostics[0].code).toBe('E_WRITE');
    } finally {
      chmodSync(dir, 0o755);
    }
  });
});

describe('patch', () => {
  const patch = (c: ReturnType<typeof authorCli>, kind: string, name: string, scope: string, body: unknown, ...extra: string[]) =>
    c.exec('patch', kind, name, '--scope', scope, '--file', c.input(`patch-${name}.json`, JSON.stringify(body)), '--json', ...extra);

  it('patches a file in place, keeping its comment', () => {
    const c = authorCli();
    const hash = c.exec('show', 'persona', 'p', '--json').json().hash;
    const r = patch(c, 'persona', 'p', 'user', { set: { description: 'Patched.' } }, '--expect-hash', hash);
    expect(r.code).toBe(0);
    const raw = readFileSync(c.path('home/.claude/personas/p.persona.md'), 'utf8');
    expect(raw).toContain('# the p persona');
    expect(raw).toContain('description: Patched.');
  });

  it('refuses with E_STALE when the file was deleted after show', () => {
    const c = authorCli();
    const hash = c.exec('show', 'unit', 'u', '--json').json().hash;
    rmSync(c.path('home/.claude/personas/u.unit.md'));
    const r = patch(c, 'unit', 'u', 'user', { set: { description: 'X' } }, '--expect-hash', hash);
    expect(r.code).toBe(1);
    expect(r.json().diagnostics[0].code).toBe('E_STALE');
    expect(existsSync(c.path('home/.claude/personas/u.unit.md'))).toBe(false);
  });

  it('creates a panel, and refuses an incomplete one', () => {
    const c = authorCli();
    expect(patch(c, 'panel', 'trio', 'project', { set: { description: 'T.', personas: ['p', 'q'] } }, '--expect-hash', 'none').code).toBe(0);
    const r = patch(c, 'panel', 'solo', 'project', { set: { description: 'S.', personas: ['p'] } }, '--expect-hash', 'none');
    expect(r.code).toBe(1);
    expect(r.json().diagnostics.some((d: { code: string }) => d.code === 'E_PANEL_SIZE')).toBe(true);
    expect(existsSync(c.path('proj/.claude/personas/solo.panel.md'))).toBe(false);
  });

  it('creates a user child of a plugin persona that validates', () => {
    const c = authorCli();
    const r = patch(c, 'persona', 'r', 'user', { set: { extends: 'acme:r' } }, '--expect-hash', 'none');
    expect(r.code).toBe(0);
    expect(c.exec('validate', 'r').code).toBe(0);
  });

  it('is a usage error for a bad patch file or an unowned path', () => {
    const c = authorCli();
    const bad = c.input('bad.json', '{ not json');
    expect(c.exec('patch', 'unit', 'a', '--scope', 'user', '--file', bad).code).toBe(2);
    expect(patch(c, 'persona', 'p', 'user', { set: { overrides: {} } }).code).toBe(2);
  });

  it('refuses with a file-fault diagnostic (not a usage error or a crash) when the existing file is broken, and leaves it untouched', () => {
    const c = authorCli();
    const p = c.path('home/.claude/personas/p.persona.md');
    writeFileSync(p, personaMd(['name: p', 'description: P.', 'units: a']));
    const before = readFileSync(p, 'utf8');
    const r = patch(c, 'persona', 'p', 'user', { set: { 'units.primary': [{ ref: 'a' }] } });
    expect(r.code).toBe(1);
    expect(r.json().diagnostics[0].code).toBe('E_FIELD_TYPE');
    expect(readFileSync(p, 'utf8')).toBe(before);
  });

  it('reaches W_DROPPED_SETTINGS in the output diagnostics through --json while the file is written', () => {
    const c = authorCli();
    const r = patch(c, 'persona', 'p', 'user', { set: { 'units.primary': [{ ref: 'b' }], 'units.secondary': [{ ref: 'a', threshold: 'high' }] } });
    expect(r.code).toBe(0);
    expect(r.json().written).toBe(true);
    expect(r.json().diagnostics.some((d: { code: string }) => d.code === 'W_DROPPED_SETTINGS')).toBe(true);
  });
});

describe('delete', () => {
  it('refuses when a panel seats the persona, listing it, and deletes with --force', () => {
    const c = authorCli();
    const p = c.path('home/.claude/personas/q.persona.md');
    const r = c.exec('delete', 'persona', 'q', '--scope', 'user', '--json');
    expect(r.code).toBe(1);
    expect(r.json()).toMatchObject({ deleted: false, dependents: [{ kind: 'panel', name: 'duo', path: c.path('proj/.claude/personas/duo.panel.md') }] });
    expect(existsSync(p)).toBe(true);
    const f = c.exec('delete', 'persona', 'q', '--scope', 'user', '--force', '--json');
    expect(f.code).toBe(0);
    expect(f.json().deleted).toBe(true);
    expect(existsSync(p)).toBe(false);
  });

  it('lists the persona that uses a unit', () => {
    const c = authorCli();
    const r = c.exec('delete', 'unit', 'a', '--scope', 'user', '--json');
    expect(r.code).toBe(1);
    expect(r.json().dependents.map((x: { kind: string; name: string }) => [x.kind, x.name])).toContainEqual(['persona', 'p']);
  });

  it('lists a user child persona that extends the deleted persona', () => {
    const c = authorCli({
      ...authorFiles(),
      'user/personas/kid.md': personaMd(['name: kid', 'extends: p']),
    });
    const r = c.exec('delete', 'persona', 'p', '--scope', 'user', '--json');
    expect(r.code).toBe(1);
    expect(r.json().dependents).toContainEqual(expect.objectContaining({ kind: 'persona', name: 'kid' }));
  });

  it('deletes a file nothing depends on', () => {
    const c = authorCli();
    const r = c.exec('delete', 'unit', 'u', '--scope', 'user', '--json');
    expect(r.code).toBe(0);
    expect(r.json()).toMatchObject({ deleted: true, dependents: [] });
  });

  it('gives E_UNKNOWN_REF for a file that is not in that scope', () => {
    const c = authorCli();
    const r = c.exec('delete', 'persona', 'p', '--scope', 'project', '--json');
    expect(r.code).toBe(1);
    expect(r.json().diagnostics[0].code).toBe('E_UNKNOWN_REF');
  });

  it('lists --expect-hash for delete in --help', () => {
    expect(authorCli().exec('--help').text).toContain('delete <kind> <name> --scope project|user [--force] [--expect-hash h] [--json]');
  });

  it('parses delete, takes --expect-hash but not "none", and rejects --file', () => {
    expect(parseArgv(['delete', 'unit', 'a', '--scope', 'user', '--force'], '/x')).toMatchObject({ kind: 'author', command: 'delete', force: true });
    expect(parseArgv(['delete', 'unit', 'a', '--scope', 'user', '--file', 'f'], '/x').kind).toBe('usage');
    expect(parseArgv(['delete', 'unit', 'a', '--scope', 'user', '--expect-hash', 'h'], '/x')).toMatchObject({ kind: 'author', command: 'delete', expectHash: 'h' });
    expect(parseArgv(['delete', 'unit', 'a', '--scope', 'user', '--expect-hash', 'none'], '/x').kind).toBe('usage');
  });

  it('deletes with a matching --expect-hash, and refuses with E_STALE when the file changed since show', () => {
    const c = authorCli();
    const hash = c.exec('show', 'unit', 'u', '--json').json().hash;
    const path = c.path('home/.claude/personas/u.unit.md');
    const before = readFileSync(path, 'utf8');
    writeFileSync(path, `${before}\n`);
    const r = c.exec('delete', 'unit', 'u', '--scope', 'user', '--expect-hash', hash, '--json');
    expect(r.code).toBe(1);
    expect(r.json()).toMatchObject({ deleted: false, diagnostics: [{ code: 'E_STALE' }] });
    expect(existsSync(path)).toBe(true);
    const fresh = c.exec('show', 'unit', 'u', '--json').json().hash;
    expect(c.exec('delete', 'unit', 'u', '--scope', 'user', '--expect-hash', fresh, '--json').json().deleted).toBe(true);
    expect(existsSync(path)).toBe(false);
  });
});
