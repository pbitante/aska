import { realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverScopes, findGitRoot, locateProject, parsePluginList, runPluginList } from '../../src/scopes/discover';
import { Registry } from '../../src/scopes/registry';
import { makeTree, mkdtemp } from '../helpers/tree';
import { unitMd } from '../helpers/md';

describe('locateProject', () => {
  it('finds the nearest .claude up to the git root', () => {
    const root = makeTree({ 'repo/.git/HEAD': '', 'repo/.claude/x': '', 'repo/a/b/.keep': '' });
    expect(locateProject(join(root, 'repo/a/b'))).toEqual({ base: join(root, 'repo'), claudeDir: join(root, 'repo/.claude') });
  });

  it('prefers a nearer .claude below the git root', () => {
    const root = makeTree({ 'repo/.git/HEAD': '', 'repo/.claude/x': '', 'repo/sub/.claude/x': '' });
    expect(locateProject(join(root, 'repo/sub')).claudeDir).toBe(join(root, 'repo/sub/.claude'));
  });

  it('treats a .git file (worktree) as the git root', () => {
    const root = makeTree({ 'wt/.git': 'gitdir: elsewhere', 'wt/.claude/x': '', 'wt/src/.keep': '' });
    expect(locateProject(join(root, 'wt/src'))).toEqual({ base: join(root, 'wt'), claudeDir: join(root, 'wt/.claude') });
  });

  it('does not search above the git root', () => {
    const root = makeTree({ 'outer/.claude/x': '', 'outer/repo/.git/HEAD': '', 'outer/repo/src/.keep': '' });
    expect(locateProject(join(root, 'outer/repo/src'))).toEqual({ base: join(root, 'outer/repo') });
  });

  it('outside git, looks only in the working directory', ({ skip }) => {
    const root = makeTree({ 'a/.claude/x': '', 'a/b/.keep': '' });
    skip(findGitRoot(root) !== undefined, 'TMPDIR is inside a git repository; this test assumes it is not');
    expect(locateProject(join(root, 'a/b'))).toEqual({ base: join(root, 'a/b') });
    expect(locateProject(join(root, 'a'))).toEqual({ base: join(root, 'a'), claudeDir: join(root, 'a/.claude') });
  });
});

