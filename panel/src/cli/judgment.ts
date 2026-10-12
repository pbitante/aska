import { readFileSync } from 'node:fs';
import { formatDiagnostic } from '../diagnostics';
import type { EffectivePersona } from '../model/effective';
import { validateEvidence } from '../evidence/validate';
import { parseTargetsFile, type Target } from '../gate/targets';
import { validateJudgment } from '../judgment/validate';
import { renderPrompt } from '../render/prompt';
import { resolvePersona } from '../resolve/resolve';
import type { Registry } from '../scopes/registry';
import type { CliEnv } from './main';

export function readInput(file: string | undefined, env: CliEnv): { text?: string; error?: string } {
  if (file !== undefined) {
    try {
      return { text: readFileSync(file, 'utf8') };
    } catch {
      return { error: `could not read ${file}` };
    }
  }
  try {
    return { text: env.stdin?.() ?? '' };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return { error: `could not read stdin${code ? ` (${code})` : ''}` };
  }
}

// A command that reads input needs either --file or something piped on stdin. Without --file,
// reading a real TTY would block silently until Ctrl-D (or forever), so refuse up front instead.
function missingInputSource(file: string | undefined, env: CliEnv): string | undefined {
  if (file === undefined && env.stdinIsTTY === true) return 'pass --file <path> or pipe the JSON on stdin';
  return undefined;
}

// Reads a targets file for --checks. A missing or invalid file is a command-line problem (exit 2):
// callers print nothing more and return 2 when this returns undefined.
export function loadTargets(path: string, env: CliEnv): Target[] | undefined {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    env.out(`could not read ${path}`);
    return undefined;
  }
  const r = parseTargetsFile(text);
  if ('error' in r) {
    env.out(`${path}: ${r.error}`);
    return undefined;
  }
  return r.targets;
}

// Resolves a persona and, with --checks, its targets. Prints the problem and returns an exit code
// when either fails.
function personaAndTargets(reg: Registry, name: string, checks: string | undefined, env: CliEnv): { effective: EffectivePersona; targets?: Target[] } | { code: number } {
  const r = resolvePersona(reg, name);
  if (!r.effective) {
    for (const d of r.diagnostics.filter((x) => x.level === 'error')) env.out(formatDiagnostic(d));
    return { code: 1 };
  }
  if (checks === undefined) return { effective: r.effective };
  const targets = loadTargets(checks, env);
  return targets === undefined ? { code: 2 } : { effective: r.effective, targets };
}

// Reads the input of a command that needs one, from --file or stdin. Prints the problem and
// returns an exit code when there is no input source or it can't be read.
export function readRequiredInput(file: string | undefined, env: CliEnv): { text: string } | { code: number } {
  const hint = missingInputSource(file, env);
  if (hint !== undefined) {
    env.out(hint);
    return { code: 2 };
  }
  const input = readInput(file, env);
  if (input.error) {
    env.out(input.error);
    return { code: 1 };
  }
  return { text: input.text ?? '' };
}

function reportValidity(violations: string[], env: CliEnv): number {
  env.out(JSON.stringify(violations.length === 0 ? { valid: true } : { valid: false, violations }, null, 2));
  return violations.length === 0 ? 0 : 1;
}

export function promptCmd(reg: Registry, name: string, env: CliEnv, checks?: string): number {
  const p = personaAndTargets(reg, name, checks, env);
  if ('code' in p) return p.code;
  env.out(renderPrompt(p.effective, 'panel', p.targets).replace(/\n$/, ''));
  return 0;
}

export function checkJudgmentCmd(reg: Registry, name: string, file: string | undefined, env: CliEnv, checks?: string): number {
  const p = personaAndTargets(reg, name, checks, env);
  if ('code' in p) return p.code;
  const input = readRequiredInput(file, env);
  if ('code' in input) return input.code;
  const text = input.text.trim();
  if (text === '') return reportValidity(['no input'], env);
  let judgment: unknown;
  try {
    judgment = JSON.parse(text);
  } catch {
    return reportValidity(['not valid JSON'], env);
  }
  return reportValidity(validateJudgment(p.effective, judgment, p.targets), env);
}

export function checkEvidenceCmd(file: string | undefined, env: CliEnv): number {
  const input = readRequiredInput(file, env);
  if ('code' in input) return input.code;
  return reportValidity(validateEvidence(input.text), env);
}
