import { readFileSync } from 'node:fs';
import { writeAtomic } from '../fs';
import { extractTargets } from '../gate/targets';
import { formatGate, gateResult } from '../gate/result';
import { validateJudgment } from '../judgment/validate';
import { resolvePersona } from '../resolve/resolve';
import type { Registry } from '../scopes/registry';
import { loadTargets, readInput } from './judgment';
import type { CliEnv } from './main';

export function targetsCmd(from: string, fromGiven: string, out: string | undefined, env: CliEnv): number {
  let md: string;
  try {
    md = readFileSync(from, 'utf8');
  } catch {
    env.out(`could not read ${from}`);
    return 1;
  }
  const r = extractTargets(md);
  if ('error' in r) {
    env.out(r.error === 'no-section'
      ? `${fromGiven} has no "## Adversarial review targets" section`
      : `${fromGiven}: the "## Adversarial review targets" section has no bullets`);
    return 1;
  }
  const json = JSON.stringify({ source: fromGiven, targets: r.targets }, null, 2);
  if (out === undefined) {
    env.out(json);
    return 0;
  }
  try {
    writeAtomic(out, `${json}\n`);
  } catch {
    env.out(`could not write ${out}`);
    return 1;
  }
  env.out(`wrote ${r.targets.length} targets to ${out}`);
  return 0;
}

export function gateCmd(reg: Registry, name: string, file: string, checks: string, json: boolean, env: CliEnv): number {
  // A file that can't be read gives no result (exit 2), never a fail: with --json, an error object.
  const say = json ? (message: string) => env.out(JSON.stringify({ error: message }, null, 2)) : env.out;
  const targets = loadTargets(checks, { ...env, out: say });
  if (targets === undefined) return 2;
  const input = readInput(file, env);
  if (input.error) {
    say(input.error);
    return 2;
  }
  const violations: string[] = [];
  let judgment: unknown;
  const text = (input.text ?? '').trim();
  if (text === '') violations.push('no input');
  else {
    try {
      judgment = JSON.parse(text);
    } catch {
      violations.push('not valid JSON');
    }
  }
  if (violations.length === 0) {
    // The persona comes from the command line, never from the judgment: a judgment that names
    // another persona must fail here exactly as `check-judgment <name>` rejects it.
    const r = resolvePersona(reg, name);
    if (!r.effective) violations.push(`persona "${name}" does not resolve`);
    else violations.push(...validateJudgment(r.effective, judgment, targets));
  }
  const result = gateResult(judgment, violations, targets);
  env.out(json ? JSON.stringify(result, null, 2) : formatGate(result, judgment));
  return result.result === 'fail' ? 1 : 0;
}
