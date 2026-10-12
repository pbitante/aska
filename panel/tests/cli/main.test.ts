import { accessSync, constants, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgv, run } from '../../src/cli/main';
import { exampleFiles } from '../helpers/example';
import { panelMd, personaMd, unitMd } from '../helpers/md';
import { registryFor } from '../helpers/scopes';
import { makeTree } from '../helpers/tree';

function canDenyReadAccess(): boolean {
  const dir = mkdtempSync(join(tmpdir(), 'perm-check-'));
  const f = join(dir, 'f');
  writeFileSync(f, 'x');
  chmodSync(f, 0o000);
  let denied = false;
  try {
    accessSync(f, constants.R_OK);
  } catch {
    denied = true;
  }
  rmSync(dir, { recursive: true, force: true });
  return denied;
}
const canRestrictPermissions = canDenyReadAccess();

function canDenyWriteAccess(): boolean {
  const dir = mkdtempSync(join(tmpdir(), 'write-perm-check-'));
  chmodSync(dir, 0o500);
  let denied = false;
  try {
    writeFileSync(join(dir, 'f'), 'x');
  } catch {
    denied = true;
  }
  chmodSync(dir, 0o700);
  rmSync(dir, { recursive: true, force: true });
  return denied;
}
const canRestrictWriteAccess = canDenyWriteAccess();

function cli(files: Record<string, string>, opts: { plugins?: boolean } = {}) {
  const { root } = registryFor(files);
  const pluginListJson = opts.plugins === false
    ? undefined
    : JSON.stringify([{ id: 'acme@m', enabled: true, installPath: join(root, 'plugins/acme') }]);
  return {
    root,
    exec(...argv: string[]) {
      const out: string[] = [];
      const code = run(argv, { cwd: join(root, 'proj'), home: join(root, 'home'), pluginListJson, out: (s) => out.push(s) });
      return { code, text: out.join('\n') };
    },
  };
}

