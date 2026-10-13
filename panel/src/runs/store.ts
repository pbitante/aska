import { randomInt } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { writeAtomic } from '../fs';
import { err, type Diagnostic } from '../diagnostics';
import type { Comparison } from '../panel/compare';
import { findGitRoot } from '../scopes/discover';

// A kept panel run: <home>/.claude/aska/runs/<id>/ (or $ASKA_RUNS_DIR/<id>/) with the skill's files plus meta.json.
export const RUN_ID = /^\d{8}T\d{6}Z-[A-Za-z0-9]{6}$/;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const ATTEMPTS = 5;

interface RunPanelist { persona: string; status: string; verdict: string | null; model?: string | null; modelSource?: string | null }
export interface RunMeta {
  schemaVersion: 1;
  id: string;
  source: 'aska';
  projectPath: string;
  question: string | null;
  panel: string | null;
  panelists: RunPanelist[];
  startedAt: string;
  comparedAt: string | null;
  [key: string]: unknown;
}
export interface RunRow extends RunMeta { path: string }
// The environment variables the run store reads. The CLI passes process.env; tests pass their own.
export interface RunEnv { ASKA_RUNS_DIR?: string; GIT_DIR?: string; GIT_WORK_TREE?: string }
export interface RunDeps { now?: () => Date; suffix?: () => string; env?: RunEnv }

export const runsRoot = (home: string): string => join(resolve(home), '.claude', 'aska', 'runs');

// The run store: $ASKA_RUNS_DIR when it's set and not empty, else <home>/.claude/aska/runs.
// ASKA_RUNS_DIR must be absolute and, if it already exists, a directory the user owns, so it can
// be kept owner-only like the default.
export function runsDir(home: string, env: RunEnv = {}): { root: string } | { diagnostic: Diagnostic } {
  const value = env.ASKA_RUNS_DIR;
  if (value === undefined || value === '') return { root: runsRoot(home) };
  const bad = (why: string, fix: string) => ({ diagnostic: err('E_RUNS_DIR', `ASKA_RUNS_DIR ${JSON.stringify(value)} ${why}`, undefined, fix) });
  if (!isAbsolute(value)) return bad('is not an absolute path', 'Set ASKA_RUNS_DIR to an absolute path, or unset it to keep runs in ~/.claude/aska/runs');
  let st;
  try {
    st = statSync(value);
  } catch {
    return { root: resolve(value) };
  }
  if (!st.isDirectory()) return bad('is not a directory', 'Point ASKA_RUNS_DIR at a folder (it is created if it does not exist)');
  const uid = process.getuid?.();
  if (uid !== undefined && st.uid !== uid) return bad('is owned by another user, so it cannot be kept owner-only', 'Point ASKA_RUNS_DIR at a folder you own');
  return { root: resolve(value) };
}

export function randomSuffix(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

// 2026-10-09T20:15:12.345Z → 20261009T201512Z-<suffix>
export const runId = (at: Date, suffix: string): string =>
  `${at.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '')}-${suffix}`;

const metaText = (m: RunMeta): string => `${JSON.stringify(m, null, 2)}\n`;

// `root` may not exist yet, and any ancestor (e.g. ~/.claude stowed from a dotfiles repo) may be
// a symlink: resolve the deepest existing ancestor to its real path, then re-append the tail that
// doesn't exist yet, so the git-root walk below sees through the symlink rather than past it.
function realAncestor(path: string): string {
  let existing = resolve(path);
  const tail: string[] = [];
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) break;
    tail.unshift(basename(existing));
    existing = parent;
  }
  return tail.length > 0 ? join(realpathSync(existing), ...tail) : realpathSync(existing);
}

