import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateJudgment } from '../src/judgment/validate';
import { effectiveThreshold, type EffectivePersona } from '../src/model/effective';
import { TIERS, type Tier } from '../src/model/types';
import { renderPrompt } from '../src/render/prompt';
import { resolvePersona } from '../src/resolve/resolve';
import { Registry } from '../src/scopes/registry';
import {
  atThresholdRate,
  isJudgmentShape,
  meanPairwise,
  outsideScopeRate,
  parseJudgmentText,
  parseEvalArgs,
  parseK,
  verdictFor,
  type CellCounts,
  type EvalArgs,
  type Judgment,
} from './metrics';

const here = dirname(fileURLToPath(import.meta.url));

let args: EvalArgs;
try {
  args = parseEvalArgs(process.argv.slice(2));
} catch (e) {
  console.error(`Usage error: ${(e as Error).message}`);
  console.error('Usage: npx tsx evals/run.ts [--k <integer ≥ 2>] [--model <name>] [--dry-run]');
  process.exit(1);
}
const kResult = parseK(args.k);
if (!kResult.ok) {
  console.error(`Usage error: ${kResult.error}`);
  process.exit(1);
}
const K = kResult.value;
const { model, dryRun } = args;

const reg = new Registry([{ kind: 'project', root: join(here, 'pool', '.claude') }]);
const personas: EffectivePersona[] = ['guardian', 'accelerator'].map((n) => {
  const r = resolvePersona(reg, n);
  if (!r.effective || r.diagnostics.some((d) => d.level === 'error')) {
    console.error(`persona ${n} failed to resolve:`, r.diagnostics);
    process.exit(1);
  }
  return r.effective;
});
const [guardian, accelerator] = personas as [EffectivePersona, EffectivePersona];
const active = (p: EffectivePersona) => TIERS.flatMap((t) => p.units[t].map((u) => u.canonical));
const shared = active(guardian).filter((u) => active(accelerator).includes(u));
const thresholds = (p: EffectivePersona) => new Map(TIERS.flatMap((t) => p.units[t].map((u) => [u.canonical, effectiveThreshold(u)] as const)));
const tierOf = (p: EffectivePersona, unit: string): Tier | undefined => TIERS.find((t) => p.units[t].some((u) => u.canonical === unit));
const scoredUnits = (p: EffectivePersona) => shared.filter((u) => tierOf(p, u) !== 'deprioritized');

if (dryRun) {
  for (const p of personas) console.log(`===== ${p.name} (panel prompt) =====\n${renderPrompt(p, 'panel')}`);
  console.log(`shared units: ${shared.join(', ')}`);
  process.exit(0);
}

// Each call runs in a fresh, empty temp directory with every ambient setting
// source turned off, so the user/project CLAUDE.md, auto-memory, plugin hooks and
// MCP servers on the machine running the eval cannot leak into the judgment. See
// evals/README.md for what each flag disables.
const ISOLATION_FLAGS = ['--safe-mode', '--setting-sources', '', '--strict-mcp-config', '--no-session-persistence'];

