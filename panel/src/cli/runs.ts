import { formatDiagnostic } from '../diagnostics';
import { createRun, listRuns } from '../runs/store';
import type { CliEnv } from './main';

export function runsCmd(p: { cwd: string; command: 'new' | 'list'; json: boolean }, env: CliEnv): number {
  if (p.command === 'new') {
    const r = createRun(env.home, p.cwd, { now: env.now, env: env.runsEnv });
    if ('diagnostic' in r) {
      env.out(formatDiagnostic(r.diagnostic));
      return 1;
    }
    env.out(r.dir);
    return 0;
  }
  const { runs, skipped, diagnostic } = listRuns(env.home, env.runsEnv);
  if (diagnostic) {
    env.out(formatDiagnostic(diagnostic));
    return 1;
  }
  // Warnings go to stderr so `--json` stdout stays pure JSON.
  for (const s of skipped) (env.err ?? env.out)(`warning: skipped ${s.path}: ${s.reason}`);
  if (p.json) {
    env.out(JSON.stringify(runs, null, 2));
    return 0;
  }
  const width = env.columns ?? 80;
  for (const r of runs) {
    const what = r.comparedAt === null ? '(not compared)' : `${r.panel ?? 'ad-hoc'} ${(r.question ?? '').replace(/\s+/g, ' ')}`;
    const line = `${r.startedAt} ${r.id} ${what}`;
    env.out(line.length > width ? `${line.slice(0, width - 1)}…` : line);
  }
  return 0;
}
