import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkAuthored, diffSnapshots, distinctPrimaries, gitTrackedPaths, pluginFingerprint, snapshotGitTree, snapshotTree } from '../../evals/author/checks';
import { personaMd, unitMd } from '../helpers/md';
import { makeTree } from '../helpers/tree';

const repo = fileURLToPath(new URL('../..', import.meta.url));

function project(persona: string, extra: Record<string, string> = {}) {
  const root = makeTree({ '.git/HEAD': '', '.claude/personas/guard.persona.md': persona, ...extra });
  return join(root, '.claude');
}
const good = personaMd(['name: guard', 'description: Guards.', 'units:', '  primary: [security, data-integrity, rollback-safety]', '  secondary: [cost]']);

describe('checkAuthored', () => {
  const before = pluginFingerprint(repo);

  it('passes a valid persona built from starter units', () => {
    const r = checkAuthored(project(good), repo, before);
    expect(r.problems).toEqual([]);
    expect(r.persona).toBe('guard');
    expect(r.primary).toEqual(['aska:security', 'aska:data-integrity', 'aska:rollback-safety']);
    expect(r.starterCount).toBe(4);
  });

  it('fails with fewer than 3 starter units', () => {
    const p = personaMd(['name: guard', 'description: Guards.', 'units:', '  primary: [security, mine]']);
    const r = checkAuthored(project(p, { '.claude/personas/mine.unit.md': unitMd('mine') }), repo, before);
    expect(r.problems.join('\n')).toContain('starter units');
  });

  it('fails with more than 7 primary units', () => {
    const p = personaMd(['name: guard', 'description: Guards.', 'units:', '  primary: [security, data-integrity, rollback-safety, edge-cases, performance, cost, observability, maintainability]']);
    expect(checkAuthored(project(p), repo, before).problems.join('\n')).toContain('primary');
  });

  it('fails when there is not exactly one persona, or it has errors', () => {
    expect(checkAuthored(project(good, { '.claude/personas/other.persona.md': good.replace('guard', 'other') }), repo, before).problems.join('\n')).toContain('exactly one');
    const broken = personaMd(['name: guard', 'description: Guards.', 'units:', '  primary: [nope]']);
    expect(checkAuthored(project(broken), repo, before).problems.join('\n')).toContain('error');
  });

  it('fails when the plugin personas folder changed', () => {
    const copy = join(makeTree({ '.keep': '' }), 'repo');
    cpSync(join(repo, 'personas'), join(copy, 'personas'), { recursive: true });
    cpSync(join(repo, '.claude-plugin'), join(copy, '.claude-plugin'), { recursive: true });
    const fp = pluginFingerprint(copy);
    writeFileSync(join(copy, 'personas/extra.unit.md'), unitMd('extra'));
    expect(checkAuthored(project(good), copy, fp).problems.join('\n')).toContain('plugin');
  });
});

describe('pluginFingerprint', () => {
  function copyOfRepoPersonas() {
    const copy = join(makeTree({ '.keep': '' }), 'repo');
    cpSync(join(repo, 'personas'), join(copy, 'personas'), { recursive: true });
    return copy;
  }

  it('does not throw, and detects the change, when personas/ gains a subfolder', () => {
    const copy = copyOfRepoPersonas();
    const fp = pluginFingerprint(copy);
    mkdirSync(join(copy, 'personas', 'sub'));
    expect(() => pluginFingerprint(copy)).not.toThrow();
    expect(pluginFingerprint(copy)).not.toBe(fp);
  });

  it('does not throw, and detects the change, when personas/ is deleted', () => {
    const copy = copyOfRepoPersonas();
    const fp = pluginFingerprint(copy);
    rmSync(join(copy, 'personas'), { recursive: true });
    expect(() => pluginFingerprint(copy)).not.toThrow();
    expect(pluginFingerprint(copy)).not.toBe(fp);
  });
});

