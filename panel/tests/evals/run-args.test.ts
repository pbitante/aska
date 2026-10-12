import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseEvalArgs } from '../../evals/metrics';
import { mkdtemp } from '../helpers/tree';

const repo = fileURLToPath(new URL('../..', import.meta.url));

describe('evals/run.ts arguments', () => {
  it('reads --k, --model and --dry-run, in both --flag value and --flag=value forms', () => {
    expect(parseEvalArgs([])).toEqual({ k: '3', model: 'sonnet', dryRun: false });
    expect(parseEvalArgs(['--k', '5', '--model=opus', '--dry-run'])).toEqual({ k: '5', model: 'opus', dryRun: true });
  });

  it('rejects a missing value instead of swallowing the next flag, and unknown arguments', () => {
    expect(() => parseEvalArgs(['--model', '--dry-run'])).toThrow('--model requires a value');
    expect(() => parseEvalArgs(['--k'])).toThrow('--k requires a value');
    expect(() => parseEvalArgs(['--runs', '3'])).toThrow('unrecognized argument "--runs"');
  });

  it('exits 1 on a bad --k, and never runs claude for a bad command line or --dry-run', () => {
    const bin = mkdtemp('fake-claude-bin-');
    const marker = join(bin, 'ran');
    writeFileSync(join(bin, 'claude'), `#!/bin/sh\ntouch "${marker}"\necho '{}'\n`, { mode: 0o755 });
    const evalRun = (...argv: string[]) =>
      spawnSync(process.execPath, ['--import', 'tsx', join(repo, 'evals/run.ts'), ...argv], {
        cwd: repo,
        encoding: 'utf8',
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
        timeout: 60_000,
      });
    expect(evalRun('--k', '1').status).toBe(1);
    expect(evalRun('--model', '--dry-run').status).toBe(1);
    const dry = evalRun('--dry-run', '--k', '2');
    expect(dry.status, dry.stderr).toBe(0);
    expect(existsSync(marker)).toBe(false);
  }, 120_000);
});
