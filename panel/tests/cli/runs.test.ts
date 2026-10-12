import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgv, run } from '../../src/cli/main';
import { RUN_ID, readMeta, runsRoot } from '../../src/runs/store';
import { exampleFiles } from '../helpers/example';
import { registryFor } from '../helpers/scopes';

const AT = new Date('2026-10-09T20:15:12.345Z');

function runsCli(now: () => Date = () => AT) {
  const { root } = registryFor(exampleFiles());
  const pluginListJson = JSON.stringify([{ id: 'acme@m', enabled: true, installPath: join(root, 'plugins/acme') }]);
  const home = join(root, 'home');
  const exec = (...argv: string[]) => {
    const out: string[] = [];
    const err: string[] = [];
    const code = run(argv, { cwd: join(root, 'proj'), home, pluginListJson, now, columns: 120, out: (s) => out.push(s), err: (s) => err.push(s) });
    return { code, out: out.join('\n'), err: err.join('\n') };
  };
  return { root, home, exec };
}

describe('persona runs new', () => {
  it('prints only the new folder path, and writes the initial meta.json', () => {
    const { root, home, exec } = runsCli();
    const r = exec('runs', 'new');
    expect(r.code).toBe(0);
    expect(r.out.split('\n')).toHaveLength(1);
    expect(isAbsolute(r.out)).toBe(true);
    expect(r.out.startsWith(runsRoot(home))).toBe(true);
    expect(r.out.split('/').pop()).toMatch(RUN_ID);
    const meta = JSON.parse(readFileSync(join(r.out, 'meta.json'), 'utf8'));
    expect(meta).toMatchObject({ schemaVersion: 1, source: 'aska', projectPath: join(root, 'proj'), comparedAt: null, startedAt: AT.toISOString() });
  });

  it('honours --cwd for projectPath', () => {
    const { root, exec } = runsCli();
    mkdirSync(join(root, 'other'));
    const r = exec('runs', 'new', '--cwd', join(root, 'other'));
    expect(JSON.parse(readFileSync(join(r.out, 'meta.json'), 'utf8')).projectPath).toBe(join(root, 'other'));
  });

  it('exits 1 with E_RUNS_WRITE when the store cannot be created', () => {
    const { home, exec } = runsCli();
    mkdirSync(join(home, '.claude'), { recursive: true });
    writeFileSync(join(home, '.claude/aska'), 'a file');
    const r = exec('runs', 'new');
    expect(r.code).toBe(1);
    expect(r.out).toContain('E_RUNS_WRITE');
  });
});

describe('persona runs list', () => {
  it('prints [] with --json and nothing in text when there are no runs', () => {
    const { exec } = runsCli();
    expect(exec('runs', 'list', '--json')).toMatchObject({ code: 0, out: '[]' });
    expect(exec('runs', 'list')).toMatchObject({ code: 0, out: '' });
  });

  it('lists runs newest first as JSON with path, warning about bad folders on stderr only', () => {
    let t = AT;
    const { home, exec } = runsCli(() => t);
    const first = exec('runs', 'new').out;
    t = new Date('2026-10-09T21:00:00.000Z');
    const second = exec('runs', 'new').out;
    mkdirSync(join(runsRoot(home), '20261009T220000Z-nometa'));
    const r = exec('runs', 'list', '--json');
    expect(r.code).toBe(0);
    const rows = JSON.parse(r.out) as { path: string; id: string }[];
    expect(rows.map((x) => x.path)).toEqual([second, first]);
    expect(r.err).toContain('20261009T220000Z-nometa');
    expect(r.err).toContain('no meta.json');
  });

  it('skips a run with an invalid meta.json in text mode, still lists the good run, exit 0, warns on stderr', () => {
    const { home, exec } = runsCli();
    const good = exec('runs', 'new').out;
    const bad = exec('runs', 'new').out;
    const meta = JSON.parse(readFileSync(join(bad, 'meta.json'), 'utf8'));
    writeFileSync(join(bad, 'meta.json'), JSON.stringify({ ...meta, question: 42, comparedAt: 'x' }));
    const r = exec('runs', 'list');
    expect(r.code).toBe(0);
    expect(r.out.split('\n')).toHaveLength(1);
    expect(r.out).toContain(good.split('/').pop());
    expect(r.err).toMatch(/warning: skipped .*missing a valid/);
  });

  it('prints one line per run, collapsing a multi-line question and cutting to the width', () => {
    const { exec } = runsCli();
    const dir = exec('runs', 'new').out;
    const fresh = exec('runs', 'list').out;
    expect(fresh).toContain('(not compared)');
    const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ ...meta, question: 'Is this\nsafe to ship with a very long question that runs well past the right edge of the terminal?', panel: null, comparedAt: AT.toISOString() }));
    const line = exec('runs', 'list').out;
    expect(line.split('\n')).toHaveLength(1);
    expect(line).toContain('ad-hoc Is this safe');
    expect(line.length).toBeLessThanOrEqual(120);
    expect(line.endsWith('…')).toBe(true);
  });
});