describe('snapshotTree / diffSnapshots', () => {
  it('reports no diff when nothing changed', () => {
    const dir = makeTree({ 'a.txt': 'x', 'sub/b.txt': 'y' });
    const before = snapshotTree(dir);
    expect(diffSnapshots(before, snapshotTree(dir))).toEqual([]);
  });

  it('reports added, removed, and modified files', () => {
    const dir = makeTree({ 'a.txt': 'x', 'b.txt': 'y' });
    const before = snapshotTree(dir);
    writeFileSync(join(dir, 'a.txt'), 'xx');
    rmSync(join(dir, 'b.txt'));
    writeFileSync(join(dir, 'c.txt'), 'z');
    const diff = diffSnapshots(before, snapshotTree(dir));
    expect(diff).toContain('modified a.txt');
    expect(diff).toContain('removed b.txt');
    expect(diff).toContain('added c.txt');
  });

  it('excludes the given paths and their contents', () => {
    const dir = makeTree({ 'keep.txt': 'x', 'node_modules/pkg/index.js': 'y', 'evals/results/x.json': 'z' });
    const snap = snapshotTree(dir, ['node_modules', 'evals/results']);
    expect(Object.keys(snap).sort()).toEqual(['keep.txt']);
  });

  it('treats a missing root as an empty tree, both before and after', () => {
    const dir = join(makeTree({ '.keep': '' }), 'does-not-exist');
    expect(snapshotTree(dir)).toEqual({});
    expect(diffSnapshots(snapshotTree(dir), snapshotTree(dir))).toEqual([]);
  });
});

describe('gitTrackedPaths / snapshotGitTree', () => {
  function gitRepo(files: Record<string, string>): string {
    const dir = makeTree(files);
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['add', '-A'], { cwd: dir });
    execFileSync('git', ['commit', '-q', '-m', 'init', '--author', 'test <test@test>'], {
      cwd: dir,
      env: { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@test', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@test' },
    });
    return dir;
  }

  it('reports tracked and untracked-but-not-ignored paths, and excludes ignored ones', () => {
    const dir = gitRepo({ 'tracked.txt': 'a', '.gitignore': 'ignored.txt\n' });
    writeFileSync(join(dir, 'untracked.txt'), 'b');
    writeFileSync(join(dir, 'ignored.txt'), 'c');
    expect(gitTrackedPaths(dir).sort()).toEqual(['.gitignore', 'tracked.txt', 'untracked.txt']);
  });

  it('snapshotGitTree + diffSnapshots catches a new untracked file', () => {
    const dir = gitRepo({ 'tracked.txt': 'a' });
    const before = snapshotGitTree(dir);
    writeFileSync(join(dir, 'new.txt'), 'x');
    expect(diffSnapshots(before, snapshotGitTree(dir))).toEqual(['added new.txt']);
  });

  it('does not see files written inside a gitignored directory', () => {
    const dir = gitRepo({ 'tracked.txt': 'a', '.gitignore': 'node_modules/\n' });
    const before = snapshotGitTree(dir);
    mkdirSync(join(dir, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', 'pkg', 'index.js'), 'y');
    expect(diffSnapshots(before, snapshotGitTree(dir))).toEqual([]);
  });
});

describe('distinctPrimaries', () => {
  it('flags two briefs with the same primary set, ignoring order', () => {
    const problems = distinctPrimaries([
      { brief: 'a.md', primary: ['x', 'y'] },
      { brief: 'b.md', primary: ['y', 'x'] },
    ]);
    expect(problems).toEqual(['a.md and b.md have identical primary sets']);
  });

  it('does not flag empty primary sets against each other', () => {
    expect(distinctPrimaries([{ brief: 'a.md', primary: [] }, { brief: 'b.md', primary: [] }])).toEqual([]);
  });

  it('passes three distinct primary sets', () => {
    const problems = distinctPrimaries([
      { brief: 'a.md', primary: ['x'] },
      { brief: 'b.md', primary: ['y'] },
      { brief: 'c.md', primary: ['z'] },
    ]);
    expect(problems).toEqual([]);
  });
});
