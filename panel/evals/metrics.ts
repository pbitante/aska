const RANK = ['low', 'medium', 'high', 'critical'];

export type Status = 'flagged' | 'not-flagged';

export interface Judgment {
  verdict: string;
  findings: { unit: string; severity: string }[];
}

/**
 * A `findings` entry that is `null` (or any other non-object) crashes `statusOf`/
 * `maxSeverity` when they read `f.unit`/`f.severity` — e.g. `null.unit` throws, well after
 * every paid `claude` call has already happened. A reply shaped like that can't be read as
 * metrics input at all, so callers must reject it (as unparseable) before it ever reaches
 * `validateJudgment` or `distance`, rather than letting it through as a merely "invalid" one.
 */
export function isJudgmentShape(v: unknown): v is Judgment {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  if (typeof obj.verdict !== 'string' || !Array.isArray(obj.findings)) return false;
  return obj.findings.every((f) => typeof f === 'object' && f !== null);
}

export function statusOf(j: Judgment, unit: string): Status {
  return j.findings.some((f) => f.unit === unit) ? 'flagged' : 'not-flagged';
}

export function maxSeverity(j: Judgment, unit: string): string | undefined {
  const ranks = j.findings.filter((f) => f.unit === unit).map((f) => RANK.indexOf(f.severity));
  return ranks.length > 0 ? RANK[Math.max(...ranks)] : undefined;
}

export function distance(a: Judgment, b: Judgment, shared: string[]): number {
  let diff = a.verdict === b.verdict ? 0 : 1;
  for (const u of shared) {
    const sa = statusOf(a, u);
    if (sa !== statusOf(b, u)) diff += 1;
    else if (sa === 'flagged' && maxSeverity(a, u) !== maxSeverity(b, u)) diff += 0.5;
  }
  return diff / (shared.length + 1);
}

export function meanPairwise(xs: Judgment[], ys: Judgment[] | undefined, shared: string[]): number {
  const ds: number[] = [];
  if (ys === undefined) {
    for (let i = 0; i < xs.length; i++) for (let k = i + 1; k < xs.length; k++) ds.push(distance(xs[i]!, xs[k]!, shared));
  } else {
    for (const x of xs) for (const y of ys) ds.push(distance(x, y, shared));
  }
  return ds.length === 0 ? 0 : ds.reduce((s, d) => s + d, 0) / ds.length;
}

export function outsideScopeRate(js: Judgment[]): number {
  const all = js.flatMap((j) => j.findings);
  return all.length === 0 ? 0 : all.filter((f) => f.unit === 'outside-scope').length / all.length;
}

/**
 * Only findings on `scored` units count, in both the numerator and the
 * denominator — otherwise a deprioritized unit (whose effective threshold is
 * always `critical`) makes every valid finding on it count as "at threshold"
 * by construction, skewing the rate for one persona but not the other.
 */
export function atThresholdRate(js: Judgment[], thresholds: Map<string, string>, scored: Iterable<string>): number {
  const scoredSet = new Set(scored);
  const all = js.flatMap((j) => j.findings).filter((f) => scoredSet.has(f.unit));
  return all.length === 0 ? 0 : all.filter((f) => thresholds.get(f.unit) === f.severity).length / all.length;
}

export function passes(between: number, within: number): boolean {
  return between >= 0.25 && between >= 2 * within;
}

/**
 * A compliant, unfenced reply can contain a string value that itself
 * holds a triple-backtick fence (e.g. quoted SQL as evidence). Try plain
 * JSON first so that common case never goes near the fence regex. Only
 * fall back to fence-stripping, then to slicing the first `{` to the last
 * `}`, for replies that aren't already valid JSON on their own — and feed
 * that same slice fallback a failed fence extraction too, since a fence
 * capture can itself be truncated by a backtick sequence inside a string.
 */