describe('parsePluginList', () => {
  it('keeps enabled plugins, names them from the manifest, and sorts them', () => {
    const root = makeTree({ 'a/.claude-plugin/plugin.json': JSON.stringify({ name: 'zeta' }), 'b/.keep': '' });
    const json = JSON.stringify([
      { id: 'alpha@mkt', enabled: true, installPath: join(root, 'a') },
      { id: 'beta@mkt', enabled: true, installPath: join(root, 'b') },
      { id: 'off@mkt', enabled: false, installPath: join(root, 'b') },
      { id: 'odd@mkt', enabled: 'yes', installPath: join(root, 'b') },
      { id: 'nopath@mkt', enabled: true },
    ]);
    expect(parsePluginList(json)).toEqual({
      scopes: [
        { kind: 'plugin', root: join(root, 'b'), plugin: 'beta' },
        { kind: 'plugin', root: join(root, 'a'), plugin: 'zeta' },
      ],
      diagnostics: [],
    });
  });

  it.each(['nope', '{}'])('warns instead of failing on %s', (json) => {
    expect(parsePluginList(json).diagnostics.map((d) => d.code)).toEqual(['W_PLUGIN_LIST']);
  });

  it('keeps a plugin entry without id when the manifest has a name', () => {
    const root = makeTree({ 'p/.claude-plugin/plugin.json': JSON.stringify({ name: 'named' }) });
    const json = JSON.stringify([{ enabled: true, installPath: join(root, 'p') }]);
    expect(parsePluginList(json)).toEqual({
      scopes: [{ kind: 'plugin', root: join(root, 'p'), plugin: 'named' }],
      diagnostics: [],
    });
  });

  it('drops an entry with neither id nor manifest name, without warning', () => {
    const root = makeTree({ 'p/.keep': '' });
    const json = JSON.stringify([{ enabled: true, installPath: join(root, 'p') }]);
    expect(parsePluginList(json)).toEqual({ scopes: [], diagnostics: [] });
  });

  it('skips and warns on an empty plugin namespace', () => {
    const root = makeTree({ 'p1/.keep': '', 'p2/.keep': '' });
    const json = JSON.stringify([
      { id: '', enabled: true, installPath: join(root, 'p1') },
      { id: '@m', enabled: true, installPath: join(root, 'p2') },
    ]);
    const result = parsePluginList(json);
    expect(result.scopes).toEqual([]);
    expect(result.diagnostics.map((d) => d.code)).toEqual(['W_PLUGIN_NAME', 'W_PLUGIN_NAME']);
    expect(result.diagnostics.every((d) => !!d.fix)).toBe(true);
  });

  it('skips and warns when the manifest name contains ":"', () => {
    const root = makeTree({ 'p/.claude-plugin/plugin.json': JSON.stringify({ name: 'a:b' }) });
    const json = JSON.stringify([{ id: 'x@m', enabled: true, installPath: join(root, 'p') }]);
    const result = parsePluginList(json);
    expect(result.scopes).toEqual([]);
    expect(result.diagnostics).toMatchObject([{ code: 'W_PLUGIN_NAME' }]);
  });

  it('resolves a relative installPath', () => {
    const root = makeTree({ 'p/.keep': '' });
    const json = JSON.stringify([{ id: 'x@m', enabled: true, installPath: join(root, 'p') }]);
    expect(parsePluginList(json).scopes[0]!.root).toBe(join(root, 'p'));
  });

  it('warns and keeps only the first when two plugins share a namespace', () => {
    const root = makeTree({ 'a/.keep': '', 'b/.keep': '' });
    const json = JSON.stringify([
      { id: 'acme@mkt1', enabled: true, installPath: join(root, 'b') },
      { id: 'acme@mkt2', enabled: true, installPath: join(root, 'a') },
    ]);
    const result = parsePluginList(json);
    expect(result.scopes).toEqual([{ kind: 'plugin', root: join(root, 'a'), plugin: 'acme' }]);
    expect(result.diagnostics).toMatchObject([
      { code: 'W_PLUGIN_DUPLICATE', fix: `Installed at both "${join(root, 'a')}" and "${join(root, 'b')}"; disable one` },
    ]);
  });

  it('sorts plugins by code unit, not locale', () => {
    const root = makeTree({ 'B/.keep': '', 'b/.keep': '' });
    const json = JSON.stringify([
      { id: 'b@m', enabled: true, installPath: join(root, 'b') },
      { id: 'B@m', enabled: true, installPath: join(root, 'B') },
    ]);
    expect(parsePluginList(json).scopes.map((s) => s.plugin)).toEqual(['B', 'b']);
  });

  it('ignores non-object entries in the plugin list', () => {
    const root = makeTree({ 'p/.keep': '' });
    const json = JSON.stringify([null, 3, 'x', { id: 'ok@m', enabled: true, installPath: join(root, 'p') }]);
    expect(parsePluginList(json).scopes.map((s) => s.plugin)).toEqual(['ok']);
  });
});

