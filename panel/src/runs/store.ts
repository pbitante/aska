import { randomInt } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { writeAtomic } from '../fs';
import { err, type Diagnostic } from '../diagnostics';
import type { Comparison } from '../panel/compare';
import { findGitRoot } from '../scopes/discover';

// A kept panel run: <home>/.claude/aska/runs/<id>/ with the skill's files plus meta.json.
export const RUN_ID = /^\d{8}T\d{6}Z-[A-Za-z0-9]{6}$/;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const ATTEMPTS = 5;

interface RunPanelist { persona: string; status: string; verdict: string | null }
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
export interface RunDeps { now?: () => Date; suffix?: () => string }

export const runsRoot = (home: string): string => join(resolve(home), '.claude', 'aska', 'runs');

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
  const root = runsRoot(home);
  // Runs hold briefs and judgments that may quote code or secrets: never keep them anywhere git
  // could pick them up, whichever repository that is.
  const repo = findGitRoot(realAncestor(root));
  if (repo) {
    return {
      diagnostic: err('E_RUNS_IN_REPO', `the run store ${root} is inside the git working tree ${repo}`, undefined,
        `Move the run store out of ${repo}: move ${root} to a folder outside any git working tree and symlink it back at ${root}, or set PERSONA_HOME in the environment Claude Code runs in to a home outside every git working tree — runs then go in $PERSONA_HOME/.claude/aska/runs, and this also moves your user-scope personas and units`),
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
const validPanelistRow = (v: unknown): boolean =>
  typeof v === 'object' && v !== null &&
  typeof (v as RunPanelist).persona === 'string' &&
  typeof (v as RunPanelist).status === 'string' &&
  nullableString((v as RunPanelist).verdict);

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
    panelists: c.verdicts.map((v) => ({ persona: v.persona, status: v.status, verdict: v.verdict })),
    comparedAt: at.toISOString(),
  };
  try {
    writeAtomic(join(dir, 'meta.json'), metaText(next));
    return undefined;
  } catch (e) {
    return `not recording: could not write ${join(dir, 'meta.json')}: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export function listRuns(home: string): { runs: RunRow[]; skipped: { path: string; reason: string }[] } {
  const root = runsRoot(home);
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
