import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgv, run } from '../../src/cli/main';
import { exampleFiles } from '../helpers/example';
import { registryFor } from '../helpers/scopes';

function exec(cwd: string, ...argv: string[]) {
  const out: string[] = [];
  const code = run(argv, { cwd, home: join(cwd, 'home'), pluginListJson: '[]', out: (s) => out.push(s) });
  return { code, text: out.join('\n') };
}

function dir(): string {
  const d = mkdtempSync(join(tmpdir(), 'gate-cli-'));
  writeFileSync(join(d, 'step.md'), '# Step\n\n## Adversarial review targets\n\n- one\n- two:\n  - a\n  - b\n');
  writeFileSync(join(d, 'none.md'), '# Nothing here\n');
  writeFileSync(join(d, 'empty.md'), '## Adversarial review targets\n\nTBD\n');
  return d;
}

describe('persona targets', () => {
  it('prints the targets as JSON with the source as given', () => {
    const d = dir();
    const r = exec(d, 'targets', '--from', 'step.md');
    expect(r.code).toBe(0);
    expect(JSON.parse(r.text)).toEqual({
      source: 'step.md',
      targets: [{ id: 'T1', text: 'one' }, { id: 'T2.1', text: 'two — a' }, { id: 'T2.2', text: 'two — b' }],
    });
    expect(r.text).toBe(JSON.stringify(JSON.parse(r.text), null, 2));
  });

  it('writes --out and says so', () => {
    const d = dir();
    const r = exec(d, 'targets', '--from', 'step.md', '--out', 'targets.json');
    expect(r.code).toBe(0);
    expect(r.text).toBe(`wrote 3 targets to ${join(d, 'targets.json')}`);
    expect(JSON.parse(readFileSync(join(d, 'targets.json'), 'utf8')).targets).toHaveLength(3);
  });

  it('fails cleanly when --out cannot be written', () => {
    const d = dir();
    const r = exec(d, 'targets', '--from', 'step.md', '--out', 'missing-dir/targets.json');
    expect(r.code).toBe(1);
    expect(r.text).toBe(`could not write ${join(d, 'missing-dir/targets.json')}`);
    expect(existsSync(join(d, 'missing-dir'))).toBe(false);
  });

  it('exits 1 naming the file for an unreadable file, no section, or no bullets', () => {
    const d = dir();
    expect(exec(d, 'targets', '--from', 'nope.md')).toEqual({ code: 1, text: `could not read ${join(d, 'nope.md')}` });
    expect(exec(d, 'targets', '--from', 'none.md')).toEqual({ code: 1, text: 'none.md has no "## Adversarial review targets" section' });
    expect(exec(d, 'targets', '--from', 'empty.md')).toEqual({ code: 1, text: 'empty.md: the "## Adversarial review targets" section has no bullets' });
  });

  it('leaves no .tmp file behind when the rename fails', () => {
    const d = dir();
    mkdirSync(join(d, 'adir'));
    const r = exec(d, 'targets', '--from', 'step.md', '--out', 'adir');
    expect(r.code).toBe(1);
    expect(r.text).toBe(`could not write ${join(d, 'adir')}`);
    expect(readdirSync(d).some((e) => e.includes('.tmp-'))).toBe(false);
  });

  it('rejects --out equal to --from as a usage error', () => {
    const d = dir();
    const r = exec(d, 'targets', '--from', 'step.md', '--out', 'step.md');
    expect(r.code).toBe(2);
    expect(readFileSync(join(d, 'step.md'), 'utf8')).toContain('Adversarial review targets');
  });

  it('enforces its argument rules', () => {
    const d = dir();
    expect(exec(d, 'targets').code).toBe(2);
    expect(exec(d, 'targets', 'x', '--from', 'step.md').code).toBe(2);
    expect(exec(d, 'targets', '--from', 'step.md', '--json').code).toBe(2);
    expect(exec(d, 'targets', '--from', 'step.md', '--file', 'x').code).toBe(2);
    expect(exec(d, 'targets', '--from', 'step.md', '--checks', 'x').code).toBe(2);
    expect(exec(d, 'targets', '--from').code).toBe(2);
    expect(exec(d, 'list', '--from', 'step.md').code).toBe(2);
    expect(exec(d, 'list', '--out', 'x').code).toBe(2);
    expect(exec(d, '--help').text).toContain('targets --from <file.md>');
  });

  it('is a command that needs no plugin data', () => {
    const p = parseArgv(['targets', '--from', 'step.md'], '/tmp');
    expect(p).toMatchObject({ kind: 'command', command: 'targets', from: '/tmp/step.md', fromGiven: 'step.md' });
  });
});