describe('discoverScopes', () => {
  it('orders project, user, then plugins', () => {
    const root = makeTree({ 'repo/.git/HEAD': '', 'repo/.claude/x': '', 'p/.keep': '' });
    const json = JSON.stringify([{ id: 'acme@m', enabled: true, installPath: join(root, 'p') }]);
    const d = discoverScopes({ cwd: join(root, 'repo'), home: join(root, 'home'), pluginListJson: json });
    expect(d.scopes).toEqual([
      { kind: 'project', root: join(root, 'repo/.claude') },
      { kind: 'user', root: join(root, 'home/.claude') },
      { kind: 'plugin', root: join(root, 'p'), plugin: 'acme' },
    ]);
    expect(d.diagnostics).toEqual([]);
  });

  it('does not treat ~/.claude as both the project and the user scope', ({ skip }) => {
    const root = makeTree({ 'home/.claude/personas/a.unit.md': 'x' });
    skip(findGitRoot(root) !== undefined, 'TMPDIR is inside a git repository; this test assumes it is not');
    const d = discoverScopes({ cwd: join(root, 'home'), home: join(root, 'home'), pluginListJson: '[]' });
    expect(d.scopes.map((s) => s.kind)).toEqual(['user']);
    expect(d.project.claudeDir).toBeUndefined();
  });

  it('warns and continues when the plugin list is unavailable', ({ skip }) => {
    const root = makeTree({ 'w/.keep': '' });
    skip(findGitRoot(root) !== undefined, 'TMPDIR is inside a git repository; this test assumes it is not');
    const d = discoverScopes({ cwd: join(root, 'w'), home: join(root, 'home'), pluginListJson: undefined });
    expect(d.diagnostics.map((x) => x.code)).toEqual(['W_PLUGIN_LIST']);
    expect(d.scopes.map((s) => s.kind)).toEqual(['user']);
  });

  it('says other plugins are unavailable, since the self plugin still resolves', ({ skip }) => {
    const root = makeTree({ 'w/.keep': '' });
    skip(findGitRoot(root) !== undefined, 'TMPDIR is inside a git repository; this test assumes it is not');
    const d = discoverScopes({ cwd: join(root, 'w'), home: join(root, 'home'), pluginListJson: undefined });
    expect(d.diagnostics[0]!.message).toContain("other plugins' personas and units are unavailable");
  });

  it('works when home is itself a git repo containing .claude, and clears claudeDir once dropped', () => {
    const root = makeTree({ 'home/.git/HEAD': '', 'home/.claude/personas/a.unit.md': unitMd('a'), 'home/proj/.keep': '' });
    const d = discoverScopes({ cwd: join(root, 'home/proj'), home: join(root, 'home'), pluginListJson: '[]' });
    expect(d.scopes.map((s) => s.kind)).toEqual(['user']);
    expect(d.project.claudeDir).toBeUndefined();
    expect(d.project.droppedClaudeDir).toBe(join(root, 'home/.claude'));
  });

  it('drops a project .claude that is the same directory as ~/.claude through a symlink', () => {
    const root = makeTree({ 'dotfiles/.git/HEAD': '', 'dotfiles/.claude/personas/a.unit.md': unitMd('a'), 'home/.keep': '' });
    symlinkSync(join(root, 'dotfiles/.claude'), join(root, 'home/.claude'));
    const d = discoverScopes({ cwd: join(root, 'dotfiles'), home: join(root, 'home'), pluginListJson: '[]' });
    expect(d.scopes.map((s) => s.kind)).toEqual(['user']);
    expect(d.project.claudeDir).toBeUndefined();
    expect(d.project.droppedClaudeDir).toBe(join(root, 'dotfiles/.claude'));
    const l = new Registry(d.scopes).lookup('unit', 'a');
    expect(l.file!.scope.kind).toBe('user');
    expect(l.shadow).toBeUndefined();
  });

  it('drops the project scope when HOME is reached through a symlink to the physical cwd', () => {
    const root = makeTree({ 'real/.git/HEAD': '', 'real/.claude/personas/a.unit.md': unitMd('a') });
    symlinkSync(join(root, 'real'), join(root, 'link'));
    const d = discoverScopes({ cwd: join(root, 'real'), home: join(root, 'link'), pluginListJson: '[]' });
    expect(d.scopes.map((s) => s.kind)).toEqual(['user']);
    expect(d.project.claudeDir).toBeUndefined();
    expect(d.project.droppedClaudeDir).toBe(join(root, 'real/.claude'));
  });

  it('reports the dropped .claude even when it is nested below the git root, not at the root itself', () => {
    const root = makeTree({
      'repo/.git/HEAD': '',
      'repo/sub/.claude/personas/a.unit.md': unitMd('a'),
      'repo/sub/deeper/.keep': '',
    });
    const d = discoverScopes({ cwd: join(root, 'repo/sub/deeper'), home: join(root, 'repo/sub'), pluginListJson: '[]' });
    expect(d.scopes.map((s) => s.kind)).toEqual(['user']);
    expect(d.project.base).toBe(join(root, 'repo'));
    expect(d.project.claudeDir).toBeUndefined();
    expect(d.project.droppedClaudeDir).toBe(join(root, 'repo/sub/.claude'));
  });
});