const inside = (path: string, dir: string): boolean => {
  const rel = relative(dir, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

const realOrSelf = (path: string): string => {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
};

// The [core] bare and worktree settings of a git directory's config. Just enough of git's config
// syntax for what `git init` and `git config core.worktree` write.
function coreConfig(gitDir: string): { bare: boolean; worktree?: string } {
  let text: string;
  try {
    text = readFileSync(join(gitDir, 'config'), 'utf8');
  } catch {
    return { bare: false };
  }
  let core = false;
  let bare = false;
  let worktree: string | undefined;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const section = /^\[\s*([A-Za-z0-9.-]+)\s*(?:"[^"]*")?\s*\]/.exec(line);
    if (section) {
      core = section[1]!.toLowerCase() === 'core';
      continue;
    }
    const kv = /^([A-Za-z][A-Za-z0-9-]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!core || !kv) continue;
    const value = kv[2]!.replace(/^"(.*)"$/, '$1');
    if (kv[1]!.toLowerCase() === 'bare') bare = /^(true|yes|on|1)$/i.test(value);
    if (kv[1]!.toLowerCase() === 'worktree') worktree = resolve(gitDir, value);
  }
  return { bare, worktree };
}

const isGitDir = (dir: string): boolean => {
  try {
    return statSync(join(dir, 'HEAD')).isFile() && statSync(join(dir, 'objects')).isDirectory() && statSync(join(dir, 'refs')).isDirectory();
  } catch {
    return false;
  }
};

// The work tree a git directory outside its work tree tracks: core.worktree when set; else, for a
// bare repository that has an index (it has been used with --work-tree), the folder holding it —
// the bare dotfiles convention, `git init --bare ~/.dotfiles` used as
// `git --git-dir=~/.dotfiles --work-tree=~`. A bare repository with no index (a mirror or a
// backup clone) tracks nothing.
function separateWorkTree(gitDir: string): string | undefined {
  const { bare, worktree } = coreConfig(gitDir);
  if (worktree) return worktree;
  return bare && existsSync(join(gitDir, 'index')) ? dirname(resolve(gitDir)) : undefined;
}

// The git work tree that contains `path`, and the repository that tracks it, if any: an ordinary
// repository or worktree (a .git folder or file in `path` or above it); $GIT_WORK_TREE, or the
// core.worktree of $GIT_DIR; or a bare repository kept directly in `path` or any folder above it
// whose work tree (see separateWorkTree) contains `path`.
export function enclosingWorkTree(path: string, env: RunEnv = {}): { workTree: string; gitDir?: string } | undefined {
  const real = realAncestor(path);
  const git = findGitRoot(real);
  if (git) return { workTree: git };
  if (env.GIT_WORK_TREE && inside(real, realOrSelf(env.GIT_WORK_TREE))) return { workTree: env.GIT_WORK_TREE };
  if (env.GIT_DIR) {
    const wt = separateWorkTree(env.GIT_DIR);
    if (wt && inside(real, realOrSelf(wt))) return { workTree: wt, gitDir: env.GIT_DIR };
  }
  for (let d = real; ; d = dirname(d)) {
    let names: string[] = [];
    try {
      names = readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== '.git').map((e) => e.name);
    } catch {
      // Not there yet, or unreadable: nothing to find in it.
    }
    for (const name of names) {
      const gitDir = join(d, name);
      if (!isGitDir(gitDir)) continue;
      const wt = separateWorkTree(gitDir);
      if (wt && inside(real, realOrSelf(wt))) return { workTree: wt, gitDir };
    }
    if (dirname(d) === d) return undefined;
  }
}

// Runs are owner-only. Folders made before 0.6.1 (or a root made by hand) may be looser, so tighten
// them when they're next used. Best effort: a folder the user doesn't own is left as it is.
function ownerOnly(path: string): void {
  try {
    const mode = statSync(path).mode & 0o777;
    if ((mode & 0o077) !== 0) chmodSync(path, mode & 0o700);
  } catch {
    // Not ours to change, or gone; the write that follows reports any real problem.
  }
}

export function createRun(home: string, cwd: string, deps: RunDeps = {}): { dir: string; meta: RunMeta } | { diagnostic: Diagnostic } {
  const env = deps.env ?? {};
  const where = runsDir(home, env);
  if ('diagnostic' in where) return where;
  const { root } = where;
  // Runs hold briefs and judgments that may quote code or secrets: never keep them anywhere git
  // could pick them up, whichever repository that is.
  const repo = enclosingWorkTree(root, env);
  if (repo) {
    const tree = repo.gitDir ? `${repo.workTree}, the work tree of the git repository ${repo.gitDir}` : `the git working tree ${repo.workTree}`;
    return {
      diagnostic: err('E_RUNS_IN_REPO', `the run store ${root} is inside ${tree}`, undefined,
        `Move the run store out of ${repo.workTree}: set ASKA_RUNS_DIR in the environment Claude Code runs in to an absolute path outside every git working tree; or move ${root} to such a folder and symlink it back at ${root}; or set PERSONA_HOME to a home outside every git working tree — runs then go in $PERSONA_HOME/.claude/aska/runs, and this also moves your user-scope personas and units`),
    };
  }
  const git = findGitRoot(cwd);
  const at = (deps.now ?? (() => new Date()))();
  const suffix = deps.suffix ?? randomSuffix;
  try {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    ownerOnly(root);
    for (let i = 0; i < ATTEMPTS; i++) {
      const id = runId(at, suffix());
      const dir = join(root, id);
      try {
        mkdirSync(dir, { mode: 0o700 });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'EEXIST') continue;
        throw e;
      }
      const meta: RunMeta = {
        schemaVersion: 1, id, source: 'aska', projectPath: resolve(git ?? cwd),
        question: null, panel: null, panelists: [], startedAt: at.toISOString(), comparedAt: null,
      };
      writeAtomic(join(dir, 'meta.json'), metaText(meta));
      return { dir, meta };
    }
    return { diagnostic: err('E_RUNS_WRITE', `could not create a run folder in ${root}: ${ATTEMPTS} ids were already taken`, undefined, 'Run the command again') };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      diagnostic: err('E_RUNS_WRITE', `could not create a run folder in ${root}: ${message}`, undefined,
        `Check that ${root} is writable, or keep this run in a temporary folder`),
    };
  }
}