describe('persona gate', () => {
  const targets = [{ id: 'T1', text: 'empty input' }, { id: 'T2', text: 'rollback' }];
  const valid = {
    persona: 'example',
    verdict: 'proceed',
    findings: [],
    cleared: ['edge-cases', 'rollback-safety'],
    not_applicable: [],
    sections: { 'Suggested checks': 'x' },
    checks: [{ id: 'T1', status: 'holds', evidence: 'ran it' }, { id: 'T2', status: 'holds', evidence: 'ran it' }],
  };

  function setup(judgment: unknown) {
    const { root } = registryFor(exampleFiles());
    const tmp = mkdtempSync(join(tmpdir(), 'gate-cmd-'));
    writeFileSync(join(tmp, 't.json'), JSON.stringify({ source: 's.md', targets }));
    writeFileSync(join(tmp, 'j.json'), typeof judgment === 'string' ? judgment : JSON.stringify(judgment));
    const pluginListJson = JSON.stringify([{ id: 'acme@m', enabled: true, installPath: join(root, 'plugins/acme') }]);
    const exec3 = (argv: string[]) => {
      const out: string[] = [];
      const code = run(argv, { cwd: join(root, 'proj'), home: join(root, 'home'), pluginListJson, out: (s) => out.push(s) });
      return { code, text: out.join('\n') };
    };
    const files = ['--file', join(tmp, 'j.json'), '--checks', join(tmp, 't.json')];
    // `name` undefined leaves the persona out, so gate falls back to its default.
    const goAs = (name: string | undefined, ...extra: string[]) => exec3(['gate', ...(name === undefined ? [] : [name]), ...files, ...extra]);
    const go = (...extra: string[]) => goAs('example', ...extra);
    const checkJudgment = (name: string) => exec3(['check-judgment', name, ...files]);
    return { tmp, go, goAs, checkJudgment };
  }

  it('passes a valid judgment where every target holds', () => {
    expect(setup(valid).go()).toEqual({ code: 0, text: 'PASS' });
    const r = setup(valid).go('--json');
    expect(r.code).toBe(0);
    expect(JSON.parse(r.text)).toEqual({ result: 'pass', broken: [], deferred: [], conditions: [], findings_outside_targets: [], violations: [] });
  });

  it('passes with conditions on a deferred target (exit 0)', () => {
    const j = { ...valid, checks: [valid.checks[0], { id: 'T2', status: 'deferred', evidence: 'x', needs: 'prod data' }] };
    expect(setup(j).go()).toEqual({ code: 0, text: 'PASS WITH CONDITIONS — T2 deferred (needs: prod data)\n\nDeferred:\n- T2: prod data' });
  });

  it('fails on a broken target (exit 1)', () => {
    const j = {
      ...valid,
      verdict: 'stop',
      findings: [{ unit: 'edge-cases', severity: 'high', claim: 'hangs', evidence: 'e', check: 'T1' }],
      cleared: ['rollback-safety'],
      checks: [{ id: 'T1', status: 'broken', evidence: 'x' }, valid.checks[1]],
    };
    const r = setup(j).go();
    expect(r.code).toBe(1);
    expect(r.text.split('\n')[0]).toBe('FAIL — T1 broken (high: hangs); verdict stop');
  });

  it('fails an invalid judgment even when it says proceed and every target holds', () => {
    const r = setup({ ...valid, cleared: [] }).go();
    expect(r.code).toBe(1);
    expect(r.text).toContain('FAIL — invalid judgment');
    expect(r.text).toContain('primary concern edge-cases must appear');
  });

  it('turns odd input into violations, never a crash', () => {
    for (const [input, violation] of [
      ['null', 'the judgment must be a JSON object'],
      ['[]', 'the judgment must be a JSON object'],
      ['"text"', 'the judgment must be a JSON object'],
      ['{}', 'persona must be "example"'],
      ['', 'no input'],
      ['not json', 'not valid JSON'],
    ] as const) {
      const r = setup(input).go('--json');
      expect(r.code, input).toBe(1);
      expect(JSON.parse(r.text).violations, input).toContain(violation);
    }
  });

  const forBase = {
    persona: 'base',
    verdict: 'proceed',
    findings: [],
    cleared: ['scope-creep'],
    not_applicable: [],
    sections: {},
    checks: valid.checks,
  };

  it('judges against the named persona, never the persona the judgment names', () => {
    expect(setup(forBase).goAs('base').code).toBe(0);
    const r = setup(forBase).goAs('example', '--json');
    expect(r.code).toBe(1);
    const out = JSON.parse(r.text) as { result: string; violations: string[] };
    expect(out.result).toBe('fail');
    expect(out.violations).toContain('persona must be "example"');
  });

  it('judges as the gate persona when no name is given', () => {
    const r = setup(valid).goAs(undefined, '--json');
    expect(r.code).toBe(1);
    expect(JSON.parse(r.text).violations).toContain('persona "gate" does not resolve');
  });

  it('fails whenever check-judgment rejects the same judgment', () => {
    for (const j of [valid, forBase, { ...valid, cleared: [] }, { ...valid, persona: 'nobody' }, {}, null]) {
      const s = setup(j);
      const checked = s.checkJudgment('example').code;
      const gated = s.go().code;
      expect(gated === 1, JSON.stringify(j)).toBe(checked !== 0);
    }
  });

  it('gives no result for an unreadable --file or --checks: exit 2, and an error object with --json', () => {
    const { tmp } = setup(valid);
    const go = (...argv: string[]) => {
      const out: string[] = [];
      const code = run(['gate', ...argv, '--json'], { cwd: tmp, home: join(tmp, 'home'), pluginListJson: '[]', out: (s) => out.push(s) });
      return { code, json: JSON.parse(out.join('\n')) };
    };
    const nope = join(tmp, 'nope.json');
    expect(go('--file', nope, '--checks', join(tmp, 't.json'))).toEqual({ code: 2, json: { error: `could not read ${nope}` } });
    expect(go('--file', join(tmp, 'j.json'), '--checks', nope)).toEqual({ code: 2, json: { error: `could not read ${nope}` } });
    writeFileSync(join(tmp, 'bad.json'), '{}');
    expect(go('--file', join(tmp, 'j.json'), '--checks', join(tmp, 'bad.json'))).toEqual({
      code: 2, json: { error: `${join(tmp, 'bad.json')}: the targets file needs a non-empty "targets" list` },
    });
  });

  it('enforces its argument rules and file errors', () => {
    const { tmp, go } = setup(valid);
    const exec2 = (...argv: string[]) => {
      const out: string[] = [];
      return { code: run(argv, { cwd: tmp, home: join(tmp, 'home'), pluginListJson: '[]', out: (s) => out.push(s) }), text: out.join('\n') };
    };
    expect(exec2('gate', '--checks', join(tmp, 't.json')).code).toBe(2);
    expect(exec2('gate', '--file', join(tmp, 'j.json')).code).toBe(2);
    expect(exec2('gate', 'x', 'y', '--file', join(tmp, 'j.json'), '--checks', join(tmp, 't.json')).code).toBe(2);
    expect(exec2('gate', '--file', join(tmp, 'j.json'), '--checks', join(tmp, 'nope.json'))).toEqual({ code: 2, text: `could not read ${join(tmp, 'nope.json')}` });
    expect(exec2('gate', '--file', join(tmp, 'nope.json'), '--checks', join(tmp, 't.json'))).toEqual({ code: 2, text: `could not read ${join(tmp, 'nope.json')}` });
    expect(exec2('--help').text).toContain('gate [<name>] --file <judgment.json> --checks <targets.json> [--json]');
    expect(go().code).toBe(0);
  });
});
