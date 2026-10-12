import { describe, expect, it } from 'vitest';
import {
  atThresholdRate,
  distance,
  isJudgmentShape,
  maxSeverity,
  meanPairwise,
  outsideScopeRate,
  parseJudgmentText,
  parseK,
  passes,
  statusOf,
  verdictFor,
  type CellCounts,
  type Judgment,
} from '../../evals/metrics';

const j = (verdict: string, findings: [string, string][]): Judgment => ({ verdict, findings: findings.map(([unit, severity]) => ({ unit, severity })) });
const shared = ['a', 'b', 'c'];

describe('eval metrics', () => {
  it('reads status and max severity', () => {
    const x = j('stop', [['a', 'medium'], ['a', 'high']]);
    expect(statusOf(x, 'a')).toBe('flagged');
    expect(statusOf(x, 'b')).toBe('not-flagged');
    expect(maxSeverity(x, 'a')).toBe('high');
    expect(maxSeverity(x, 'b')).toBeUndefined();
  });

  it('treats cleared and absent the same: a cleared unit has no effect on distance', () => {
    const x = j('stop', [['a', 'high']]) as Judgment & { cleared?: string[] };
    const y = j('stop', [['a', 'high']]) as Judgment & { cleared?: string[] };
    y.cleared = ['b'];
    expect(distance(x, y, shared)).toBe(0);
  });

  it('computes distance over shared units plus verdict', () => {
    const x = j('stop', [['a', 'high'], ['b', 'low']]);
    const y = j('proceed', [['a', 'medium']]);
    // a: both flagged, different max severity → 0.5; b: flagged vs not → 1; c: same → 0; verdict differs → 1
    expect(distance(x, y, shared)).toBeCloseTo(2.5 / 4);
    expect(distance(x, x, shared)).toBe(0);
  });

  it('averages pairwise distances within and between groups', () => {
    const x = j('stop', [['a', 'high']]);
    const y = j('proceed', []);
    expect(meanPairwise([x, x, y], undefined, shared)).toBeCloseTo((0 + 0.5 + 0.5) / 3);
    expect(meanPairwise([x], [y, x], shared)).toBeCloseTo((0.5 + 0) / 2);
    expect(meanPairwise([x], undefined, shared)).toBe(0);
  });

  it('cannot pass when both personas behave identically', () => {
    const runs = [j('stop', [['a', 'high']]), j('proceed', [])];
    const within = meanPairwise(runs, undefined, shared);
    const between = meanPairwise(runs, runs, shared);
    expect(passes(between, within)).toBe(false);
  });

  it('passes only with a large, clear gap', () => {
    expect(passes(0.6, 0.2)).toBe(true);
    expect(passes(0.6, 0.31)).toBe(false);
    expect(passes(0.2, 0)).toBe(false);
  });

  it('passes at the exact boundary', () => {
    expect(passes(0.25, 0)).toBe(true);
    expect(passes(0.5, 0.25)).toBe(true);
    expect(passes(0.24999, 0)).toBe(false);
    expect(passes(0.5, 0.25001)).toBe(false);
  });

  it('reports outside-scope and at-threshold rates, scored over shared non-deprioritized units only', () => {
    const js = [j('stop', [['outside-scope', 'critical'], ['a', 'medium']]), j('proceed', [['b', 'high']])];
    expect(outsideScopeRate(js)).toBeCloseTo(1 / 3);
    expect(atThresholdRate(js, new Map([['a', 'medium'], ['b', 'low']]), ['a', 'b'])).toBeCloseTo(1 / 2);
    expect(outsideScopeRate([])).toBe(0);
    // a deprioritized unit (always thresholded at "critical") is excluded from both numerator and denominator
    // when it is not in `scored`, instead of inflating the rate for whichever persona deprioritizes it.
    const deprioritized = [j('stop', [['edge-cases', 'critical']])];
    expect(atThresholdRate(deprioritized, new Map([['edge-cases', 'critical']]), ['a', 'b'])).toBe(0);
    expect(atThresholdRate(deprioritized, new Map([['edge-cases', 'critical']]), ['edge-cases'])).toBe(1);
  });

  it('parses judgment text with or without a code fence', () => {
    expect(parseJudgmentText('{"verdict":"stop"}')).toEqual({ verdict: 'stop' });
    expect(parseJudgmentText('```json\n{"verdict":"stop"}\n```')).toEqual({ verdict: 'stop' });
    expect(parseJudgmentText('```\n{"verdict":"stop"}\n```')).toEqual({ verdict: 'stop' });
    expect(parseJudgmentText('```JSON\n{"verdict":"stop"}\n```')).toEqual({ verdict: 'stop' });
    expect(parseJudgmentText('```json {"verdict":"stop"}```')).toEqual({ verdict: 'stop' });
    expect(parseJudgmentText('```json\r\n{"verdict":"stop"}\r\n```')).toEqual({ verdict: 'stop' });
    expect(parseJudgmentText('Here is my judgment:\n```json\n{"verdict":"stop"}\n```\nLet me know if you need more.')).toEqual({ verdict: 'stop' });
    expect(parseJudgmentText('Judgment:\n{"verdict":"stop"}')).toEqual({ verdict: 'stop' });
    expect(() => parseJudgmentText('')).toThrow();
    expect(() => parseJudgmentText('no json here')).toThrow();
  });

  it('parses compliant plain JSON even when a string value itself contains a fence', () => {
    const judgment = {
      persona: 'guardian',
      verdict: 'stop',
      findings: [{ unit: 'rollback-safety', severity: 'high', claim: 'x', evidence: 'Reported as ```sql SELECT 1``` in the migration.' }],
      cleared: [],
      not_applicable: [],
    };
    // Plain, unfenced JSON — JSON.parse(trimmed) must succeed directly, never touching the
    // fence regex, which would otherwise grab only up to the first backtick run inside the string.
    expect(parseJudgmentText(JSON.stringify(judgment))).toEqual(judgment);
  });

  it('falls back to a full-text brace slice when a fence capture is truncated by an inner fence', () => {
    const judgment = {
      verdict: 'stop',
      findings: [{ unit: 'a', severity: 'high', claim: 'x', evidence: 'inner ```fenced``` text' }],
    };
    const wrapped = '```json\n' + JSON.stringify(judgment) + '\n```';
    // The lazy fence regex alone would stop at the inner ``` inside the evidence string and
    // throw on the truncated capture; the {…} slice over the whole text recovers the real object.
    expect(parseJudgmentText(wrapped)).toEqual(judgment);
  });

  it('rejects a findings entry that is null or otherwise not an object, instead of crashing later', () => {
    // A null (or other non-object) findings entry crashes statusOf/maxSeverity when they read
    // f.unit/f.severity — isJudgmentShape must catch this before the reply is ever treated as a
    // usable judgment, so the caller can count it as unparseable instead.
    expect(isJudgmentShape({ verdict: 'proceed', findings: [null] })).toBe(false);
    expect(isJudgmentShape({ verdict: 'proceed', findings: ['not an object'] })).toBe(false);
    expect(isJudgmentShape({ verdict: 'proceed', findings: [42] })).toBe(false);
    expect(isJudgmentShape({ verdict: 'proceed', findings: [{ unit: 'a', severity: 'high' }, null] })).toBe(false);
    expect(isJudgmentShape({ verdict: 'proceed', findings: [{ unit: 'a', severity: 'high' }] })).toBe(true);
    expect(isJudgmentShape({ verdict: 'proceed', findings: [] })).toBe(true);
    expect(isJudgmentShape({ verdict: 'proceed' })).toBe(false);
    expect(isJudgmentShape({ findings: [] })).toBe(false);
    expect(isJudgmentShape(null)).toBe(false);
    expect(isJudgmentShape('not an object')).toBe(false);
  });

  it('parseK rejects anything but a plain integer ≥ 2', () => {
    expect(parseK('3')).toEqual({ ok: true, value: 3 });
    expect(parseK('2')).toEqual({ ok: true, value: 2 });
    expect(parseK('1').ok).toBe(false);
    expect(parseK('0').ok).toBe(false);
    expect(parseK('-1').ok).toBe(false);
    expect(parseK('3.5').ok).toBe(false);
    expect(parseK('abc').ok).toBe(false);
    expect(parseK(undefined).ok).toBe(false);
  });

  describe('verdictFor', () => {
    const cell = (persona: string, scenario: string, parseable: number, invalid = 0, unparseable = 0, callErrors = 0): CellCounts => ({
      persona,
      scenario,
      parseable,
      invalid,
      unparseable,
      callErrors,
    });

    it('is inconclusive, not a pass, when any cell has fewer than 2 parseable replies (K=1 degenerate case)', () => {
      const cells = [cell('guardian', 's1', 1), cell('accelerator', 's1', 1)];
      const r = verdictFor({ cells, within: 0, between: 0.9 });
      expect(r.verdict).toBe('inconclusive');
      expect(r.reasons.join(' ')).toMatch(/1 parseable/);
    });

    it('is inconclusive when a persona has fewer than 2 parseable replies in just one scenario cell', () => {
      const cells = [cell('guardian', 's1', 3), cell('guardian', 's2', 1), cell('accelerator', 's1', 3), cell('accelerator', 's2', 3)];
      expect(verdictFor({ cells, within: 0, between: 0.9 }).verdict).toBe('inconclusive');
    });

    it('is inconclusive when one persona exceeds the 20% invalid-rate cap, even with a healthy-looking gap', () => {
      const cells = [cell('guardian', 's1', 5, 0), cell('accelerator', 's1', 5, 3)];
      const r = verdictFor({ cells, within: 0.1, between: 0.6 });
      expect(r.verdict).toBe('inconclusive');
      expect(r.reasons.join(' ')).toMatch(/accelerator.*invalid rate/);
    });

    it('passes only with enough parseable samples, a low invalid rate, and a clear between/within gap', () => {
      const cells = [cell('guardian', 's1', 3), cell('accelerator', 's1', 3)];
      expect(verdictFor({ cells, within: 0.1, between: 0.6 }).verdict).toBe('pass');
    });

    it('fails (not inconclusive) when samples are healthy but the gap never clears', () => {
      const cells = [cell('guardian', 's1', 3), cell('accelerator', 's1', 3)];
      expect(verdictFor({ cells, within: 0.1, between: 0.1 }).verdict).toBe('fail');
    });

    it('cannot pass when both personas behave identically, via verdictFor end to end', () => {
      const runs = [j('stop', [['a', 'high']]), j('proceed', [])];
      const within = meanPairwise(runs, undefined, shared);
      const between = meanPairwise(runs, runs, shared);
      const cells = [cell('guardian', 's1', runs.length), cell('accelerator', 's1', runs.length)];
      expect(verdictFor({ cells, within, between }).verdict).not.toBe('pass');
    });

    it('a persona-blind model cannot pass by having the validator keep different replies per persona, once every parseable reply counts', () => {
      // One blind generator draws from three templates.
      // T1 (rollback-safety at medium) is valid for guardian but invalid for accelerator (threshold
      // high); T2 (user-value + scope-creep at medium) is valid for accelerator but invalid for
      // guardian (threshold high on user-value). Selecting on validity — keeping only the replies
      // that pass each persona's own validator — would make guardian's sample lean toward
      // T0/T1 and accelerator's lean toward T0/T2, inflating `between` from a model that never
      // looked at the persona at all. Counting every parseable reply instead removes that lever:
      // both personas see literally the same pool, so `between` cannot clear the pass bar.
      const sharedUnits = ['rollback-safety', 'edge-cases', 'scope-creep', 'user-value'];
      const t0 = j('proceed', []);
      const t1 = j('proceed', [['rollback-safety', 'medium']]);
      const t2 = j('proceed-with-conditions', [['user-value', 'medium'], ['scope-creep', 'medium']]);
      const pool = [t0, t0, t0, t1, t2];
      const within = meanPairwise(pool, undefined, sharedUnits);
      const between = meanPairwise(pool, pool, sharedUnits);
      expect(within).toBeCloseTo(0.32);
      expect(between).toBeCloseTo(0.256);

      // Exactly one of five replies (20%) is invalid for each persona — t2 for guardian, t1 for
      // accelerator — right at the cap, not over it, so this fails on the gap alone, not the cap.
      const cells = [cell('guardian', 's1', pool.length, 1), cell('accelerator', 's1', pool.length, 1)];
      const r = verdictFor({ cells, within, between });
      expect(r.verdict).toBe('fail');
    });

    it('the same uneven-validity pool is inconclusive once the invalid rate climbs past the cap', () => {
      const sharedUnits = ['rollback-safety', 'edge-cases', 'scope-creep', 'user-value'];
      const t0 = j('proceed', []);
      const t1 = j('proceed', [['rollback-safety', 'medium']]);
      const t2 = j('proceed-with-conditions', [['user-value', 'medium'], ['scope-creep', 'medium']]);
      const pool = [t0, t0, t0, t0, t1, t1, t1, t2, t2, t2];
      const within = meanPairwise(pool, undefined, sharedUnits);
      const between = meanPairwise(pool, pool, sharedUnits);
      // 3/10 = 30% invalid for each persona — over the 20% cap.
      const cells = [cell('guardian', 's1', pool.length, 3), cell('accelerator', 's1', pool.length, 3)];
      const r = verdictFor({ cells, within, between });
      expect(r.verdict).toBe('inconclusive');
    });
  });
});
