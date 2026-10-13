import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from '../../src/cli/main';
import { exampleFiles } from '../helpers/example';
import { registryFor } from '../helpers/scopes';
import { mkdtemp } from '../helpers/tree';

const exampleJ = {
  persona: 'example', verdict: 'proceed-with-conditions', conditions: ['Run the rollback in staging first'],
  findings: [{ unit: 'rollback-safety', severity: 'high', claim: 'No down-migration', evidence: 'e' }],
  cleared: ['edge-cases'], not_applicable: [], sections: { 'Suggested checks': 'Restore a snapshot.' },
};
const baseJ = { persona: 'base', verdict: 'proceed', findings: [], cleared: ['scope-creep'], not_applicable: [] };

function cli(stdin?: string, opts: { stdinIsTTY?: boolean } = {}) {
  const { root } = registryFor(exampleFiles());
  const pluginListJson = JSON.stringify([{ id: 'acme@m', enabled: true, installPath: join(root, 'plugins/acme') }]);
  return (...argv: string[]) => {
    const out: string[] = [];
    const code = run(argv, {
      cwd: join(root, 'proj'),
      home: join(root, 'home'),
      pluginListJson,
      out: (s) => out.push(s),
      stdin: () => stdin,
      stdinIsTTY: opts.stdinIsTTY,
    });
    return { code, text: out.join('\n') };
  };
}

const panel = (panelists: unknown[]) => JSON.stringify({ question: 'Ship?', panel: null, panelists });

describe('persona compare', () => {
  it('prints a text comparison and exits 0 with two ok panelists', () => {
    const r = cli(panel([{ persona: 'example', status: 'ok', judgment: exampleJ }, { persona: 'base', status: 'ok', judgment: baseJ }]))('compare');
    expect(r.code).toBe(0);
    expect(r.text).toContain('Verdicts');
    expect(r.text).toContain('Where they disagree');
  });

  it('prints JSON with --json', () => {
    const r = cli(panel([{ persona: 'example', status: 'ok', judgment: exampleJ }, { persona: 'base', status: 'ok', judgment: baseJ }]))('compare', '--json');
    const c = JSON.parse(r.text) as { ok: boolean; verdicts: unknown[]; units: unknown[] };
    expect(c.ok).toBe(true);
    expect(Object.keys(c)).toEqual(['question', 'panel', 'verdicts', 'units', 'outsideScope', 'merged', 'followUps', 'ok', 'mixedModels']);
  });

  it('still prints verdicts and follow-ups, then exits 1, with fewer than 2 ok', () => {
    const r = cli(panel([{ persona: 'example', status: 'ok', judgment: exampleJ }, { persona: 'base', status: 'timeout', reason: 'timed out after 10 min' }]))('compare');
    expect(r.code).toBe(1);
    expect(r.text).toContain('base — timeout (timed out after 10 min)');
    expect(r.text).toContain('1. Re-run base');
    expect(r.text).toContain('not enough judgments to compare');
  });

  it('exits 1 with --json when fewer than 2 panelists are ok', () => {
    const r = cli(panel([{ persona: 'example', status: 'ok', judgment: exampleJ }, { persona: 'base', status: 'timeout', reason: 'timed out after 10 min' }]))('compare', '--json');
    expect(r.code).toBe(1);
    const c = JSON.parse(r.text) as { ok: boolean };
    expect(c.ok).toBe(false);
  });

  it('reads a valid panel result from --file', () => {
    const dir = mkdtemp('panel-');
    const file = join(dir, 'result.json');
    writeFileSync(file, panel([{ persona: 'example', status: 'ok', judgment: exampleJ }, { persona: 'base', status: 'ok', judgment: baseJ }]));
    const r = cli()('compare', '--file', file);
    expect(r.code).toBe(0);
    expect(r.text).toContain('Verdicts');
  });

  it('accepts a malformed panelist with no judgment, alongside two ok entries, and yields a re-run follow-up', () => {
    const r = cli(panel([
      { persona: 'example', status: 'ok', judgment: exampleJ },
      { persona: 'base', status: 'ok', judgment: baseJ },
      { persona: 'reader', status: 'malformed', violations: ['not valid JSON'] },
    ]))('compare');
    expect(r.code).toBe(0);
    expect(r.text).not.toContain('E_PANEL_RESULT');
    expect(r.text).toContain('reader — malformed (1 violation: not valid JSON)');
    expect(r.text).toContain('Re-run reader (1 violation: not valid JSON)');
  });

  it('rejects malformed panel results, including empty stdin', () => {
    for (const input of ['', 'nope', JSON.stringify({ question: 'q', panelists: [{ persona: 'x', status: 'late' }] })]) {
      const r = cli(input)('compare');
      expect(r.code).toBe(1);
      expect(r.text).toContain('E_PANEL_RESULT');
    }
  });

  it('rejects a name argument', () => {
    expect(cli()('compare', 'example').code).toBe(2);
  });

  it('on a TTY with no --file, exits 2 with a hint instead of reading stdin', () => {
    const r = cli(undefined, { stdinIsTTY: true })('compare');
    expect(r.code).toBe(2);
    expect(r.text).toContain('pass --file <path> or pipe the JSON on stdin');
  });

  it('a TTY does not block --file', () => {
    const r = cli(undefined, { stdinIsTTY: true })('compare', '--file', '/no/such/file.json');
    expect(r.code).toBe(1);
    expect(r.text).toContain('could not read /no/such/file.json');
  });
});
