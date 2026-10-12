// Token use and cost for one source (a review, a panel run, an eval run), read from Claude Code
// transcripts or `stream-json` output. See evals/cost/README.md.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface Tokens { input: number; cacheWrite5m: number; cacheWrite1h: number; cacheRead: number; output: number }

export interface SourceCost {
  byModel: Record<string, Tokens & { inputEquivalent: number }>;
  inputEquivalent: number;
  // From a `stream-json` result event; null for a transcript, which records no dollar cost.
  usd: number | null;
}

const ZERO: Tokens = { input: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0 };
const KEYS = Object.keys(ZERO) as (keyof Tokens)[];

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function parse(line: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(line);
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function tokensOf(usage: Record<string, unknown>): Tokens {
  const written = num(usage.cache_creation_input_tokens);
  const split = usage.cache_creation as Record<string, unknown> | undefined;
  const w1h = split ? num(split.ephemeral_1h_input_tokens) : 0;
  return {
    input: num(usage.input_tokens),
    cacheWrite5m: split ? num(split.ephemeral_5m_input_tokens) : written,
    cacheWrite1h: w1h,
    cacheRead: num(usage.cache_read_input_tokens),
    output: num(usage.output_tokens),
  };
}

/**
 * Sums assistant-message usage per model. A message streams as several lines that share its id,
 * each with the counts so far, so each id counts once, with the largest value of each field.
 */
export function tokensByModel(lines: Iterable<string>): Map<string, Tokens> {
  const byId = new Map<string, { model: string; t: Tokens }>();
  for (const line of lines) {
    const e = parse(line);
    if (e?.type !== 'assistant') continue;
    const m = e.message as Record<string, unknown> | undefined;
    if (typeof m?.id !== 'string' || typeof m.usage !== 'object' || m.usage === null) continue;
    const t = tokensOf(m.usage as Record<string, unknown>);
    const prev = byId.get(m.id);
    if (prev) for (const k of KEYS) prev.t[k] = Math.max(prev.t[k], t[k]);
    else byId.set(m.id, { model: typeof m.model === 'string' ? m.model : 'unknown', t });
  }
  const out = new Map<string, Tokens>();
  for (const { model, t } of byId.values()) {
    const sum = out.get(model) ?? { ...ZERO };
    for (const k of KEYS) sum[k] += t[k];
    out.set(model, sum);
  }
  return out;
}

/** Tokens at the input price: cache writes 1.25× (5 min) or 2× (1 h), cache reads 0.1×, output 5×. */
export function inputEquivalent(t: Tokens): number {
  return t.input + 1.25 * t.cacheWrite5m + 2 * t.cacheWrite1h + 0.1 * t.cacheRead + 5 * t.output;
}

/**
 * Per-model totals from a `stream-json` result event. Its `modelUsage` doesn't split cache writes
 * by lifetime, so they're split in the proportion the event's own `usage` shows (all 5-minute
 * when it shows none).
 */
function resultTokens(e: Record<string, unknown>): Map<string, Tokens> | null {
  const mu = e.modelUsage as Record<string, Record<string, unknown>> | undefined;
  if (typeof mu !== 'object' || mu === null) return null;
  const split = (e.usage as Record<string, unknown> | undefined)?.cache_creation as Record<string, unknown> | undefined;
  const w5 = num(split?.ephemeral_5m_input_tokens);
  const w1 = num(split?.ephemeral_1h_input_tokens);
  const share1h = w5 + w1 > 0 ? w1 / (w5 + w1) : 0;
  const out = new Map<string, Tokens>();
  for (const [model, u] of Object.entries(mu)) {
    const written = num(u.cacheCreationInputTokens);
    out.set(model, {
      input: num(u.inputTokens),
      cacheWrite5m: written * (1 - share1h),
      cacheWrite1h: written * share1h,
      cacheRead: num(u.cacheReadInputTokens),
      output: num(u.outputTokens),
    });
  }
  return out;
}

/**
 * One source's cost. A `stream-json` result event, when there is one, is the whole run's total:
 * its streamed assistant messages carry only the output counted when each message started.
 */
export function sourceCost(lines: string[]): SourceCost {
  let usd: number | null = null;
  let fromResult: Map<string, Tokens> | null = null;
  for (const line of lines) {
    const e = parse(line);
    if (e?.type !== 'result') continue;
    if (typeof e.total_cost_usd === 'number') usd = e.total_cost_usd;
    fromResult = resultTokens(e) ?? fromResult;
  }
  const byModel: SourceCost['byModel'] = {};
  let total = 0;
  for (const [model, t] of fromResult ?? tokensByModel(lines)) {
    if (KEYS.every((k) => t[k] === 0)) continue;
    const ie = inputEquivalent(t);
    byModel[model] = { ...t, inputEquivalent: ie };
    total += ie;
  }
  return { byModel, inputEquivalent: total, usd };
}

/** A transcript file, plus its sub-agents' transcripts in `<stem>/subagents/*.jsonl` when there are any. */
export function sourceFiles(path: string): string[] {
  const sub = join(path.replace(/\.jsonl$/, ''), 'subagents');
  if (!path.endsWith('.jsonl') || !existsSync(sub)) return [path];
  return [path, ...readdirSync(sub).filter((f) => f.endsWith('.jsonl')).sort().map((f) => join(sub, f))];
}

/** One line for a run's log: `cost: 271k input-equivalent, $0.53 (claude-sonnet-5)`. */
export function costLine(c: SourceCost): string {
  const usd = c.usd === null ? '' : `, $${c.usd.toFixed(2)}`;
  const models = Object.keys(c.byModel);
  return `cost: ${Math.round(c.inputEquivalent / 1000)}k input-equivalent${usd}${models.length > 0 ? ` (${models.join(', ')})` : ''}`;
}
