import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Comparison } from '../../src/panel/compare';
import { createRun, listRuns, randomSuffix, readMeta, recordComparison, RUN_ID, runId, runsRoot, type RunMeta } from '../../src/runs/store';
import { makeTree } from '../helpers/tree';

const AT = new Date('2026-10-09T20:15:12.345Z');
const LATER = new Date('2026-10-09T20:19:40.000Z');
const fixed = (...suffixes: string[]) => () => suffixes.shift() ?? 'zzzzzz';

function made(r: ReturnType<typeof createRun>): { dir: string; meta: RunMeta } {
  if ('diagnostic' in r) throw new Error(r.diagnostic.message);
  return r;
}

const comparison = (over: Partial<Comparison> = {}): Comparison => ({
  question: 'Ship?',
  panel: 'code',
  verdicts: [
    { persona: 'aska:guardian', status: 'ok', verdict: 'proceed-with-conditions', reason: null },
    { persona: 'aska:skeptic', status: 'timeout', verdict: null, reason: 'timed out after 10 min' },
  ],
  units: [],
  outsideScope: [],
  merged: { conditions: [], missing: [], investigate: [], sections: [] },
  followUps: [],
  ok: false,
  ...over,
} as unknown as Comparison);

describe('run ids', () => {
  it('formats the UTC second and the suffix', () => {
    expect(runId(AT, 'Ab3xYz')).toBe('20261009T201512Z-Ab3xYz');
    expect(RUN_ID.test(runId(AT, randomSuffix()))).toBe(true);
  });

  it('draws 6 characters from [A-Za-z0-9]', () => {
    for (let i = 0; i < 50; i++) expect(randomSuffix()).toMatch(/^[A-Za-z0-9]{6}$/);
  });
});