const nullableString = (v: unknown): boolean => v === null || typeof v === 'string';
const absentOrNullableString = (v: unknown): boolean => v === undefined || nullableString(v);
const validPanelistRow = (v: unknown): boolean =>
  typeof v === 'object' && v !== null &&
  typeof (v as RunPanelist).persona === 'string' &&
  typeof (v as RunPanelist).status === 'string' &&
  nullableString((v as RunPanelist).verdict) &&
  absentOrNullableString((v as RunPanelist).model) &&
  absentOrNullableString((v as RunPanelist).modelSource);

export function readMeta(dir: string): { meta?: RunMeta; reason?: string } {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  } catch (e) {
    return { reason: (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'no meta.json' : 'meta.json is not readable JSON' };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return { reason: 'meta.json is not an object' };
  const m = data as Partial<RunMeta>;
  if (m.schemaVersion !== 1 || m.source !== 'aska') return { reason: 'meta.json is not an aska run (schemaVersion 1, source "aska")' };
  if (
    typeof m.id !== 'string' || !RUN_ID.test(m.id) ||
    typeof m.projectPath !== 'string' ||
    typeof m.startedAt !== 'string' ||
    !Array.isArray(m.panelists) ||
    !nullableString(m.question) ||
    !nullableString(m.panel) ||
    !nullableString(m.comparedAt) ||
    !m.panelists.every(validPanelistRow)
  ) {
    return { reason: 'meta.json is missing a valid id, projectPath, startedAt, question, panel, comparedAt or panelists' };
  }
  return { meta: m as RunMeta };
}

// Called by `compare --record`. Returns a warning to print, or undefined once recorded.
// Read, merge, write: not locked. Two compares recording into one run at the same moment can
// lose one update; the skill runs them one at a time.
export function recordComparison(dir: string, c: Comparison, at: Date): string | undefined {
  const { meta, reason } = readMeta(dir);
  if (!meta) return `not recording: ${dir}: ${reason}`;
  ownerOnly(dir);
  const next: RunMeta = {
    ...meta,
    question: c.question,
    panel: c.panel,
    panelists: c.verdicts.map((v) => ({ persona: v.persona, status: v.status, verdict: v.verdict, model: v.model, modelSource: v.modelSource })),
    comparedAt: at.toISOString(),
  };
  try {
    writeAtomic(join(dir, 'meta.json'), metaText(next));
    return undefined;
  } catch (e) {
    return `not recording: could not write ${join(dir, 'meta.json')}: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export function listRuns(home: string, env: RunEnv = {}): { runs: RunRow[]; skipped: { path: string; reason: string }[]; diagnostic?: Diagnostic } {
  const where = runsDir(home, env);
  if ('diagnostic' in where) return { runs: [], skipped: [], diagnostic: where.diagnostic };
  const { root } = where;
  if (!existsSync(root)) return { runs: [], skipped: [] };
  const names = readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && RUN_ID.test(e.name))
    .map((e) => e.name);
  const runs: RunRow[] = [];
  const skipped: { path: string; reason: string }[] = [];
  for (const name of names) {
    const path = join(root, name);
    const { meta, reason } = readMeta(path);
    if (!meta) skipped.push({ path, reason: reason! });
    else if (meta.id !== name) skipped.push({ path, reason: `meta.json id ${meta.id} does not match the folder name` });
    else runs.push({ ...meta, path });
  }
  // Newest first by startedAt (millisecond precision); ties (same second, different suffix) broken by id descending.
  runs.sort((a, b) => (a.startedAt !== b.startedAt ? (a.startedAt < b.startedAt ? 1 : -1) : a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  return { runs, skipped };
}