export function parseJudgmentText(text: string): unknown {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```/i);
  if (fenced) candidates.push(fenced[1]!.trim());
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(trimmed.slice(first, last + 1));

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

// The command line of evals/run.ts. Kept here, apart from run.ts, so it can be tested without a
// paid run: a missing value must never swallow the next flag (`--model --dry-run`).
export interface EvalArgs {
  k: string;
  model: string;
  dryRun: boolean;
}

export function parseEvalArgs(argv: string[]): EvalArgs {
  let k: string | undefined;
  let model = 'sonnet';
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--dry-run') {
      dryRun = true;
      continue;
    }
    const m = a.match(/^--(k|model)(?:=(.*))?$/);
    if (!m) throw new Error(`unrecognized argument "${a}"`);
    const name = m[1] as 'k' | 'model';
    let value = m[2];
    if (value === undefined) {
      // The next token might be another flag (e.g. `--model --dry-run`), not a value.
      // Treat that the same as a missing value instead of swallowing the next flag.
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) throw new Error(`--${name} requires a value`);
      value = next;
      i++;
    }
    if (name === 'k') k = value;
    else model = value;
  }
  return { k: k ?? '3', model, dryRun };
}

export type ParsedK = { ok: true; value: number } | { ok: false; error: string };

/** `--k` must be an integer ≥ 2: K=1 makes every within-persona pairwise distance 0 by construction. */
export function parseK(raw: string | undefined): ParsedK {
  if (raw === undefined || !/^\d+$/.test(raw)) {
    return { ok: false, error: `--k must be an integer ≥ 2, got ${raw === undefined ? '(none)' : JSON.stringify(raw)}` };
  }
  const value = Number(raw);
  if (value < 2) return { ok: false, error: `--k must be an integer ≥ 2, got ${value}` };
  return { ok: true, value };
}

const MIN_PARSEABLE_PER_CELL = 2;
const MAX_INVALID_RATE = 0.2;

/**
 * A reply is "parseable" once `parseJudgmentText` returns something with
 * a string `verdict` and a `findings` array — whether or not it also passes
 * `validateJudgment`. `invalid` is the subset of `parseable` that failed
 * validation; it no longer excludes a reply from `within`/`between` (that
 * selection-on-validity is exactly what let a persona-blind model pass by
 * having the validator filter different replies for each persona).
 * `unparseable` (no `verdict`/`findings`, or not JSON at all) and
 * `callErrors` (the `claude` invocation itself failed) are excluded from
 * the metrics and only gate `inconclusive` via `MIN_PARSEABLE_PER_CELL`.
 */
export interface CellCounts {
  scenario: string;
  persona: string;
  parseable: number;
  invalid: number;
  unparseable: number;
  callErrors: number;
}

type Verdict = 'pass' | 'fail' | 'inconclusive';

export interface VerdictResult {
  verdict: Verdict;
  reasons: string[];
}

/**
 * Pure decision over the summary a real run produces. Kept separate from
 * `run.ts` so the degenerate cases that let a persona-blind model pass are
 * unit-testable without spawning `claude`.
 */
export function verdictFor(input: { cells: CellCounts[]; within: number; between: number }): VerdictResult {
  const sparse = input.cells.filter((c) => c.parseable < MIN_PARSEABLE_PER_CELL);
  if (sparse.length > 0) {
    return {
      verdict: 'inconclusive',
      reasons: sparse.map((c) => `${c.persona} × ${c.scenario}: ${c.parseable} parseable reply(ies), need ≥ ${MIN_PARSEABLE_PER_CELL}`),
    };
  }

  const byPersona = new Map<string, { parseable: number; invalid: number }>();
  for (const c of input.cells) {
    const agg = byPersona.get(c.persona) ?? { parseable: 0, invalid: 0 };
    agg.parseable += c.parseable;
    agg.invalid += c.invalid;
    byPersona.set(c.persona, agg);
  }
  const overRate: string[] = [];
  for (const [persona, agg] of byPersona) {
    const rate = agg.parseable === 0 ? 0 : agg.invalid / agg.parseable;
    if (rate > MAX_INVALID_RATE) {
      overRate.push(`${persona}: invalid rate ${(rate * 100).toFixed(0)}% exceeds ${MAX_INVALID_RATE * 100}%`);
    }
  }
  if (overRate.length > 0) return { verdict: 'inconclusive', reasons: overRate };

  if (passes(input.between, input.within)) {
    return { verdict: 'pass', reasons: [`between ${input.between.toFixed(3)} ≥ 0.25 and ≥ 2× within ${input.within.toFixed(3)}`] };
  }
  return { verdict: 'fail', reasons: [`between ${input.between.toFixed(3)} did not clear 0.25 and 2× within ${input.within.toFixed(3)}`] };
}
