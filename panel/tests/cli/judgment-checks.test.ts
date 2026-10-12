import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from '../../src/cli/main';
import { renderPrompt } from '../../src/render/prompt';
import { exampleFiles, resolveExample } from '../helpers/example';
import { registryFor } from '../helpers/scopes';

const targets = [{ id: 'T1', text: 'empty input' }];
const judgment = {
  persona: 'example',
  verdict: 'stop',
  findings: [{ unit: 'edge-cases', severity: 'high', claim: 'hangs', evidence: 'ran it', check: 'T1' }],
  cleared: ['rollback-safety'],
  not_applicable: [],
  sections: { 'Suggested checks': 'x' },
  checks: [{ id: 'T1', status: 'broken', evidence: 'it hung' }],
};

function setup() {
  const { root } = registryFor(exampleFiles());
  const tmp = mkdtempSync(join(tmpdir(), 'judgment-checks-'));
  writeFileSync(join(tmp, 'targets.json'), JSON.stringify({ source: 's.md', targets }));
  writeFileSync(join(tmp, 'bad-targets.json'), '{"targets":[]}');
  writeFileSync(join(tmp, 'judgment.json'), JSON.stringify(judgment));
  const pluginListJson = JSON.stringify([{ id: 'acme@m', enabled: true, installPath: join(root, 'plugins/acme') }]);
  const exec = (...argv: string[]) => {
    const out: string[] = [];
    const code = run(argv, { cwd: join(root, 'proj'), home: join(root, 'home'), pluginListJson, out: (s) => out.push(s) });
    return { code, text: out.join('\n') };
  };
  return { tmp, exec };
}

describe('--checks on prompt and check-judgment', () => {
  it('prompt --panel --checks prints the prompt with targets', () => {
    const { tmp, exec } = setup();
    const r = exec('prompt', 'example', '--panel', '--checks', join(tmp, 'targets.json'));
    expect(r.code).toBe(0);
    expect(`${r.text}\n`).toBe(renderPrompt(resolveExample().effective, 'panel', targets));
  });

  it('check-judgment --checks validates against the targets', () => {
    const { tmp, exec } = setup();
    const ok = exec('check-judgment', 'example', '--file', join(tmp, 'judgment.json'), '--checks', join(tmp, 'targets.json'));
    expect(ok).toEqual({ code: 0, text: JSON.stringify({ valid: true }, null, 2) });
    const without = exec('check-judgment', 'example', '--file', join(tmp, 'judgment.json'));
    expect(without.code).toBe(1);
    expect(without.text).toContain('checks is only allowed when a targets file is given');
  });

  it('exits 2 naming an unreadable or invalid targets file', () => {
    const { tmp, exec } = setup();
    const missing = exec('check-judgment', 'example', '--file', join(tmp, 'judgment.json'), '--checks', join(tmp, 'nope.json'));
    expect(missing).toEqual({ code: 2, text: `could not read ${join(tmp, 'nope.json')}` });
    const bad = exec('prompt', 'example', '--panel', '--checks', join(tmp, 'bad-targets.json'));
    expect(bad).toEqual({ code: 2, text: `${join(tmp, 'bad-targets.json')}: the targets file needs a non-empty "targets" list` });
  });

  it('rejects --checks without --panel, and on other commands', () => {
    const { tmp, exec } = setup();
    expect(exec('prompt', 'example', '--checks', join(tmp, 'targets.json')).code).toBe(2);
    expect(exec('validate', '--checks', join(tmp, 'targets.json')).code).toBe(2);
    expect(exec('--help').text).toContain('--checks <targets.json>');
  });
});