describe('createRun', () => {
  it('creates a 0700 root, the folder and its initial meta.json', () => {
    const root = makeTree({ 'proj/.git/HEAD': '', 'proj/sub/x': '' });
    const home = join(root, 'home');
    const { dir, meta } = made(createRun(home, join(root, 'proj/sub'), { now: () => AT, suffix: fixed('Ab3xYz') }));
    expect(dir).toBe(join(runsRoot(home), '20261009T201512Z-Ab3xYz'));
    expect(statSync(runsRoot(home)).mode & 0o777).toBe(0o700);
    expect(meta).toEqual({
      schemaVersion: 1, id: '20261009T201512Z-Ab3xYz', source: 'aska', projectPath: join(root, 'proj'),
      question: null, panel: null, panelists: [], startedAt: '2026-10-09T20:15:12.345Z', comparedAt: null,
    });
    expect(JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'))).toEqual(meta);
    expect(readdirSync(dir)).toEqual(['meta.json']);
  });

  it('creates each run folder 0700 and tightens a root that already existed with looser permissions', () => {
    // Under umask 077 a folder made without a mode is 0700 anyway, so pin a permissive umask.
    const umask = process.umask(0o022);
    try {
      const root = makeTree({ 'proj/.git/HEAD': '' });
      const home = join(root, 'home');
      mkdirSync(runsRoot(home), { recursive: true });
      chmodSync(runsRoot(home), 0o755);
      const { dir } = made(createRun(home, join(root, 'proj'), { now: () => AT, suffix: fixed('Ab3xYz') }));
      expect(statSync(dir).mode & 0o777).toBe(0o700);
      expect(statSync(runsRoot(home)).mode & 0o777).toBe(0o700);
    } finally {
      process.umask(umask);
    }
  });

  it('uses the cwd as projectPath outside any repository', () => {
    const root = makeTree({ 'loose/x': '' });
    const { meta } = made(createRun(join(root, 'home'), join(root, 'loose'), { now: () => AT }));
    expect(meta.projectPath).toBe(join(root, 'loose'));
  });

  it('uses a worktree root, where .git is a file, as projectPath', () => {
    const root = makeTree({ 'wt/.git': 'gitdir: /elsewhere\n', 'wt/a/x': '' });
    const { meta } = made(createRun(join(root, 'home'), join(root, 'wt/a'), { now: () => AT }));
    expect(meta.projectPath).toBe(join(root, 'wt'));
  });

  it('retries a taken suffix, and fails after 5 taken ids', () => {
    const root = makeTree({ 'p/x': '' });
    const home = join(root, 'home');
    for (const s of ['aaaaaa', 'bbbbbb', 'cccccc', 'dddddd', 'eeeeee']) mkdirSync(join(runsRoot(home), runId(AT, s)), { recursive: true });
    const ok = made(createRun(home, join(root, 'p'), { now: () => AT, suffix: fixed('aaaaaa', 'ffffff') }));
    expect(ok.meta.id).toBe(runId(AT, 'ffffff'));
    const r = createRun(home, join(root, 'p'), { now: () => AT, suffix: fixed('aaaaaa', 'bbbbbb', 'cccccc', 'dddddd', 'eeeeee', 'ffffff') });
    expect('diagnostic' in r && r.diagnostic.code).toBe('E_RUNS_WRITE');
  });

  it('refuses a store inside the project repository', () => {
    const root = makeTree({ 'home/.git/HEAD': '', 'home/proj/x': '' });
    const r = createRun(join(root, 'home'), join(root, 'home/proj'), { now: () => AT });
    expect('diagnostic' in r && r.diagnostic.code).toBe('E_RUNS_IN_REPO');
  });

  it('refuses a store inside an unrelated repository, and says how to move it', () => {
    const root = makeTree({ 'dotfiles/.git/HEAD': '', 'p/x': '' });
    const r = createRun(join(root, 'dotfiles'), join(root, 'p'), { now: () => AT });
    if (!('diagnostic' in r)) throw new Error('expected a diagnostic');
    expect(r.diagnostic.code).toBe('E_RUNS_IN_REPO');
    expect(r.diagnostic.message).toContain(join(root, 'dotfiles'));
    expect(r.diagnostic.fix).toContain('PERSONA_HOME');
    expect(r.diagnostic.fix).toContain('symlink');
    expect(existsSync(runsRoot(join(root, 'dotfiles')))).toBe(false);
  });

  it('refuses a store reached through a symlinked ancestor into a repository', () => {
    const root = makeTree({ 'repo/.git/HEAD': '', 'repo/dotfiles/claude/.keep': '', 'home/x': '', 'p/x': '' });
    symlinkSync(join(root, 'repo/dotfiles/claude'), join(root, 'home/.claude'));
    const r = createRun(join(root, 'home'), join(root, 'p'), { now: () => AT });
    expect('diagnostic' in r && r.diagnostic.code).toBe('E_RUNS_IN_REPO');
  });

  it('accepts a store whose runs folder is a symlink to outside any repository, even though home sits inside one', () => {
    const root = makeTree({ 'home/.git/HEAD': '', 'home/.claude/aska/.keep': '', 'elsewhere/x': '', 'p/x': '' });
    symlinkSync(join(root, 'elsewhere'), join(root, 'home/.claude/aska/runs'));
    const { dir } = made(createRun(join(root, 'home'), join(root, 'p'), { now: () => AT }));
    expect(realpathSync(dirname(dir))).toBe(realpathSync(join(root, 'elsewhere')));
  });

  it('refuses a store inside a worktree, where .git is a file', () => {
    const root = makeTree({ 'wt/.git': 'gitdir: /elsewhere\n', 'p/x': '' });
    const r = createRun(join(root, 'wt/home'), join(root, 'p'), { now: () => AT });
    expect('diagnostic' in r && r.diagnostic.code).toBe('E_RUNS_IN_REPO');
  });

  it('accepts a store outside any repository, even when the project is a repository', () => {
    const root = makeTree({ 'proj/.git/HEAD': '', 'proj/x': '', 'home/x': '' });
    const { dir } = made(createRun(join(root, 'home'), join(root, 'proj'), { now: () => AT }));
    expect(dir.startsWith(runsRoot(join(root, 'home')))).toBe(true);
  });

  it('reports an unwritable root as E_RUNS_WRITE', () => {
    const root = makeTree({ 'home/.claude/aska': 'a file where a folder should be', 'p/x': '' });
    const r = createRun(join(root, 'home'), join(root, 'p'), { now: () => AT });
    expect('diagnostic' in r && r.diagnostic.code).toBe('E_RUNS_WRITE');
  });
});

describe('recordComparison', () => {
  it('tightens a run folder kept before 0.6.1 to 0700 when it is next recorded', () => {
    const root = makeTree({ 'p/x': '' });
    const { dir } = made(createRun(join(root, 'home'), join(root, 'p'), { now: () => AT }));
    chmodSync(dir, 0o775);
    expect(recordComparison(dir, comparison(), LATER)).toBeUndefined();
    expect(statSync(dir).mode & 0o777).toBe(0o700);
  });

  it('fills question, panel, panelists and comparedAt, and keeps everything else', () => {
    const root = makeTree({ 'p/x': '' });
    const { dir, meta } = made(createRun(join(root, 'home'), join(root, 'p'), { now: () => AT }));
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ ...meta, hostNote: 'kept' }));
    expect(recordComparison(dir, comparison(), LATER)).toBeUndefined();
    expect(readMeta(dir).meta).toEqual({
      ...meta,
      hostNote: 'kept',
      question: 'Ship?',
      panel: 'code',
      panelists: [
        { persona: 'aska:guardian', status: 'ok', verdict: 'proceed-with-conditions' },
        { persona: 'aska:skeptic', status: 'timeout', verdict: null },
      ],
      comparedAt: '2026-10-09T20:19:40.000Z',
    });
  });

  it('records again after a follow-up, keeping startedAt and the id', () => {
    const root = makeTree({ 'p/x': '' });
    const { dir, meta } = made(createRun(join(root, 'home'), join(root, 'p'), { now: () => AT }));
    recordComparison(dir, comparison(), LATER);
    const third = new Date('2026-10-09T21:00:00.000Z');
    recordComparison(dir, comparison({ panel: null, verdicts: [] }), third);
    const m = readMeta(dir).meta!;
    expect([m.id, m.startedAt, m.projectPath, m.source]).toEqual([meta.id, meta.startedAt, meta.projectPath, 'aska']);
    expect([m.panel, m.panelists, m.comparedAt]).toEqual([null, [], '2026-10-09T21:00:00.000Z']);
    expect(readdirSync(dir)).toEqual(['meta.json']);
  });

  it('returns a warning and writes nothing without an aska meta.json', () => {
    const none = makeTree({ 'r/panel-result.json': '{}' });
    expect(recordComparison(join(none, 'r'), comparison(), LATER)).toMatch(/not recording.*no meta\.json/);
    expect(readdirSync(join(none, 'r'))).toEqual(['panel-result.json']);
    const foreign = makeTree({ 'r/meta.json': JSON.stringify({ schemaVersion: 1, source: 'other' }) });
    expect(recordComparison(join(foreign, 'r'), comparison(), LATER)).toMatch(/not an aska run/);
    expect(JSON.parse(readFileSync(join(foreign, 'r/meta.json'), 'utf8'))).toEqual({ schemaVersion: 1, source: 'other' });
  });
});

