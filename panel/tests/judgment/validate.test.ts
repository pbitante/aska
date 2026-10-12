import { describe, expect, it } from 'vitest';
import { validateJudgment } from '../../src/judgment/validate';
import { resolveExample } from '../helpers/example';

const { effective } = resolveExample();
const valid = {
  persona: 'example',
  verdict: 'proceed-with-conditions',
  conditions: ['Run the rollback in staging first'],
  findings: [{ unit: 'rollback-safety', severity: 'high', claim: 'No down-migration', evidence: 'migrations/004.sql drops a column' }],
  cleared: ['edge-cases'],
  not_applicable: [],
  sections: { 'Suggested checks': 'Restore a staging snapshot after migrating.' },
};
const check = (patch: Record<string, unknown>) => validateJudgment(effective, { ...valid, ...patch }).join('\n');

describe('validateJudgment', () => {
  it('accepts a valid judgment', () => {
    expect(validateJudgment(effective, valid)).toEqual([]);
  });

  it('checks the overall shape', () => {
    expect(validateJudgment(effective, [])).toEqual(['the judgment must be a JSON object']);
    expect(check({ extra: 1 })).toContain('unknown key "extra"');
    expect(check({ persona: 'other' })).toContain('persona must be "example"');
    expect(check({ verdict: 'maybe' })).toContain('verdict must be one of');
    expect(check({ findings: 'none' })).toContain('findings must be a list');
    expect(check({ cleared: undefined })).toContain('cleared must be a list');
    expect(check({ not_applicable: {} })).toContain('not_applicable must be a list');
  });

  it('checks each finding', () => {
    const f = valid.findings[0]!;
    expect(check({ findings: [{ ...f, why: 'x' }] })).toContain('findings[0]: unknown key "why"');
    expect(check({ findings: [{ ...f, claim: ' ' }] })).toContain('findings[0]: claim must be a non-empty string');
    expect(check({ findings: [{ ...f, evidence: undefined }] })).toContain('findings[0]: evidence must be a non-empty string');
    expect(check({ findings: [{ ...f, suggestion: 3 }] })).toContain('findings[0]: suggestion must be a string');
    expect(check({ findings: [{ ...f, severity: 'High' }] })).toContain('findings[0]: severity must be one of');
    expect(check({ findings: [{ ...f, unit: 'scope-creep' }] })).toContain('"scope-creep" is not one of this persona\'s concerns');
    expect(check({ findings: [{ ...f, unit: undefined }] })).toContain('findings[0]: unit is required');
    expect(check({ findings: [...valid.findings, 'nope'] })).toContain('findings[1] must be an object');
  });

  it('enforces thresholds, including critical-only rules', () => {
    const edge = { unit: 'edge-cases', severity: 'low', claim: 'c', evidence: 'e' };
    expect(check({ findings: [edge, valid.findings[0]], cleared: [] })).toContain('severity low is below the medium threshold of edge-cases');
    expect(check({ findings: [...valid.findings, { unit: 'code-style', severity: 'high', claim: 'c', evidence: 'e' }] })).toContain('below the critical threshold of code-style');
    expect(check({ findings: [...valid.findings, { unit: 'outside-scope', severity: 'high', claim: 'c', evidence: 'e' }] })).toContain('outside-scope findings must be critical');
    expect(validateJudgment(effective, { ...valid, verdict: 'stop', conditions: undefined, findings: [...valid.findings, { unit: 'outside-scope', severity: 'critical', claim: 'c', evidence: 'e' }] })).toEqual([]);
    expect(check({ findings: [...valid.findings, { unit: 'maintainability', severity: 'low', claim: 'c', evidence: 'e' }] })).toBe('');
  });

  it('enforces verdict constraints', () => {
    expect(check({ conditions: [] })).toContain('conditions must be a non-empty list');
    expect(check({ verdict: 'proceed' })).toContain('conditions is only allowed when the verdict is proceed-with-conditions');
    expect(check({ verdict: 'insufficient-information', conditions: undefined })).toContain('missing must be a non-empty list');
    expect(check({ missing: ['x'] })).toContain('missing is only allowed when the verdict is insufficient-information');
    const medium = [{ ...valid.findings[0]!, severity: 'medium' }];
    expect(check({ verdict: 'stop', conditions: undefined, findings: medium })).toContain('a stop verdict needs at least one high or critical finding');
    const critical = [{ ...valid.findings[0]!, severity: 'critical' }];
    expect(check({ verdict: 'proceed', conditions: undefined, findings: critical })).toContain('proceed is not allowed while a critical finding stands');
    expect(check({ verdict: 'stop', conditions: undefined })).toBe('');
    expect(check({ verdict: 'Proceed' })).not.toContain('conditions is only allowed');
    expect(check({ conditions: [''] })).toContain('conditions must be a non-empty list of strings');
    expect(check({ conditions: 'not a list' })).toContain('conditions must be a non-empty list of strings');
  });

  it('enforces coverage of primary units', () => {
    expect(check({ cleared: [] })).toContain('primary concern edge-cases must appear in findings, cleared, or not_applicable');
    expect(check({ cleared: ['edge-cases', 'edge-cases'] })).toContain('primary concern edge-cases must appear in exactly one');
    expect(check({ not_applicable: [{ unit: 'edge-cases', reason: 'no inputs' }] })).toContain('must appear in exactly one');
    expect(check({ cleared: ['edge-cases', 'maintainability'] })).toContain('cleared[1]: "maintainability" is not a primary concern');
    expect(check({ cleared: [], not_applicable: [{ unit: 'edge-cases', reason: '' }] })).toContain('not_applicable[0]: reason must be a non-empty string');
    expect(check({ cleared: [], not_applicable: [{ unit: 'edge-cases', reason: 'docs only' }] })).toBe('');
    expect(check({ cleared: [], not_applicable: [{ unit: 'maintainability', reason: 'r' }] })).toContain('not_applicable[0]: unit "maintainability" is not a primary concern');
    expect(check({ cleared: [], not_applicable: [{ unit: 'edge-cases', reason: 'r', extra: 1 }] })).toContain('not_applicable[0]: unknown key "extra"');
    const badEntry = check({ cleared: [], not_applicable: [{ unit: 'nope', reason: 'r', extra: 1 }] });
    expect(badEntry).toContain('not_applicable[0]: unknown key "extra"');
    expect(badEntry).toContain('not_applicable[0]: unit "nope" is not a primary concern');
  });

  it('requires exactly the persona sections', () => {
    expect(check({ sections: undefined })).toContain('sections must have keys: Suggested checks');
    expect(check({ sections: {} })).toContain('sections["Suggested checks"] must be a non-empty string');
    expect(check({ sections: { 'Suggested checks': 'x', Other: 'y' } })).toContain('sections has unknown key "Other"');
    expect(check({ sections: 'nope' })).toContain('sections must be an object');
    const { effective: base } = resolveExample(undefined, 'base');
    const baseValid = { persona: 'base', verdict: 'proceed', findings: [], cleared: ['scope-creep'], not_applicable: [] };
    expect(validateJudgment(base, baseValid)).toEqual([]);
    expect(validateJudgment(base, { ...baseValid, sections: {} })).toEqual([]);
  });
});

