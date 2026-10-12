import { describe, expect, it } from 'vitest';
import type { Target } from '../../src/gate/targets';
import { validateJudgment } from '../../src/judgment/validate';
import { resolveExample } from '../helpers/example';

const { effective } = resolveExample();
const targets: Target[] = [{ id: 'T1', text: 'empty input' }, { id: 'T2', text: 'rollback' }];
const broken = { unit: 'edge-cases', severity: 'high', claim: 'Hangs on empty input', evidence: 'printf "" | node x.mjs never exits', check: 'T1' };
const valid = {
  persona: 'example',
  verdict: 'stop',
  findings: [broken],
  cleared: ['rollback-safety'],
  not_applicable: [],
  sections: { 'Suggested checks': 'Pipe an empty stdin.' },
  checks: [
    { id: 'T1', status: 'broken', evidence: 'Ran it; it hung.' },
    { id: 'T2', status: 'holds', evidence: 'Ran the down-migration; table restored.' },
  ],
};
const v = (patch: Record<string, unknown>, t: readonly Target[] | undefined = targets) => validateJudgment(effective, { ...valid, ...patch }, t).join('\n');

describe('validateJudgment with targets', () => {
  it('accepts a judgment that answers every target', () => {
    expect(validateJudgment(effective, valid, targets)).toEqual([]);
  });

  it('accepts a deferred target with needs, and pass-shaped judgments', () => {
    const checks = [{ id: 'T1', status: 'holds', evidence: 'ok' }, { id: 'T2', status: 'deferred', evidence: 'needs prod', needs: 'a production snapshot' }];
    expect(v({ verdict: 'proceed', findings: [], cleared: ['edge-cases', 'rollback-safety'], checks })).toBe('');
  });

  it('rule 1: every target exactly once, no unknown ids', () => {
    expect(v({ checks: undefined })).toContain('checks must be a list with one entry per target');
    expect(v({ checks: [valid.checks[0]] })).toContain('target T2 has no entry in checks');
    expect(v({ checks: [] })).toContain('target T1 has no entry in checks');
    expect(v({ checks: [] })).toContain('target T2 has no entry in checks');
    expect(v({ checks: [...valid.checks, { id: 'T9', status: 'holds', evidence: 'x' }] })).toContain('checks[2]: id "T9" is not a target');
    expect(v({ checks: [...valid.checks, { id: 'T2', status: 'broken', evidence: 'x' }] })).toContain('checks[2]: target T2 is answered more than once');
  });

  it('rule 2: status, evidence and keys', () => {
    expect(v({ checks: [{ ...valid.checks[0], status: 'ok' }, valid.checks[1]] })).toContain('checks[0]: status must be one of holds, broken, deferred');
    expect(v({ checks: [valid.checks[0], { ...valid.checks[1], evidence: ' ' }] })).toContain('checks[1]: evidence must be a non-empty string');
    expect(v({ checks: [valid.checks[0], { ...valid.checks[1], note: 'x' }] })).toContain('checks[1]: unknown key "note"');
    expect(v({ checks: [valid.checks[0], 'T2'] })).toContain('checks[1] must be an object');
  });

  it('rule 3: broken needs a linked finding, deferred needs needs, others have none', () => {
    expect(v({ findings: [{ ...broken, check: undefined }] })).toContain('checks[0]: broken target T1 needs a finding with "check": "T1"');
    expect(v({ checks: [valid.checks[0], { id: 'T2', status: 'deferred', evidence: 'x' }] })).toContain('checks[1]: a deferred target needs a non-empty "needs"');
    expect(v({ checks: [valid.checks[0], { ...valid.checks[1], needs: 'x' }] })).toContain('checks[1]: needs is only allowed when the status is deferred');
  });

  it('rule 4: a finding\'s check must name a broken target', () => {
    expect(v({ findings: [broken, { ...broken, check: 'T2' }] })).toContain('findings[1]: check T2 is not broken (its status is holds)');
    expect(v({ findings: [broken, { ...broken, check: 'T7' }] })).toContain('findings[1]: check "T7" is not a target');
  });

  it('rule 5: no proceed while a target is broken', () => {
    expect(v({ verdict: 'proceed' })).toContain('proceed is not allowed while a target is broken');
  });

  it('rule 6: no checks and no check without targets', () => {
    expect(validateJudgment(effective, valid, undefined).join('\n')).toContain('checks is only allowed when a targets file is given');
    expect(validateJudgment(effective, valid, undefined).join('\n')).toContain('findings[0]: check is only allowed when a targets file is given');
  });

  it('a linked finding is in scope at any severity and counts toward coverage', () => {
    const low = { ...broken, severity: 'low' };
    const style = { ...broken, unit: 'code-style', severity: 'low' };
    const outside = { ...broken, unit: 'outside-scope', severity: 'medium' };
    const stopFinding = { unit: 'rollback-safety', severity: 'high', claim: 'c', evidence: 'e' };
    expect(v({ findings: [low, stopFinding], cleared: [] })).toBe('');
    expect(v({ findings: [style, stopFinding], cleared: ['edge-cases'] })).toBe('');
    expect(v({ findings: [outside, stopFinding], cleared: ['edge-cases'] })).toBe('');
    expect(v({ findings: [broken], cleared: ['edge-cases', 'rollback-safety'] })).toContain('primary concern edge-cases must appear in exactly one');
  });

  it('the relaxed rule does not leak to unlinked findings', () => {
    const style = { unit: 'code-style', severity: 'low', claim: 'c', evidence: 'e' };
    const outside = { unit: 'outside-scope', severity: 'medium', claim: 'c', evidence: 'e' };
    expect(v({ findings: [broken, style] })).toContain('findings[1]: severity low is below the critical threshold of code-style');
    expect(v({ findings: [broken, outside] })).toContain('findings[1]: outside-scope findings must be critical');
  });
});
