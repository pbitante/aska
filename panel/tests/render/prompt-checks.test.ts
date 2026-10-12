import { describe, expect, it } from 'vitest';
import type { Target } from '../../src/gate/targets';
import { validateJudgment } from '../../src/judgment/validate';
import { renderPrompt } from '../../src/render/prompt';
import { resolveExample } from '../helpers/example';

const { effective } = resolveExample();
const targets: Target[] = [{ id: 'T1', text: 'Empty   input\nhangs' }, { id: 'T2.1', text: 'Parent — child' }];
const exampleOf = (prompt: string) => JSON.parse(/```json\n([\s\S]*?)\n```/.exec(prompt)![1]!) as Record<string, unknown>;

describe('renderPrompt with targets', () => {
  const withTargets = renderPrompt(effective, 'panel', targets);

  it('lists the targets and their rules before the JSON shape', () => {
    expect(withTargets).toContain('### Review targets\n\nAnswer each of these in `checks`:\n\n- T1: Empty input hangs\n- T2.1: Parent — child');
    expect(withTargets.indexOf('### Review targets')).toBeLessThan(withTargets.indexOf('Respond with only a JSON object'));
    expect(withTargets).toContain('`broken` needs at least one finding with `"check": "<id>"`');
    expect(withTargets).toContain('If any target is `broken`, the verdict cannot be `proceed`.');
  });

  it('adds checks and a finding check to the JSON example', () => {
    const ex = exampleOf(withTargets) as { checks: unknown[]; findings: { check?: string }[] };
    expect(ex.checks).toEqual([{ id: 'T1', status: 'holds | broken | deferred', evidence: '...', needs: '...' }]);
    expect(ex.findings[0]!.check).toBe('T1');
  });

  it('is deterministic, and unchanged without targets or in swap mode', () => {
    expect(renderPrompt(effective, 'panel', targets)).toBe(withTargets);
    expect(renderPrompt(effective, 'panel', undefined)).toBe(renderPrompt(effective, 'panel'));
    expect(renderPrompt(effective, 'swap', targets)).toBe(renderPrompt(effective, 'swap'));
    expect(renderPrompt(effective, 'panel')).not.toContain('Review targets');
  });

  it('prompt and validator agree: the filled-in example validates', () => {
    const ex = exampleOf(withTargets) as Record<string, any>;
    ex.verdict = 'stop';
    delete ex.conditions;
    delete ex.missing;
    ex.findings[0] = { ...ex.findings[0], severity: 'high', claim: 'c', evidence: 'e', suggestion: 's' };
    ex.checks = [
      { id: 'T1', status: 'broken', evidence: 'ran it' },
      { id: 'T2.1', status: 'deferred', evidence: 'no device', needs: 'a phone' },
    ];
    const primary = effective.units.primary.map((u) => u.canonical);
    ex.cleared = primary.filter((id) => id !== ex.findings[0].unit);
    ex.not_applicable = [];
    ex.sections = Object.fromEntries(Object.keys(ex.sections).map((k) => [k, 'filled']));
    ex.investigate = [{ what: 'w', why: 'y', tools: ['Bash'] }];
    expect(validateJudgment(effective, ex, targets)).toEqual([]);
  });
});