describe('runs argument parsing', () => {
  it('parses runs new and runs list as their own kind, so no plugin data is fetched', () => {
    expect(parseArgv(['runs', 'new'], '/proj')).toEqual({ kind: 'runs', cwd: '/proj', command: 'new', json: false });
    expect(parseArgv(['runs', 'list', '--json'], '/proj')).toEqual({ kind: 'runs', cwd: '/proj', command: 'list', json: true });
  });

  it('rejects bad runs invocations with usage (exit 2)', () => {
    const { exec } = runsCli();
    for (const argv of [
      ['runs'], ['runs', 'foo'], ['runs', 'new', 'extra'], ['runs', 'new', '--json'],
      ['runs', 'list', '--file', 'x'], ['runs', 'list', '--scope', 'user'], ['runs', 'list', '--force'], ['runs', 'new', '--record'],
      ['runs', 'new', '--checks', 'x'], ['runs', 'list', '--from', 'x'], ['runs', 'list', '--out', 'x'],
    ]) {
      const r = exec(...argv);
      expect(r.code, argv.join(' ')).toBe(2);
      expect(r.out, argv.join(' ')).toContain('usage: persona');
    }
  });

  it('documents runs new and runs list in the usage text', () => {
    const { exec } = runsCli();
    const help = exec('--help').out;
    expect(help).toContain('runs new');
    expect(help).toContain('runs list [--json]');
  });
});

const exampleJ = {
  persona: 'example', verdict: 'proceed-with-conditions', conditions: ['Run the rollback in staging first'],
  findings: [{ unit: 'rollback-safety', severity: 'high', claim: 'No down-migration', evidence: 'e' }],
  cleared: ['edge-cases'], not_applicable: [], sections: { 'Suggested checks': 'Restore a snapshot.' },
};
const baseJ = { persona: 'base', verdict: 'proceed', findings: [], cleared: ['scope-creep'], not_applicable: [] };
const twoOk = [{ persona: 'example', status: 'ok', judgment: exampleJ }, { persona: 'base', status: 'ok', judgment: baseJ }];
const oneOk = [{ persona: 'example', status: 'ok', judgment: exampleJ }, { persona: 'base', status: 'timeout', reason: 'timed out after 10 min' }];
const writeResult = (dir: string, panelists: unknown[]) =>
  writeFileSync(join(dir, 'panel-result.json'), JSON.stringify({ question: 'Ship?', panel: 'code', panelists }));

describe('persona compare --record', () => {
  it('updates meta.json without changing stdout or the exit code (ok)', () => {
    const { exec } = runsCli();
    const dir = exec('runs', 'new').out;
    writeResult(dir, twoOk);
    const file = join(dir, 'panel-result.json');
    const plain = exec('compare', '--file', file, '--json');
    expect(readMeta(dir).meta!.comparedAt).toBeNull();          // plain compare never records
    const recorded = exec('compare', '--file', file, '--json', '--record');
    expect(recorded.code).toBe(0);
    expect(recorded.out).toBe(plain.out);
    expect(recorded.err).toBe('');
    expect(readMeta(dir).meta).toMatchObject({
      question: 'Ship?', panel: 'code', comparedAt: AT.toISOString(),
      panelists: [
        { persona: 'example', status: 'ok', verdict: 'proceed-with-conditions' },
        { persona: 'base', status: 'ok', verdict: 'proceed' },
      ],
    });
  });

  it('records an ok:false comparison and still exits 1', () => {
    const { exec } = runsCli();
    const dir = exec('runs', 'new').out;
    writeResult(dir, oneOk);
    const r = exec('compare', '--file', join(dir, 'panel-result.json'), '--json', '--record');
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).ok).toBe(false);
    expect(readMeta(dir).meta!.panelists).toEqual([
      { persona: 'example', status: 'ok', verdict: 'proceed-with-conditions' },
      { persona: 'base', status: 'timeout', verdict: null },
    ]);
  });

  it('records through a relative --file resolved from the caller cwd', () => {
    const { root, exec } = runsCli();
    const dir = exec('runs', 'new').out;
    writeResult(dir, twoOk);
    const rel = relative(join(root, 'proj'), join(dir, 'panel-result.json'));
    expect(exec('compare', '--file', rel, '--json', '--record').code).toBe(0);
    expect(readMeta(dir).meta!.comparedAt).toBe(AT.toISOString());
  });

  it('warns on stderr and leaves files alone in a folder that is not a kept run', () => {
    const { root, exec } = runsCli();
    const dir = join(root, 'tmp-run');
    mkdirSync(dir);
    writeResult(dir, twoOk);
    const r = exec('compare', '--file', join(dir, 'panel-result.json'), '--json', '--record');
    expect(r.code).toBe(0);
    expect(() => JSON.parse(r.out)).not.toThrow();
    expect(r.err).toMatch(/not recording/);
    expect(readFileSync(join(dir, 'panel-result.json'), 'utf8')).toContain('Ship?');
    expect(() => readFileSync(join(dir, 'meta.json'))).toThrow();
  });

  it('rejects --record without --file, and on other commands', () => {
    const { exec } = runsCli();
    expect(exec('compare', '--record').code).toBe(2);
    expect(exec('compare', '--record').out).toContain('--record needs --file');
    expect(exec('list', '--record').code).toBe(2);
    expect(exec('show', 'persona', 'example', '--record').code).toBe(2);
  });
});
