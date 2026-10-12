import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from '../../src/cli/main';
import { renderPrompt } from '../../src/render/prompt';
import { exampleFiles, resolveExample } from '../helpers/example';
import { registryFor } from '../helpers/scopes';

function cli(stdin?: string, opts: { stdinIsTTY?: boolean } = {}) {
  const files = exampleFiles();
  const { root } = registryFor(files);
  const pluginListJson = JSON.stringify([{ id: 'acme@m', enabled: true, installPath: join(root, 'plugins/acme') }]);
  return {
    root,
    exec(...argv: string[]) {
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
    },
  };
}

const valid = {
  persona: 'example',
  verdict: 'proceed-with-conditions',
  conditions: ['Run the rollback in staging first'],
  findings: [{ unit: 'rollback-safety', severity: 'high', claim: 'No down-migration', evidence: 'migrations/004.sql drops a column' }],
  cleared: ['edge-cases'],
  not_applicable: [],
  sections: { 'Suggested checks': 'Restore a staging snapshot after migrating.' },
};

describe('persona prompt --panel', () => {
  it('prints exactly the panel prompt', () => {
    const r = cli().exec('prompt', 'example', '--panel');
    expect(r.code).toBe(0);
    expect(`${r.text}\n`).toBe(renderPrompt(resolveExample().effective, 'panel'));
  });

  it('fails for an unknown persona', () => {
    const r = cli().exec('prompt', 'nobody', '--panel');
    expect(r.code).toBe(1);
    expect(r.text).toContain('E_UNKNOWN_REF');
  });

  it('requires --panel, and rejects --panel elsewhere', () => {
    expect(cli().exec('prompt', 'example').code).toBe(2);
    expect(cli().exec('explain', 'example', '--panel').code).toBe(2);
  });
});

describe('persona check-judgment', () => {
  it('accepts a valid judgment from stdin', () => {
    const r = cli(JSON.stringify(valid)).exec('check-judgment', 'example');
    expect(r.code).toBe(0);
    expect(JSON.parse(r.text)).toEqual({ valid: true });
  });

  it('reports violations from a file', () => {
    const c = cli();
    const f = join(c.root, 'j.json');
    writeFileSync(f, JSON.stringify({ ...valid, verdict: 'maybe' }));
    const r = c.exec('check-judgment', 'example', '--file', f);
    expect(r.code).toBe(1);
    const out = JSON.parse(r.text) as { valid: boolean; violations: string[] };
    expect(out.valid).toBe(false);
    expect(out.violations.join('\n')).toContain('verdict must be one of');
  });

  it.each([
    ['prose', 'I think it should ship.', 'not valid JSON'],
    ['a fenced block', '```json\n{}\n```', 'not valid JSON'],
    ['empty input', '', 'no input'],
  ])('treats %s as invalid', (_label, input, message) => {
    const r = cli(input).exec('check-judgment', 'example');
    expect(r.code).toBe(1);
    expect(JSON.parse(r.text)).toEqual({ valid: false, violations: [message] });
  });

  it('fails clearly on an unreadable --file and an unknown persona', () => {
    const r = cli().exec('check-judgment', 'example', '--file', '/no/such/file.json');
    expect(r.code).toBe(1);
    expect(r.text).toContain('could not read /no/such/file.json');
    const u = cli(JSON.stringify(valid)).exec('check-judgment', 'nobody');
    expect(u.code).toBe(1);
    expect(u.text).toContain('E_UNKNOWN_REF');
  });

  it('restricts --file and --json to the commands that take them', () => {
    expect(cli().exec('validate', '--file', 'x').code).toBe(2);
    expect(cli().exec('check-judgment', 'example', '--json').code).toBe(2);
  });

  it('on a TTY with no --file, exits 2 with a hint instead of reading stdin', () => {
    const r = cli(undefined, { stdinIsTTY: true }).exec('check-judgment', 'example');
    expect(r.code).toBe(2);
    expect(r.text).toContain('pass --file <path> or pipe the JSON on stdin');
  });

  it('resolves the persona before the TTY check, so an unknown persona still reports its diagnostics', () => {
    const r = cli(undefined, { stdinIsTTY: true }).exec('check-judgment', 'nobody');
    expect(r.code).toBe(1);
    expect(r.text).toContain('E_UNKNOWN_REF');
  });

  it('a TTY does not block --file', () => {
    const c = cli(undefined, { stdinIsTTY: true });
    const f = join(c.root, 'j.json');
    writeFileSync(f, JSON.stringify(valid));
    const r = c.exec('check-judgment', 'example', '--file', f);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.text)).toEqual({ valid: true });
  });

  it('reports a stdin read error distinctly from empty input', () => {
    const files = exampleFiles();
    const { root } = registryFor(files);
    const pluginListJson = JSON.stringify([{ id: 'acme@m', enabled: true, installPath: join(root, 'plugins/acme') }]);
    const out: string[] = [];
    const code = run(['check-judgment', 'example'], {
      cwd: join(root, 'proj'),
      home: join(root, 'home'),
      pluginListJson,
      out: (s) => out.push(s),
      stdin: () => {
        throw Object.assign(new Error('resource temporarily unavailable'), { code: 'EAGAIN' });
      },
    });
    expect(code).toBe(1);
    expect(out.join('\n')).toBe('could not read stdin (EAGAIN)');
  });
});