describe('validateJudgment: investigate', () => {
  const item = { what: 'Run the migration against a staging copy', why: 'Reversibility cannot be judged from the diff', tools: ['Bash'] };

  it('accepts a judgment with or without investigate', () => {
    expect(validateJudgment(effective, valid)).toEqual([]);
    expect(validateJudgment(effective, { ...valid, investigate: [item] })).toEqual([]);
    expect(validateJudgment(effective, { ...valid, investigate: [] })).toEqual([]);
  });

  it('rejects malformed investigate lists and items', () => {
    const check = (inv: unknown) => validateJudgment(effective, { ...valid, investigate: inv }).join('\n');
    expect(check('run it')).toContain('investigate must be a list');
    expect(check([5])).toContain('investigate[0] must be an object');
    expect(check([{ ...item, extra: 1 }])).toContain('investigate[0]: unknown key "extra"');
    expect(check([{ ...item, what: ' ' }])).toContain('investigate[0]: what must be a non-empty string');
    expect(check([{ ...item, why: undefined }])).toContain('investigate[0]: why must be a non-empty string');
    expect(check([{ ...item, tools: [] }])).toContain('investigate[0]: tools must be a non-empty list of tool names');
    expect(check([{ ...item, tools: ['Bash', ''] }])).toContain('investigate[0]: tools must be a non-empty list of tool names');
  });
});