describe('listRuns', () => {
  it('lists valid runs newest first with their path, and skips the rest', () => {
    const root = makeTree({ 'p/x': '' });
    const home = join(root, 'home');
    const older = made(createRun(home, join(root, 'p'), { now: () => AT, suffix: fixed('aaaaaa') }));
    const newer = made(createRun(home, join(root, 'p'), { now: () => LATER, suffix: fixed('bbbbbb') }));
    const r = runsRoot(home);
    mkdirSync(join(r, '20261009T220000Z-nometa'));                       // crash before meta.json
    mkdirSync(join(r, '20261009T230000Z-badjsn'));
    writeFileSync(join(r, '20261009T230000Z-badjsn/meta.json'), '{');
    mkdirSync(join(r, '20261009T231500Z-wrngid'));
    writeFileSync(join(r, '20261009T231500Z-wrngid/meta.json'), JSON.stringify({ ...older.meta }));
    writeFileSync(join(r, '20261009T235959Z-afile1'), 'not a folder');
    mkdirSync(join(r, 'not-a-run'));
    const { runs, skipped } = listRuns(home);
    expect(runs.map((x) => x.path)).toEqual([newer.dir, older.dir]);
    expect(runs[0]).toEqual({ ...newer.meta, path: newer.dir });
    expect(skipped.map((s) => s.path.slice(-23)).sort()).toEqual(['20261009T220000Z-nometa', '20261009T230000Z-badjsn', '20261009T231500Z-wrngid']);
    expect(skipped.every((s) => s.reason.length > 0)).toBe(true);
  });

  it('returns nothing when the root does not exist', () => {
    expect(listRuns(join(makeTree({ 'x': '' }), 'home'))).toEqual({ runs: [], skipped: [] });
  });

  it('skips a run whose question is not a string or null, and reports it on stderr-bound skipped', () => {
    const root = makeTree({ 'p/x': '' });
    const home = join(root, 'home');
    const { dir, meta } = made(createRun(home, join(root, 'p'), { now: () => AT }));
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ ...meta, question: 42, comparedAt: 'now' }));
    const { runs, skipped } = listRuns(home);
    expect(runs).toEqual([]);
    expect(skipped).toEqual([{ path: dir, reason: expect.stringContaining('missing a valid') }]);
  });

  it('skips a run with a malformed panelist row', () => {
    const root = makeTree({ 'p/x': '' });
    const home = join(root, 'home');
    const { dir, meta } = made(createRun(home, join(root, 'p'), { now: () => AT }));
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ ...meta, panelists: [{ persona: 'aska:guardian', status: 'ok' }] }));
    const { runs, skipped } = listRuns(home);
    expect(runs).toEqual([]);
    expect(skipped).toEqual([{ path: dir, reason: expect.stringContaining('missing a valid') }]);
  });

  it('orders two runs started in the same second by startedAt, not by id suffix', () => {
    const root = makeTree({ 'p/x': '' });
    const home = join(root, 'home');
    const first = made(createRun(home, join(root, 'p'), { now: () => AT, suffix: fixed('zzzzzz') }));
    const second = made(createRun(home, join(root, 'p'), { now: () => new Date(AT.getTime() + 1), suffix: fixed('aaaaaa') }));
    const { runs } = listRuns(home);
    expect(runs.map((r) => r.path)).toEqual([second.dir, first.dir]);
  });

  it('breaks an exact startedAt tie by id, descending', () => {
    const root = makeTree({ 'p/x': '' });
    const home = join(root, 'home');
    const first = made(createRun(home, join(root, 'p'), { now: () => AT, suffix: fixed('aaaaaa') }));
    const second = made(createRun(home, join(root, 'p'), { now: () => AT, suffix: fixed('zzzzzz') }));
    const { runs } = listRuns(home);
    expect(runs.map((r) => r.path)).toEqual([second.dir, first.dir]);
  });
});