describe('runPluginList', () => {
  it('runs claude in the given cwd, so project-scoped plugin enablement reflects it', () => {
    const binDir = mkdtemp('fake-claude-bin-');
    writeFileSync(join(binDir, 'claude'), '#!/bin/sh\npwd\n', { mode: 0o755 });
    const target = realpathSync(mkdtemp('fake-claude-cwd-'));
    const prevPath = process.env.PATH;
    process.env.PATH = `${binDir}:${prevPath}`;
    try {
      expect(runPluginList(target).json?.trim()).toBe(target);
    } finally {
      process.env.PATH = prevPath;
    }
  });

  it('says why it failed: the exit code and the first line of stderr, or a missing claude', () => {
    const binDir = mkdtemp('fake-claude-bin-');
    writeFileSync(join(binDir, 'claude'), '#!/bin/sh\necho "not logged in" >&2\necho "second line" >&2\nexit 3\n', { mode: 0o755 });
    const prevPath = process.env.PATH;
    try {
      process.env.PATH = `${binDir}:${prevPath}`;
      expect(runPluginList()).toEqual({ reason: 'could not run "claude plugin list --json" (exit code 3: not logged in)' });
      process.env.PATH = mkdtemp('empty-bin-');
      expect(runPluginList()).toEqual({ reason: 'could not run "claude plugin list --json" (claude is not on PATH)' });
    } finally {
      process.env.PATH = prevPath;
    }
  });

  it('tells a timeout, a killed claude and a claude that cannot start apart', () => {
    const prevPath = process.env.PATH;
    // A non-executable claude must be the only one on PATH, or the lookup would fall through to a real one.
    const withClaude = (script: string, mode = 0o755) => {
      const binDir = mkdtemp('fake-claude-bin-');
      writeFileSync(join(binDir, 'claude'), `#!/bin/sh\n${script}\n`, { mode });
      process.env.PATH = mode === 0o755 ? `${binDir}:${prevPath}` : binDir;
    };
    try {
      withClaude('sleep 5');
      expect(runPluginList(undefined, 200)).toEqual({ reason: 'could not run "claude plugin list --json" (no answer within 0.2s)' });
      withClaude('kill -9 $$');
      expect(runPluginList()).toEqual({ reason: 'could not run "claude plugin list --json" (killed by SIGKILL)' });
      withClaude('echo never', 0o644);
      expect(runPluginList().reason).toMatch(/^could not run "claude plugin list --json" \(.*EACCES.*\)$/);
    } finally {
      process.env.PATH = prevPath;
    }
  });
});

