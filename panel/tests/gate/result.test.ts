import { describe, expect, it } from 'vitest';
import { formatGate, gateResult } from '../../src/gate/result';
import type { Target } from '../../src/gate/targets';

const targets: Target[] = [{ id: 'T1', text: 'a' }, { id: 'T2', text: 'b' }, { id: 'T3', text: 'c' }];
const holds = (id: string) => ({ id, status: 'holds', evidence: 'ok' });
const base = { verdict: 'proceed', findings: [] as object[], checks: [holds('T1'), holds('T2'), holds('T3')] };
const j = (patch: Record<string, unknown>) => ({ ...base, ...patch });

describe('gateResult', () => {
  it('pass: proceed and every target holds', () => {
    expect(gateResult(base, [], targets)).toEqual({ result: 'pass', broken: [], deferred: [], conditions: [], findings_outside_targets: [], violations: [] });
  });

  it('pass-with-conditions: a condition or a deferred target', () => {
    expect(gateResult(j({ verdict: 'proceed-with-conditions', conditions: ['Add a test'] }), [], targets).result).toBe('pass-with-conditions');
    const deferred = j({ checks: [holds('T1'), { id: 'T2', status: 'deferred', evidence: 'x', needs: 'a phone' }, holds('T3')] });
    expect(gateResult(deferred, [], targets)).toMatchObject({ result: 'pass-with-conditions', deferred: [{ id: 'T2', needs: 'a phone' }] });
  });

  it('fail: a broken target, stop, insufficient-information, or violations', () => {
    const f = { unit: 'u', severity: 'medium', claim: 'c', evidence: 'e', check: 'T3' };
    const broken = j({ verdict: 'proceed-with-conditions', conditions: ['x'], findings: [f], checks: [{ id: 'T3', status: 'broken', evidence: 'x' }, holds('T1'), holds('T2')] });
    expect(gateResult(broken, [], targets)).toMatchObject({ result: 'fail', broken: ['T3'] });
    expect(gateResult(j({ verdict: 'stop' }), [], targets).result).toBe('fail');
    expect(gateResult(j({ verdict: 'insufficient-information', missing: ['x'] }), [], targets).result).toBe('fail');
    expect(gateResult(base, ['bad'], targets)).toEqual({ result: 'fail', broken: [], deferred: [], conditions: [], findings_outside_targets: [], violations: ['bad'] });
  });

  it('orders broken and deferred by target order, and outside findings by severity', () => {
    const checks = [
      { id: 'T3', status: 'deferred', evidence: 'x', needs: 'n3' },
      { id: 'T1', status: 'deferred', evidence: 'x', needs: 'n1' },
      holds('T2'),
    ];
    const findings = [
      { unit: 'a', severity: 'low', claim: 'l1', evidence: 'e' },
      { unit: 'b', severity: 'high', claim: 'h1', evidence: 'e' },
      { unit: 'c', severity: 'low', claim: 'l2', evidence: 'e' },
    ];
    const r = gateResult(j({ checks, findings }), [], targets);
    expect(r.deferred.map((d) => d.id)).toEqual(['T1', 'T3']);
    expect(r.findings_outside_targets.map((f) => f.claim)).toEqual(['h1', 'l1', 'l2']);
    expect(Object.keys(r)).toEqual(['result', 'broken', 'deferred', 'conditions', 'findings_outside_targets', 'violations']);
  });

  it('keeps 2+ broken targets in target order, both named in the FAIL headline', () => {
    const findings = [
      { unit: 'security', severity: 'high', claim: 'first bug', evidence: 'e', check: 'T1' },
      { unit: 'edge-cases', severity: 'medium', claim: 'second bug', evidence: 'e', check: 'T3' },
    ];
    const checks = [{ id: 'T3', status: 'broken', evidence: 'x' }, holds('T2'), { id: 'T1', status: 'broken', evidence: 'x' }];
    const broken = j({ verdict: 'proceed-with-conditions', conditions: ['x'], findings, checks });
    const r = gateResult(broken, [], targets);
    expect(r.broken).toEqual(['T1', 'T3']);
    expect(formatGate(r, broken).split('\n')[0]).toBe('FAIL — T1 broken (high: first bug); T3 broken (medium: second bug)');
  });
});

describe('formatGate', () => {
  it('formats each result', () => {
    expect(formatGate(gateResult(base, [], targets), base)).toBe('PASS');
    const pwc = j({ verdict: 'proceed-with-conditions', conditions: ['Add a test'], checks: [holds('T1'), { id: 'T2', status: 'deferred', evidence: 'x', needs: 'a phone' }, holds('T3')] });
    expect(formatGate(gateResult(pwc, [], targets), pwc)).toBe([
      'PASS WITH CONDITIONS — T2 deferred (needs: a phone); 1 condition',
      '', 'Deferred:', '- T2: a phone',
      '', 'Conditions:', '- Add a test',
    ].join('\n'));
    const findings = [
      { unit: 'edge-cases', severity: 'medium', claim: 'slow', evidence: 'e', check: 'T1' },
      { unit: 'security', severity: 'high', claim: 'hangs', evidence: 'e', check: 'T1' },
      { unit: 'maintainability', severity: 'low', claim: 'messy', evidence: 'e' },
    ];
    const fail = j({ verdict: 'stop', findings, checks: [{ id: 'T1', status: 'broken', evidence: 'x' }, holds('T2'), holds('T3')] });
    expect(formatGate(gateResult(fail, [], targets), fail)).toBe([
      'FAIL — T1 broken (high: hangs); verdict stop',
      '', 'Broken:', '- T1 [high] security: hangs', '- T1 [medium] edge-cases: slow',
      '', 'Other findings:', '- [low] maintainability: messy',
    ].join('\n'));
    expect(formatGate(gateResult(base, ['a', 'b'], targets), base)).toBe('FAIL — invalid judgment\n- a\n- b');
  });
});