describe('persona CLI', () => {
  it('prints usage and rejects bad invocations', () => {
    const c = cli(exampleFiles());
    expect(c.exec('--help')).toMatchObject({ code: 0, text: expect.stringContaining('usage: persona') });
    expect(c.exec('frobnicate').code).toBe(2);
    expect(c.exec('explain').code).toBe(2);
    expect(c.exec('render', 'example', '--scope').code).toBe(2);
    expect(c.exec('render', 'example', '--scope', 'plugin').code).toBe(2);
    expect(c.exec('validate', '--nope').code).toBe(2);
  });

  it('lists prompt, check-judgment and compare in the usage text', () => {
    const r = cli(exampleFiles()).exec('--help');
    expect(r.text).toContain('prompt <name> --panel');
    expect(r.text).toContain('check-judgment <name>');
    expect(r.text).toContain('compare');
  });

  it('rejects a --cwd that does not exist, instead of silently finding no personas', () => {
    const r = cli(exampleFiles()).exec('validate', '--cwd', '/no/such/directory/for/persona-tests');
    expect(r.code).toBe(2);
    expect(r.text).toContain('/no/such/directory/for/persona-tests');
    expect(r.text).toContain('usage: persona');
  });

  it('rejects --scope on validate and explain', () => {
    const c = cli(exampleFiles());
    const v = c.exec('validate', '--scope', 'user');
    expect(v.code).toBe(2);
    expect(v.text).toContain('usage: persona');
    const e = c.exec('explain', 'example', '--scope', 'user');
    expect(e.code).toBe(2);
    expect(e.text).toContain('usage: persona');
  });

  it('rejects a repeated --scope', () => {
    const r = cli(exampleFiles()).exec('render', 'example', '--scope', 'project', '--scope', 'user');
    expect(r.code).toBe(2);
    expect(r.text).toContain('usage: persona');
  });

  it('validates everything and summarizes', () => {
    const r = cli(exampleFiles()).exec('validate');
    expect(r.code).toBe(0);
    expect(r.text).toContain('example: ok');
    expect(r.text).toContain('base: ok');
    expect(r.text).toContain('[child] scope-creep.excluded');
    expect(r.text).toContain('0 errors, 0 warnings');
  });

  it('fails validation on a broken unit nobody uses', () => {
    const r = cli({ ...exampleFiles(), 'user/units/broken.md': unitMd('broken', { threshold: 'severe' }) }).exec('validate');
    expect(r.code).toBe(1);
    expect(r.text).toContain('E_SEVERITY');
    expect(r.text).toContain('broken.unit.md');
  });

  it('fails validation of an unknown persona', () => {
    const r = cli(exampleFiles()).exec('validate', 'nobody');
    expect(r.code).toBe(1);
    expect(r.text).toContain('E_UNKNOWN_REF');
  });

  it('validate <name> prints a panel\'s own diagnostics instead of "unknown persona" when name is a panel', () => {
    const r = cli({ ...exampleFiles(), 'project/panels/release.md': panelMd('release', ['example', 'nobody']) }).exec('validate', 'release');
    expect(r.code).toBe(1);
    expect(r.text).toContain('release (panel): failed');
    expect(r.text).toContain('E_PANEL_PERSONA');
    expect(r.text).not.toContain('E_UNKNOWN_REF');
    expect(r.text).not.toContain('unknown persona');
  });

  it('validate <name> reports a valid panel as ok', () => {
    const r = cli({ ...exampleFiles(), 'project/panels/release.md': panelMd('release', ['example', 'base']) }).exec('validate', 'release');
    expect(r.code).toBe(0);
    expect(r.text).toContain('release (panel): ok');
  });

  it('validate checks panel files', () => {
    const r = cli({ ...exampleFiles(), 'project/panels/release.md': panelMd('release', ['example', 'nobody']) }).exec('validate');
    expect(r.code).toBe(1);
    expect(r.text).toContain('release (panel): failed');
    expect(r.text).toContain('E_PANEL_PERSONA');
  });

  it('validate checks every panel file, including a valid one', () => {
    const r = cli({
      ...exampleFiles(),
      'project/panels/release.md': panelMd('release', ['example', 'base']),
      'project/panels/broken.md': panelMd('broken', ['example', 'nobody']),
    }).exec('validate');
    expect(r.code).toBe(1);
    expect(r.text).toContain('release (panel): ok');
    expect(r.text).toContain('broken (panel): failed');
    expect(r.text).toContain('E_PANEL_PERSONA');
  });

  it('labels a shadowed panel with its scope, like personas', () => {
    const r = cli({
      ...exampleFiles(),
      'project/panels/release.md': panelMd('release', ['example', 'base']),
      'user/panels/release.md': panelMd('release', ['base', 'nobody']),
    }).exec('validate');
    expect(r.code).toBe(1);
    expect(r.text).toContain('release (panel, project): ok');
    expect(r.text).toContain('release (panel, user): failed');
  });

  it('returns 1 when one persona fails and others pass', () => {
    const files = {
      ...exampleFiles(),
      'project/personas/bad.md': personaMd(['name: bad', 'description: Bad.', 'units:', '  primary: [nosuch]']),
    };
    const r = cli(files).exec('validate');
    expect(r.code).toBe(1);
    expect(r.text).toContain('bad: failed');
    expect(r.text).toContain('example: ok');
  });

  it('checks a persona file that a more specific scope shadows, labelling both lines with their scope', () => {
    const files = {
      'user/units/a.md': unitMd('a'),
      'user/personas/solo.md': personaMd(['name: solo', 'description: Bad.', 'units:', '  primary: [nosuch]']),
      'project/personas/solo.md': personaMd(['name: solo', 'description: Good.', 'units:', '  primary: [a]']),
    };
    const r = cli(files).exec('validate');
    expect(r.code).toBe(1);
    expect(r.text).toContain('solo (project): ok');
    expect(r.text).toContain('solo (user): failed');
    expect(r.text).toContain('E_UNKNOWN_REF');
    expect(r.text.split('\n').filter((l) => l.startsWith('solo'))).toHaveLength(2);
  });

  it('checks an unshadowed user persona through the full registry, so its project-scope units still resolve', () => {
    const files = {
      'project/units/p.md': unitMd('p'),
      'user/personas/u.md': personaMd(['name: u', 'description: U.', 'units:', '  primary: [p]']),
    };
    const r = cli(files).exec('validate');
    expect(r.code).toBe(0);
    expect(r.text).toContain('u: ok');
    expect(r.text).toContain('0 errors, 0 warnings');
  });

  it('de-duplicates diagnostics reached through several personas', () => {
    const files = { ...exampleFiles(), 'user/units/edge-cases.md': unitMd('edge-cases', { threshold: 'severe' }) };
    const r = cli(files).exec('validate');
    expect(r.text.split('\n').filter((l) => l.startsWith('error E_SEVERITY'))).toHaveLength(1);
  });

  it('explains a persona', () => {
    const c = cli(exampleFiles());
    const r = c.exec('explain', 'example');
    expect(r.code).toBe(0);
    expect(r.text).toContain('== example (');
    expect(r.text).toContain('primary:       1. edge-cases (medium)  2. rollback-safety (low)');
    expect(r.text).toContain('secondary:     maintainability (low), acme:cost (high)');
    expect(r.text).toContain('deprioritized: code-style (critical)');
    expect(r.text).toContain('capabilities:  skill superpowers:test-driven-development, mcp playwright');
    expect(r.text).toContain('panel tools:   Read, Grep, Glob, Skill, mcp__playwright, Bash');
    expect(r.text).toContain('inputs:');
    expect(r.text).toContain(`  ${join(c.root, 'proj/.claude/personas/example.persona.md')}`);
    expect(r.text).toContain('== Clash report ==');
    expect(r.text).toContain('# Persona: example');
  });

  it('renders into the project scope and detects staleness later', () => {
    const c = cli(exampleFiles());
    const r = c.exec('render', 'example');
    expect(r.code).toBe(0);
    const style = join(c.root, 'proj/.claude/output-styles/example.persona.md');
    expect(existsSync(style)).toBe(true);
    expect(existsSync(join(c.root, 'proj/.claude/agents/example.persona.md'))).toBe(true);
    expect(r.text).toContain(`wrote ${style}`);
    expect(r.text).toContain('Restart Claude Code');
    expect(c.exec('validate').text).not.toContain('W_STALE_RENDER');

    const source = join(c.root, 'proj/.claude/personas/example.persona.md');
    writeFileSync(source, readFileSync(source, 'utf8').replace('Skeptical', 'Wary'));
    expect(c.exec('validate').text).toContain('W_STALE_RENDER');
  });

  it('reports a stale render on `validate <name>`, filtered to that persona', () => {
    const c = cli(exampleFiles());
    expect(c.exec('render', 'example').code).toBe(0);
    expect(c.exec('validate', 'example').text).not.toContain('W_STALE_RENDER');

    const source = join(c.root, 'proj/.claude/personas/example.persona.md');
    writeFileSync(source, readFileSync(source, 'utf8').replace('Skeptical', 'Wary'));

    const r = c.exec('validate', 'example');
    expect(r.text).toContain('W_STALE_RENDER');
    expect(r.text).toContain('out of date');

    // `base` has no generated file of its own, so checking it reports no staleness at all,
    // even though `example`'s render is now stale.
    expect(c.exec('validate', 'base').text).not.toContain('W_STALE_RENDER');
  });

  (canRestrictWriteAccess ? it : it.skip)('reports E_WRITE instead of crashing when render cannot write to the target directory', () => {
    const c = cli(exampleFiles());
    const blockedDir = join(c.root, 'proj/.claude/output-styles');
    mkdirSync(blockedDir, { recursive: true });
    chmodSync(blockedDir, 0o500);
    try {
      const r = c.exec('render', 'example');
      expect(r.code).toBe(1);
      expect(r.text).toContain('E_WRITE');
    } finally {
      chmodSync(blockedDir, 0o700);
    }
  });

  it('refuses a less specific render scope', () => {
    const r = cli(exampleFiles()).exec('render', 'example', '--scope', 'user');
    expect(r.code).toBe(1);
    expect(r.text).toContain('E_RENDER_SCOPE');
  });

  it('prints the activation line instead of per-clash warnings on render', () => {
    const files = exampleFiles();
    files['project/personas/example.md'] = files['project/personas/example.md']!.replace(
      'overrides:\n  scope-creep.excluded: child\n  stance: child\n  tie-breaking: child\n',
      '',
    );
    const r = cli(files).exec('render', 'example');
    expect(r.code).toBe(0);
    expect(r.text).toContain('example: 3 unreviewed overrides — run persona explain example');
    expect(r.text).not.toContain('W_UNREVIEWED');
  });

  it('renders without the W_STALE_OVERRIDE diagnostic that validate would show', () => {
    const files = {
      'user/units/a.md': unitMd('a'),
      'user/personas/base2.md': personaMd(['name: base2', 'description: Base.', 'units:', '  primary: [a]']),
      'user/personas/solo.md': personaMd([
        'name: solo', 'description: Solo.', 'extends: base2', 'units:', '  primary: [a]', 'overrides:', '  stance: child',
      ]),
    };
    const c = cli(files);
    expect(c.exec('validate').text).toContain('W_STALE_OVERRIDE');
    const r = c.exec('render', 'solo', '--scope', 'user');
    expect(r.code).toBe(0);
    expect(r.text).not.toContain('W_STALE_OVERRIDE');
  });

  it('keeps working without the plugin list', () => {
    const files = {
      'user/units/a.md': unitMd('a'),
      'user/personas/solo.md': personaMd(['name: solo', 'description: Solo.', 'units:', '  primary: [a]']),
    };
    const r = cli(files, { plugins: false }).exec('validate');
    expect(r.code).toBe(0);
    expect(r.text).toContain('W_PLUGIN_LIST');
    expect(r.text).toContain('solo: ok');
  });

  it('does not mark a user-scope render stale when a project persona later shadows its name', () => {
    const c = cli({
      'user/units/a.md': unitMd('a'),
      'user/personas/solo.md': personaMd(['name: solo', 'description: Solo.', 'units:', '  primary: [a]']),
    });
    expect(c.exec('render', 'solo', '--scope', 'user').code).toBe(0);

    const shadow = join(c.root, 'proj/.claude/personas/solo.persona.md');
    mkdirSync(dirname(shadow), { recursive: true });
    writeFileSync(shadow, personaMd(['name: solo', 'description: Project solo.', 'units:', '  primary: [a]']));

    expect(c.exec('validate').text).not.toContain('W_STALE_RENDER');
  });

  it('tells a stale user-scope render shadowed by a project persona to re-render from outside the project', () => {
    const c = cli({
      'user/units/a.md': unitMd('a'),
      'user/personas/rev.md': personaMd(['name: rev', 'description: Rev.', 'units:', '  primary: [a]']),
    });
    expect(c.exec('render', 'rev', '--scope', 'user').code).toBe(0);

    const userSource = join(c.root, 'home/.claude/personas/rev.persona.md');
    writeFileSync(userSource, readFileSync(userSource, 'utf8').replace('Rev.', 'Rev, edited.'));

    const shadow = join(c.root, 'proj/.claude/personas/rev.persona.md');
    mkdirSync(dirname(shadow), { recursive: true });
    writeFileSync(shadow, personaMd(['name: rev', 'description: Project rev.', 'units:', '  primary: [a]']));

    const r = c.exec('validate');
    expect(r.text).toContain('W_STALE_RENDER');
    expect(r.text).toContain('out of date');
    expect(r.text).toContain('Run: persona render rev from outside this project');
  });

  it('refuses to render into the project scope once it has been dropped as same as the user scope', () => {
    const root = makeTree({
      'home/.git/HEAD': '',
      'home/.claude/personas/a.unit.md': unitMd('a'),
      'home/.claude/personas/solo.persona.md': personaMd(['name: solo', 'description: Solo.', 'units:', '  primary: [a]']),
      'home/proj/.keep': '',
    });
    const out: string[] = [];
    const code = run(['render', 'solo', '--scope', 'project'], {
      cwd: join(root, 'home/proj'),
      home: join(root, 'home'),
      pluginListJson: '[]',
      out: (s) => out.push(s),
    });
    expect(code).toBe(1);
    expect(out.join('\n')).toContain('E_RENDER_SCOPE');
    expect(existsSync(join(root, 'home/.claude/output-styles/solo.persona.md'))).toBe(false);
  });

  it('refuses to render into the project scope when the dropped .claude lives below the git root (reviewer repro)', () => {
    const root = makeTree({
      'repo/.git/HEAD': '',
      'repo/sub/.claude/personas/a.unit.md': unitMd('a'),
      'repo/sub/.claude/personas/solo.persona.md': personaMd(['name: solo', 'description: Solo.', 'units:', '  primary: [a]']),
      'repo/sub/deeper/.keep': '',
    });
    const out: string[] = [];
    const code = run(['render', 'solo', '--scope', 'project'], {
      cwd: join(root, 'repo/sub/deeper'),
      home: join(root, 'repo/sub'),
      pluginListJson: '[]',
      out: (s) => out.push(s),
    });
    expect(code).toBe(1);
    expect(out.join('\n')).toContain('E_RENDER_SCOPE');
    // Neither the bogus fallback (project.base/.claude, which is not a registered scope at all)
    // nor the real user scope should receive any files.
    expect(existsSync(join(root, 'repo/.claude'))).toBe(false);
    expect(existsSync(join(root, 'repo/sub/.claude/output-styles'))).toBe(false);
  });

  it('does not check a bogus fallback project directory for stale renders once the project scope is dropped', () => {
    const root = makeTree({
      'repo/.git/HEAD': '',
      'repo/sub/.claude/personas/a.unit.md': unitMd('a'),
      'repo/sub/.claude/personas/solo.persona.md': personaMd(['name: solo', 'description: Solo.', 'units:', '  primary: [a]']),
      'repo/sub/deeper/.keep': '',
    });
    // A stray generated-looking file at the bogus fallback location (project.base/.claude) that
    // would, if ever inspected, report a stale render for a persona that doesn't exist.
    const ghost = join(root, 'repo/.claude/output-styles/ghost.persona.md');
    mkdirSync(dirname(ghost), { recursive: true });
    writeFileSync(ghost, [
      '---',
      '# Generated by claude-personas. Do not edit; edit the source persona and run `persona render`.',
      '# source: user/ghost.persona.md',
      '# persona: ghost',
      '# hash: sha256:deadbeef',
      '---',
      '',
      'stale leftover',
      '',
    ].join('\n'));

    const out: string[] = [];
    const code = run(['validate'], {
      cwd: join(root, 'repo/sub/deeper'),
      home: join(root, 'repo/sub'),
      pluginListJson: '[]',
      out: (s) => out.push(s),
    });
    expect(code).toBe(0);
    const text = out.join('\n');
    expect(text).not.toContain('W_STALE_RENDER');
    expect(text).not.toContain('ghost');
  });

  (canRestrictPermissions ? it : it.skip)('reports a diagnostic instead of crashing on an unreadable unit', () => {
    const files = { ...exampleFiles(), 'user/units/secret.md': unitMd('secret') };
    const c = cli(files);
    const path = join(c.root, 'home/.claude/personas/secret.unit.md');
    chmodSync(path, 0o000);
    try {
      const r = c.exec('validate');
      expect(r.code).toBe(1);
      expect(r.text).toContain('E_READ');
      expect(r.text).toContain('secret.unit.md');
    } finally {
      chmodSync(path, 0o644);
    }
  });

  it('ignores, rather than crashing on, a stray directory where a generated file is expected', () => {
    const c = cli(exampleFiles());
    expect(c.exec('render', 'example').code).toBe(0);
    const bogus = join(c.root, 'proj/.claude/output-styles/x.persona.md');
    mkdirSync(bogus, { recursive: true });
    const r = c.exec('validate');
    expect(r.code).toBe(0);
    expect(r.text).not.toContain('E_READ');
    expect(r.text).not.toContain('x.persona.md');
  });

  it('validate reports untyped files as a warning, not an error', () => {
    const c = cli({ ...exampleFiles(), 'user/raw/notes.md': 'x' });
    const r = c.exec('validate');
    expect(r.code).toBe(0);
    expect(r.text).toContain('W_UNTYPED_FILE');
  });

  it('validate <name> also reports untyped files as a warning, not an error', () => {
    const c = cli({ ...exampleFiles(), 'user/raw/notes.md': 'x' });
    const r = c.exec('validate', 'example');
    expect(r.code).toBe(0);
    expect(r.text).toContain('W_UNTYPED_FILE');
  });

  it('validate finds nothing in an old-layout-only scope', () => {
    const r = cli({ 'project/raw/personas/old.md': 'x', 'project/raw/units/old.md': unitMd('old') }, { plugins: false }).exec('validate');
    expect(r.text).toContain('no personas found');
  });

  it('resolves units from its own plugin root without the plugin list', () => {
    const root = makeTree({
      'proj/.git/HEAD': '',
      'self/.claude-plugin/plugin.json': JSON.stringify({ name: 'persona' }),
      'self/personas/clarity.unit.md': unitMd('clarity'),
      'proj/.claude/personas/reader.persona.md': personaMd(['name: reader', 'description: Reader.', 'units:', '  primary: [clarity]']),
    });
    const out: string[] = [];
    const code = run(['validate', 'reader'], { cwd: join(root, 'proj'), home: join(root, 'home'), pluginListJson: '[]', selfPluginRoot: join(root, 'self'), out: (s) => out.push(s) });
    expect(code).toBe(0);
    expect(out.join('\n')).toContain('reader: ok');
  });

  describe('list', () => {
    it('prints JSON with only the requested kind plus warnings, exit 0', () => {
      const r = cli({ ...exampleFiles(), 'user/raw/notes.md': 'x' }).exec('list', 'units', '--json');
      expect(r.code).toBe(0);
      const parsed = JSON.parse(r.text) as Record<string, unknown>;
      expect(Object.keys(parsed)).toEqual(['units', 'warnings']);
      expect((parsed.units as { canonical: string }[]).map((u) => u.canonical)).toContain('acme:cost');
      expect((parsed.warnings as { code: string }[]).map((w) => w.code)).toContain('W_UNTYPED_FILE');
    });

    it('lists both kinds by default and exits 0 with a broken file', () => {
      const r = cli({ ...exampleFiles(), 'user/units/broken.md': unitMd('broken', { threshold: 'severe' }) }).exec('list');
      expect(r.code).toBe(0);
      expect(r.text).toContain('units:');
      expect(r.text).toContain('personas:');
      expect(r.text).toMatch(/broken .*\(invalid/);
    });

    it('shows nothing for old-layout subfolders', () => {
      const r = cli({ 'project/raw/personas/old.md': 'x' }, { plugins: false }).exec('list', 'personas', '--json');
      expect(JSON.parse(r.text).personas).toEqual([]);
    });

    it('rejects bad list arguments with exit 2', () => {
      const c = cli(exampleFiles());
      expect(c.exec('list', 'things').code).toBe(2);
      expect(c.exec('validate', '--json').code).toBe(2);
      expect(c.exec('list', '--scope', 'user').code).toBe(2);
    });

    it('prints warnings to env.err in table mode, not env.out, and exits 0', () => {
      const { root } = registryFor(exampleFiles());
      const out: string[] = [];
      const errLines: string[] = [];
      const code = run(['list'], {
        cwd: join(root, 'proj'),
        home: join(root, 'home'),
        pluginListJson: undefined,
        out: (s) => out.push(s),
        err: (s) => errLines.push(s),
      });
      expect(code).toBe(0);
      expect(errLines.join('\n')).toContain('W_PLUGIN_LIST');
      expect(out.join('\n')).not.toContain('W_PLUGIN_LIST');
    });

    it('includes the full shape of a JSON warning', () => {
      const r = cli({ ...exampleFiles(), 'user/raw/notes.md': 'x' }).exec('list', 'units', '--json');
      const parsed = JSON.parse(r.text) as { warnings: { code: string; level: string; message: string; file: string | null; line: number | null }[] };
      const w = parsed.warnings.find((x) => x.code === 'W_UNTYPED_FILE')!;
      expect(w).toMatchObject({ code: 'W_UNTYPED_FILE', level: 'warning' });
      expect(typeof w.message).toBe('string');
      expect(w.message.length).toBeGreaterThan(0);
      expect(typeof w.file).toBe('string');
      expect(typeof w.line).toBe('number');
    });

    it('list panels --json and plain list include panels', () => {
      const c = cli({ ...exampleFiles(), 'project/panels/release.md': panelMd('release', ['example', 'base']) });
      const parsed = JSON.parse(c.exec('list', 'panels', '--json').text) as { panels: { canonical: string; valid: boolean }[] };
      expect(parsed.panels).toEqual([expect.objectContaining({ canonical: 'release', valid: true })]);
      expect(c.exec('list').text).toContain('panels:');
    });
  });

  describe('parseArgv', () => {
    it('accepts --file and --json on compare', () => {
      const cwd = '/proj';
      expect(parseArgv(['compare', '--file', 'x', '--json'], cwd)).toMatchObject({
        kind: 'command',
        command: 'compare',
        json: true,
        file: resolve(cwd, 'x'),
      });
    });

    it('still rejects --json on prompt', () => {
      expect(parseArgv(['prompt', 'x', '--panel', '--json'], '/proj').kind).toBe('usage');
    });
  });
});

describe('parseArgv: flag messages', () => {
  it('lists the same commands for a flag whichever command rejects it', () => {
    const message = (...argv: string[]) => (parseArgv(argv, '/x') as { message?: string }).message;
    expect(message('validate', '--json')).toBe('--json is only accepted by list, runs list, compare, gate, show, save, patch and delete');
    expect(message('validate', '--file', 'f')).toBe(message('show', 'unit', 'a', '--file', 'f'));
    expect(message('validate', '--expect-hash', 'h')).toBe(message('show', 'unit', 'a', '--expect-hash', 'h'));
    expect(message('validate', '--force')).toBe(message('show', 'unit', 'a', '--force'));
  });
});