describe('discoverScopes: self plugin scope', () => {
  const selfTree = () => makeTree({ 'self/.claude-plugin/plugin.json': JSON.stringify({ name: 'aska' }), 'w/.keep': '' });

  it('adds its own plugin even when the plugin list does not report it', () => {
    const root = selfTree();
    const d = discoverScopes({ cwd: join(root, 'w'), home: join(root, 'home'), pluginListJson: '[]', selfPluginRoot: join(root, 'self') });
    expect(d.scopes.filter((s) => s.kind === 'plugin')).toEqual([{ kind: 'plugin', root: join(root, 'self'), plugin: 'aska' }]);
  });

  it('adds it when the plugin list is unavailable too', () => {
    const root = selfTree();
    const d = discoverScopes({ cwd: join(root, 'w'), home: join(root, 'home'), pluginListJson: undefined, selfPluginRoot: join(root, 'self') });
    expect(d.scopes.map((s) => s.plugin).filter(Boolean)).toEqual(['aska']);
    expect(d.diagnostics.map((x) => x.code)).toEqual(['W_PLUGIN_LIST']);
  });

  it('does not duplicate a namespace already in the plugin list, and keeps namespaces sorted', () => {
    const root = makeTree({
      'self/.claude-plugin/plugin.json': JSON.stringify({ name: 'aska' }),
      'installed/.claude-plugin/plugin.json': JSON.stringify({ name: 'aska' }),
      'z/.claude-plugin/plugin.json': JSON.stringify({ name: 'zeta' }),
      'a/.claude-plugin/plugin.json': JSON.stringify({ name: 'alpha' }),
      'w/.keep': '',
    });
    const json = JSON.stringify([
      { id: 'aska@m', enabled: true, installPath: join(root, 'installed') },
      { id: 'zeta@m', enabled: true, installPath: join(root, 'z') },
    ]);
    const d = discoverScopes({ cwd: join(root, 'w'), home: join(root, 'home'), pluginListJson: json, selfPluginRoot: join(root, 'self') });
    expect(d.scopes.filter((s) => s.kind === 'plugin').map((s) => [s.plugin, s.root])).toEqual([
      ['aska', join(root, 'installed')],
      ['zeta', join(root, 'z')],
    ]);
    const d2 = discoverScopes({ cwd: join(root, 'w'), home: join(root, 'home'), pluginListJson: JSON.stringify([{ id: 'zeta@m', enabled: true, installPath: join(root, 'z') }]), selfPluginRoot: join(root, 'a') });
    expect(d2.scopes.filter((s) => s.kind === 'plugin').map((s) => s.plugin)).toEqual(['alpha', 'zeta']);
  });

  it('ignores a self root without a manifest name', () => {
    const root = makeTree({ 'self/.keep': '', 'w/.keep': '' });
    const d = discoverScopes({ cwd: join(root, 'w'), home: join(root, 'home'), pluginListJson: '[]', selfPluginRoot: join(root, 'self') });
    expect(d.scopes.filter((s) => s.kind === 'plugin')).toEqual([]);
  });

  it('skips the self plugin and warns with W_PLUGIN_NAME when its manifest name is invalid', () => {
    const root = makeTree({ 'self/.claude-plugin/plugin.json': JSON.stringify({ name: 'a:b' }), 'w/.keep': '' });
    const d = discoverScopes({ cwd: join(root, 'w'), home: join(root, 'home'), pluginListJson: '[]', selfPluginRoot: join(root, 'self') });
    expect(d.scopes.filter((s) => s.kind === 'plugin')).toEqual([]);
    expect(d.diagnostics).toMatchObject([{ code: 'W_PLUGIN_NAME' }]);
  });
});

describe('discoverScopes + Registry', () => {
  it('does not shadow a user file with itself when cwd is home', ({ skip }) => {
    const root = makeTree({ 'home/.claude/personas/a.unit.md': unitMd('a') });
    skip(findGitRoot(root) !== undefined, 'TMPDIR is inside a git repository; this test assumes it is not');
    const d = discoverScopes({ cwd: join(root, 'home'), home: join(root, 'home'), pluginListJson: '[]' });
    const l = new Registry(d.scopes).lookup('unit', 'a');
    expect(l.file!.scope.kind).toBe('user');
    expect(l.shadow).toBeUndefined();
  });
});