function spawnClaude(systemPrompt: string, prompt: string): ReturnType<typeof spawnSync> {
  const dir = mkdtempSync(join(tmpdir(), 'persona-eval-'));
  try {
    return spawnSync(
      'claude',
      ['-p', '--system-prompt', systemPrompt, '--tools', '', '--output-format', 'json', '--model', model, ...ISOLATION_FLAGS, prompt],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 10 * 60 * 1000, cwd: dir },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

interface Outcome {
  // `judgment` is set for every *parseable* reply (has a verdict string and a findings
  // array), whether or not it also passes `validateJudgment` — within/between are computed
  // over this whole set, never just the subset each persona's validator happens to keep.
  judgment?: Judgment;
  // Set alongside `judgment` when validateJudgment found problems; reported, and capped by
  // MAX_INVALID_RATE, but no longer excluded from the metrics.
  violations?: string[];
  // A reply that parsed as JSON but had no verdict/findings, or wasn't JSON at all. Excluded
  // from the metrics and counted separately (never silently dropped).
  unparseable?: string;
  // The `claude` invocation itself failed (non-zero exit, spawn error, or an is_error envelope).
  callError?: string;
}

// No retry. A malformed/invalid first attempt is the result; retrying would resample until
// something survives each persona's filter while keeping the counted rate low, which is how a
// persona-blind model could pass.
function ask(p: EffectivePersona, scenario: string): Outcome {
  const prompt = `${scenario}\n\nGive your judgment.`;
  const r = spawnClaude(renderPrompt(p, 'panel'), prompt);
  if (r.error || r.status !== 0) {
    const detail = r.error ? r.error.message : (r.stderr ?? '').slice(0, 500);
    return { callError: `claude exited ${r.status ?? 'null'}: ${detail}` };
  }
  try {
    const envelope = JSON.parse(r.stdout as string) as { result?: string; is_error?: boolean };
    if (envelope.is_error) return { callError: `claude reported is_error: ${(envelope.result ?? '').slice(0, 500)}` };
    const parsed = parseJudgmentText(envelope.result ?? '');
    if (!isJudgmentShape(parsed)) return { unparseable: 'reply has no verdict string, findings array, or has a non-object findings entry' };
    const violations = validateJudgment(p, parsed);
    return violations.length > 0 ? { judgment: parsed, violations } : { judgment: parsed };
  } catch (e) {
    return { unparseable: `unparseable output: ${(e as Error).message}` };
  }
}

const kindOf = (o: Outcome): 'valid' | 'invalid' | 'unparseable' | 'call-error' =>
  o.callError !== undefined ? 'call-error' : o.unparseable !== undefined ? 'unparseable' : o.violations !== undefined ? 'invalid' : 'valid';

const scenarioDir = join(here, 'scenarios');
const scenarios = readdirSync(scenarioDir).filter((f) => f.endsWith('.md')).sort();
const results: Record<string, Record<string, Outcome[]>> = {};
for (const s of scenarios) {
  const text = readFileSync(join(scenarioDir, s), 'utf8');
  results[s] = {};
  for (const p of personas) {
    results[s][p.name] = [];
    for (let k = 0; k < K; k++) {
      process.stdout.write(`${s} × ${p.name} run ${k + 1}/${K}... `);
      const o = ask(p, text);
      results[s][p.name]!.push(o);
      const label = !o.judgment
        ? o.callError
          ? `CALL ERROR (${o.callError.slice(0, 80)})`
          : `UNPARSEABLE (${o.unparseable})`
        : o.violations
          ? `${o.judgment.verdict} [invalid: ${o.violations[0]}]`
          : o.judgment.verdict;
      console.log(label);
    }
  }
}

// Every paid call has happened by this point. Write the raw results before computing
// anything else, so a bug in the metrics phase (as n3 found: a null findings entry crashed
// statusOf) can never lose the data every call was paid for.
mkdirSync(join(here, 'results'), { recursive: true });
const out = join(here, 'results', `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(out, JSON.stringify({ results }, null, 2));

let verdict: 'pass' | 'fail' | 'inconclusive';
try {
  // within/between are computed over every parseable reply, valid or invalid — see
  // evals/metrics.ts for why selecting on validateJudgment let a persona-blind model pass.
  const parseableJudgments = (s: string, p: EffectivePersona) => results[s]![p.name]!.flatMap((o) => (o.judgment ? [o.judgment] : []));
  const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
  const within = mean(scenarios.flatMap((s) => personas.map((p) => meanPairwise(parseableJudgments(s, p), undefined, shared))));
  const between = mean(scenarios.map((s) => meanPairwise(parseableJudgments(s, guardian), parseableJudgments(s, accelerator), shared)));

  const cells: CellCounts[] = scenarios.flatMap((s) =>
    personas.map((p) => {
      const outcomes = results[s]![p.name]!;
      return {
        scenario: s,
        persona: p.name,
        parseable: outcomes.filter((o) => kindOf(o) === 'valid' || kindOf(o) === 'invalid').length,
        invalid: outcomes.filter((o) => kindOf(o) === 'invalid').length,
        unparseable: outcomes.filter((o) => kindOf(o) === 'unparseable').length,
        callErrors: outcomes.filter((o) => kindOf(o) === 'call-error').length,
      };
    }),
  );

  const result = verdictFor({ cells, within, between });
  verdict = result.verdict;

  console.log('\nPer scenario × persona (parseable/invalid/unparseable/call-errors out of K):');
  for (const s of scenarios) {
    console.log(`  ${s}: between ${meanPairwise(parseableJudgments(s, guardian), parseableJudgments(s, accelerator), shared).toFixed(3)}`);
    for (const p of personas) {
      const c = cells.find((cc) => cc.scenario === s && cc.persona === p.name)!;
      console.log(
        `    ${p.name}: ${c.parseable}/${K} parseable (${c.invalid} invalid), ${c.unparseable} unparseable, ${c.callErrors} call error(s)` +
          ` (within ${meanPairwise(parseableJudgments(s, p), undefined, shared).toFixed(3)})`,
      );
    }
  }

  const summary = {
    model,
    k: K,
    shared,
    within,
    between,
    verdict: result.verdict,
    reasons: result.reasons,
    cells,
    outsideScope: Object.fromEntries(personas.map((p) => [p.name, outsideScopeRate(scenarios.flatMap((s) => parseableJudgments(s, p)))])),
    atThreshold: Object.fromEntries(
      personas.map((p) => [p.name, atThresholdRate(scenarios.flatMap((s) => parseableJudgments(s, p)), thresholds(p), scoredUnits(p))]),
    ),
  };

  console.log('\n', JSON.stringify(summary, null, 2));
  writeFileSync(out, JSON.stringify({ summary, results }, null, 2));
} catch (e) {
  console.error(`\nFatal: metrics computation failed after every call already completed: ${(e as Error).message}`);
  console.error(`Raw results (no summary) were already written to ${out}.`);
  process.exit(1);
}

console.log(`wrote ${out}`);
process.exit(verdict === 'pass' ? 0 : verdict === 'inconclusive' ? 2 : 1);
