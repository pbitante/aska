import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgv, run } from '../../src/cli/main';

const good = '## Checked\nWhether the tests pass.\n\n## Ran\n- `npm test`: 722 passed.\n\n## Found\nThey pass.\n\n## Not determined\nNothing\n';

function exec(argv: string[], stdin?: string, stdinIsTTY?: boolean) {
  const out: string[] = [];
  const code = run(argv, { cwd: tmpdir(), home: tmpdir(), out: (s) => out.push(s), stdin: () => stdin, stdinIsTTY });
  return { code, text: out.join('\n') };
}

describe('persona check-evidence', () => {
  it('accepts valid evidence from a file', () => {
    const f = join(mkdtempSync(join(tmpdir(), 'aska-evidence-')), '1.md');
    writeFileSync(f, good);
    const r = exec(['check-evidence', '--file', f]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.text)).toEqual({ valid: true });
  });

  it('reports violations from stdin with exit code 1', () => {
    const r = exec(['check-evidence'], 'Looks safe to merge.');
    expect(r.code).toBe(1);
    const out = JSON.parse(r.text) as { valid: boolean; violations: string[] };
    expect(out.valid).toBe(false);
    expect(out.violations).toContain('missing section "## Found"');
  });

  it('reports an unreadable file', () => {
    const r = exec(['check-evidence', '--file', join(tmpdir(), 'no-such-evidence-file.md')]);
    expect(r.code).toBe(1);
    expect(r.text).toContain('could not read');
  });

  it('refuses to wait on a TTY without --file', () => {
    const r = exec(['check-evidence'], undefined, true);
    expect(r.code).toBe(2);
    expect(r.text).toContain('pass --file <path>');
  });

  it('takes no name and no other options', () => {
    expect(exec(['check-evidence', 'tester']).code).toBe(2);
    expect(exec(['check-evidence', '--json']).code).toBe(2);
    expect(exec(['check-evidence', '--record']).code).toBe(2);
    for (const flag of ['--checks', '--from', '--out']) expect(exec(['check-evidence', flag, 'x.json']).code, flag).toBe(2);
  });

  it('needs no persona or plugin data', () => {
    expect(parseArgv(['check-evidence', '--file', 'e.md'], '/tmp')).toEqual({ kind: 'evidence', file: '/tmp/e.md' });
  });

  it('is listed in the usage text', () => {
    expect(exec(['--help']).text).toContain('check-evidence [--file <path>]');
  });
});
