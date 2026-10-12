import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TIERS } from '../../src/model/types';
import { resolvePersona } from '../../src/resolve/resolve';
import { Registry } from '../../src/scopes/registry';

export interface AuthorCheck {
  persona?: string;
  primary: string[];
  starterCount: number;
  errors: number;
  problems: string[];
}

// Hashes the plugin's personas/ folder by entry kind and name (directories and symlinks aren't
// read as files, so a subfolder can't throw EISDIR), and never throws when the folder is missing
// — a missing folder just hashes differently from a real one, so the before/after comparison in
// checkAuthored still catches it without special-casing.
export function pluginFingerprint(repoRoot: string): string {
  const dir = join(repoRoot, 'personas');
  const h = createHash('sha256');
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    h.update('MISSING\0');
    return h.digest('hex');
  }
  for (const e of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isDirectory()) h.update(`DIR:${e.name}\0`);
    else if (e.isSymbolicLink()) h.update(`LINK:${e.name}\0`);
    else if (e.isFile()) h.update(`${e.name}\0${readFileSync(join(dir, e.name), 'utf8')}\0`);
  }
  return h.digest('hex');
}

interface FileStat {
  size: number;
  mtimeMs: number;
}
export type Snapshot = Record<string, FileStat>;

function isExcluded(relPath: string, exclude: readonly string[]): boolean {
  return exclude.some((e) => relPath === e || relPath.startsWith(`${e}/`));
}

// A path + mtime + size snapshot of a directory tree, for proving "nothing was written outside
// the temp project" across a `claude -p` run: diffSnapshots(before, after) is the eval's only way
// to catch a write through a mechanism the checks can't otherwise see (e.g. a Bash workaround).
// Never throws: a missing root is just an empty snapshot, matched by an equally missing root after.
export function snapshotTree(root: string, exclude: readonly string[] = []): Snapshot {
  const out: Snapshot = {};
  function walk(dir: string, rel: string): void {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      if (isExcluded(relPath, exclude)) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        walk(full, relPath);
      } else {
        try {
          const st = statSync(full);
          out[relPath] = { size: st.size, mtimeMs: st.mtimeMs };
        } catch {
          // gone between readdir and stat (e.g. a dangling symlink); treat as absent
        }
      }
    }
  }
  walk(root, '');
  return out;
}

// The paths `git` itself considers part of the working tree: tracked files, plus untracked files
// that aren't ignored. Deliberately excludes ignored-but-untracked trees (e.g. `.worktrees/`,
// `.superpowers/`, `node_modules/`) without having to name them, so the snapshot doesn't grow a
// new exclusion every time a sibling worktree or tool directory appears.
export function gitTrackedPaths(root: string): string[] {
  const r = spawnSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: root, encoding: 'utf8' });
  return r.stdout.split('\n').filter((p) => p.length > 0);
}

// A snapshot restricted to gitTrackedPaths(root), for proving "nothing was written outside the
// temp project" without re-walking (and re-excluding) everything git already ignores.
export function snapshotGitTree(root: string): Snapshot {
  const out: Snapshot = {};
  for (const rel of gitTrackedPaths(root)) {
    try {
      const st = statSync(join(root, rel));
      if (st.isFile()) out[rel] = { size: st.size, mtimeMs: st.mtimeMs };
    } catch {
      // gone between ls-files and stat
    }
  }
  return out;
}

export function diffSnapshots(before: Snapshot, after: Snapshot): string[] {
  const problems: string[] = [];
  const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const p of [...paths].sort()) {
    const b = before[p];
    const a = after[p];
    if (!b && a) problems.push(`added ${p}`);
    else if (b && !a) problems.push(`removed ${p}`);
    else if (b && a && (b.size !== a.size || b.mtimeMs !== a.mtimeMs)) problems.push(`modified ${p}`);
  }
  return problems;
}

// Kept out of run.ts's results loop so it has a unit test.
export function distinctPrimaries(entries: { brief: string; primary: string[] }[]): string[] {
  const problems: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = [...entries[i]!.primary].sort().join(',');
      const b = [...entries[j]!.primary].sort().join(',');
      if (a !== '' && a === b) problems.push(`${entries[i]!.brief} and ${entries[j]!.brief} have identical primary sets`);
    }
  }
  return problems;
}

export function checkAuthored(projectClaudeDir: string, repoRoot: string, pluginBefore: string): AuthorCheck {
  const problems: string[] = [];
  const reg = new Registry([
    { kind: 'project', root: projectClaudeDir },
    { kind: 'plugin', root: repoRoot, plugin: 'aska' },
  ]);
  const personas = reg.all('persona').filter((f) => f.scope.kind === 'project');
  if (pluginFingerprint(repoRoot) !== pluginBefore) problems.push('the plugin personas/ folder was modified');
  if (personas.length !== 1) {
    problems.push(`expected exactly one project persona, found ${personas.length}`);
    return { primary: [], starterCount: 0, errors: 0, problems };
  }
  const r = resolvePersona(reg, personas[0]!.canonical);
  const errors = r.diagnostics.filter((d) => d.level === 'error').length;
  if (errors > 0 || !r.effective) {
    problems.push(`persona has ${errors} error(s): ${r.diagnostics.filter((d) => d.level === 'error').map((d) => d.code).join(', ')}`);
    return { persona: personas[0]!.name, primary: [], starterCount: 0, errors, problems };
  }
  const e = r.effective;
  const all = TIERS.flatMap((t) => e.units[t].map((u) => u.canonical));
  const starterCount = all.filter((c) => c.startsWith('aska:')).length;
  const primary = e.units.primary.map((u) => u.canonical);
  if (starterCount < 3) problems.push(`uses ${starterCount} starter units (need at least 3)`);
  if (primary.length > 7) problems.push(`has ${primary.length} primary units (at most 7)`);
  if (primary.length === 0) problems.push('has no primary units');
  return { persona: e.name, primary, starterCount, errors, problems };
}
