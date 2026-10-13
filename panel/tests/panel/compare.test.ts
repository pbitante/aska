import { describe, expect, it } from 'vitest';
import { comparePanel, formatComparison, parsePanelResult, type PanelResult } from '../../src/panel/compare';
import { resolvePersona } from '../../src/resolve/resolve';
import { personaMd, unitMd } from '../helpers/md';
import { registryFor } from '../helpers/scopes';

const { reg } = registryFor({
  'user/units/a.md': unitMd('a', { threshold: 'medium' }),
  'user/units/b.md': unitMd('b', { threshold: 'medium' }),
  'user/units/c.md': unitMd('c', { threshold: 'medium' }),
  'user/units/d.md': unitMd('d', { threshold: 'medium' }),
  'user/units/e.md': unitMd('e', { threshold: 'medium' }),
  'user/units/f.md': unitMd('f', { threshold: 'medium' }),
  'user/units/wu.md': unitMd('wu', { threshold: 'medium' }),
  'user/units/security.md': unitMd('security', { threshold: 'low' }),
  'user/personas/s.md': personaMd(['name: s', 'description: S.', 'units:', '  primary: [security, a]']),
  'user/personas/t.md': personaMd(['name: t', 'description: T.', 'units:', '  primary: [a]', '  secondary: [security]']),
  'user/personas/g.md': personaMd(['name: g', 'description: G.', 'units:', '  primary: [a, b]', '  secondary:', '    - c:', '        threshold: high']),
  'user/personas/x.md': personaMd(['name: x', 'description: X.', 'units:', '  primary: [b, c]', '  secondary: [d]']),
  'user/personas/y.md': personaMd(['name: y', 'description: Y.', 'units:', '  primary: [b]']),
  'user/personas/v.md': personaMd(['name: v', 'description: V.', 'units:', '  primary: [d, a]']),
  'user/personas/p1.md': personaMd(['name: p1', 'description: P1.', 'units:', '  primary: [e, f]']),
  'user/personas/p2.md': personaMd(['name: p2', 'description: P2.', 'units:', '  primary: [e, f]']),
  'user/personas/p3.md': personaMd(['name: p3', 'description: P3.', 'units:', '  primary: [f]']),
  'user/personas/w.md': personaMd([
    'name: w', 'description: W.',
    'units:', '  primary: [wu]',
    'judgment:', '  sections:',
    '    - name: Risk notes', '      ask: Explain the risk.',
    '    - name: Checks', '      ask: What checks were run?',
  ]),
});
const resolve = (ref: string) => resolvePersona(reg, ref).effective;

const gJ = {
  persona: 'g', verdict: 'stop',
  findings: [
    { unit: 'a', severity: 'medium', claim: 'a1', evidence: 'e' },
    { unit: 'a', severity: 'high', claim: 'a-high', evidence: 'e' },
    { unit: 'outside-scope', severity: 'critical', claim: 'licence', evidence: 'e' },
  ],
  cleared: ['b'], not_applicable: [],
  investigate: [{ what: 'run migration', why: 'reversibility', tools: ['Bash'] }],
};
const xJ = {
  persona: 'x', verdict: 'proceed-with-conditions', conditions: ['ship behind a flag'],
  findings: [{ unit: 'b', severity: 'medium', claim: 'b-x', evidence: 'e' }, { unit: 'c', severity: 'high', claim: 'c-x', evidence: 'e' }],
  cleared: [], not_applicable: [],
};
const yJ = { persona: 'y', verdict: 'proceed', findings: [], cleared: [], not_applicable: [{ unit: 'b', reason: 'docs only' }] };

const result = (panelists: PanelResult['panelists']): PanelResult => ({ question: 'Ship?', panel: null, panelists });

describe('parsePanelResult', () => {
  it('accepts the documented shape', () => {
    const r = parsePanelResult(JSON.stringify(result([{ persona: 'g', status: 'ok', judgment: gJ }, { persona: 'y', status: 'timeout', reason: 'timed out after 10 min' }])));
    expect(r.diagnostics).toEqual([]);
    expect(r.result!.panelists).toHaveLength(2);
  });

  it.each([
    ['not JSON', 'nope'],
    ['no question', JSON.stringify({ panel: null, panelists: [] })],
    ['non-string question', JSON.stringify({ question: 42, panel: null, panelists: [] })],
    ['non-string panel', JSON.stringify({ question: 'q', panel: 5, panelists: [] })],
    ['panelists not a list', JSON.stringify({ question: 'q', panel: null, panelists: {} })],
    ['entry without persona', JSON.stringify({ question: 'q', panel: null, panelists: [{ status: 'ok', judgment: {} }] })],
    ['unknown status', JSON.stringify({ question: 'q', panel: null, panelists: [{ persona: 'g', status: 'late' }] })],
    ['ok without judgment', JSON.stringify({ question: 'q', panel: null, panelists: [{ persona: 'g', status: 'ok' }] })],
    ['empty input', ''],
  ])('rejects %s with E_PANEL_RESULT', (_label, text) => {
    const r = parsePanelResult(text);
    expect(r.result).toBeUndefined();
    expect(r.diagnostics.map((d) => d.code)).toEqual(['E_PANEL_RESULT']);
    expect(r.diagnostics[0]!.fix).toBeTruthy();
  });

  it('accepts a malformed entry without a judgment, keeping its violations', () => {
    const r = parsePanelResult(JSON.stringify(result([
      { persona: 'g', status: 'ok', judgment: gJ },
      { persona: 'y', status: 'ok', judgment: yJ },
      { persona: 'reader', status: 'malformed', violations: ['not valid JSON'] },
    ])));
    expect(r.diagnostics).toEqual([]);
    expect(r.result!.panelists).toHaveLength(3);
    const malformed = r.result!.panelists.find((p) => p.persona === 'reader')!;
    expect(malformed.judgment).toBeUndefined();
    expect(malformed.violations).toEqual(['not valid JSON']);
  });

  it('gives a specific message for a bad panel result', () => {
    const r = parsePanelResult(JSON.stringify({ question: 'q', panel: null, panelists: [{ persona: 'g', status: 'ok' }] }));
    expect(r.diagnostics[0]!.message).toBe('panelists[0] (ok) needs a "judgment"');
  });

  it('rejects two panelist entries with the same persona string', () => {
    const r = parsePanelResult(JSON.stringify(result([
      { persona: 'g', status: 'timeout', reason: 'timed out after 10 min' },
      { persona: 'g', status: 'timeout', reason: 'timed out again' },
    ])));
    expect(r.result).toBeUndefined();
    expect(r.diagnostics.map((d) => d.code)).toEqual(['E_PANEL_RESULT']);
    expect(r.diagnostics[0]!.message).toBe('panelists[1] repeats persona g; replace the earlier entry instead');
  });
});

describe('comparePanel', () => {
  const c = comparePanel(result([
    { persona: 'g', status: 'ok', judgment: gJ },
    { persona: 'x', status: 'ok', judgment: xJ },
    { persona: 'y', status: 'ok', judgment: yJ },
    { persona: 'z', status: 'timeout', reason: 'timed out after 10 min' },
  ]), resolve);

  it('lists verdicts in input order, including non-ok panelists', () => {
    expect(c.verdicts).toEqual([
      { persona: 'g', status: 'ok', verdict: 'stop', reason: null, tension: null, model: null, modelSource: null },
      { persona: 'x', status: 'ok', verdict: 'proceed-with-conditions', reason: null, tension: null, model: null, modelSource: null },
      { persona: 'y', status: 'ok', verdict: 'proceed', reason: null, tension: null, model: null, modelSource: null },
      { persona: 'z', status: 'timeout', verdict: null, reason: 'timed out after 10 min', tension: null, model: null, modelSource: null },
    ]);
  });

  it('notes a proceed verdict that stands beside its own medium or higher finding', () => {
    const proceedWith = (findings: [string, string][]) => ({
      persona: 'x', verdict: 'proceed',
      findings: findings.map(([unit, severity], i) => ({ unit, severity, claim: `claim ${i}`, evidence: 'e' })),
      cleared: ['b', 'c'].filter((u) => !findings.some(([f]) => f === u)), not_applicable: [],
    });
    const tensionOf = (j: object) => comparePanel(result([{ persona: 'x', status: 'ok', judgment: j }]), resolve).verdicts[0]!.tension;
    expect(tensionOf(proceedWith([['b', 'medium'], ['c', 'high']]))).toBe('proceed despite its own high finding in c');
    expect(tensionOf(proceedWith([['b', 'medium']]))).toBe('proceed despite its own medium finding in b');
    expect(tensionOf(proceedWith([['outside-scope', 'low']]))).toBeNull();
    expect(tensionOf(proceedWith([]))).toBeNull();
    expect(tensionOf({ ...proceedWith([['c', 'high']]), verdict: 'proceed-with-conditions', conditions: ['fix it'] })).toBeNull();
  });

  it('notes a proceed verdict beside a primary security finding of any severity', () => {
    const j = (persona: string, findings: [string, string][]) => ({
      persona, verdict: 'proceed',
      findings: findings.map(([unit, severity], i) => ({ unit, severity, claim: `claim ${i}`, evidence: 'e' })),
      cleared: ['security', 'a'].filter((u) => !findings.some(([f]) => f === u)), not_applicable: [],
    });
    const tensionOf = (persona: string, findings: [string, string][]) =>
      comparePanel(result([{ persona, status: 'ok', judgment: j(persona, findings) }]), resolve).verdicts[0]!.tension;
    expect(tensionOf('s', [['security', 'low']])).toBe('proceed despite its own low finding in security');
    expect(tensionOf('s', [['security', 'low'], ['a', 'high']])).toBe('proceed despite its own high finding in a');
    expect(tensionOf('t', [['security', 'low']])).toBeNull();
  });

  it('builds unit rows with tiers, statuses, reasons and classes', () => {
    const row = (u: string) => c.units.find((r) => r.unit === u)!;
    expect(c.units.map((r) => r.unit)).toEqual(['a', 'b', 'c', 'd']);
    expect(row('a').class).toBe('single-voice');
    expect(row('a').cells[0]).toEqual({ persona: 'g', tier: 'primary', status: 'flagged', severity: 'high', claim: 'a-high', why: null });
    expect(row('a').cells[1]).toEqual({ persona: 'x', tier: 'none', status: 'not-raised', severity: null, claim: null, why: 'not held' });
    expect(row('b').class).toBe('split');
    expect(row('b').cells.map((x) => x.status)).toEqual(['cleared', 'flagged', 'not-applicable']);
    expect(row('b').cells[2]!.why).toBe('docs only');
    expect(row('c').class).toBe('split');
    expect(row('c').cells[0]).toMatchObject({ tier: 'secondary', status: 'not-raised', why: 'not reported (threshold high)' });
    expect(row('d').class).toBe('none');
  });

  it('collects outside-scope findings, merged lists and follow-ups', () => {
    expect(c.outsideScope).toEqual([{ persona: 'g', severity: 'critical', claim: 'licence', evidence: 'e' }]);
    expect(c.merged.conditions).toEqual([{ persona: 'x', text: 'ship behind a flag' }]);
    expect(c.merged.investigate).toEqual([{ persona: 'g', what: 'run migration', why: 'reversibility', tools: ['Bash'] }]);
    expect(c.followUps).toEqual([
      { type: 'rerun', persona: 'z', reason: 'timed out after 10 min' },
      { type: 'investigate', persona: 'g', what: 'run migration', why: 'reversibility', tools: ['Bash'] },
    ]);
    expect(c.ok).toBe(true);
  });

  it('classifies all-flag when every holder flags', () => {
    const both = comparePanel(result([
      { persona: 'x', status: 'ok', judgment: xJ },
      { persona: 'y', status: 'ok', judgment: { persona: 'y', verdict: 'proceed', findings: [{ unit: 'b', severity: 'medium', claim: 'b-y', evidence: 'e' }], cleared: [], not_applicable: [] } },
    ]), resolve);
    expect(both.units.find((r) => r.unit === 'b')!.class).toBe('all-flag');
  });

  it('demotes ok entries that fail validation or do not resolve', () => {
    const bad = comparePanel(result([
      { persona: 'g', status: 'ok', judgment: { ...gJ, verdict: 'maybe' } },
      { persona: 'nobody', status: 'ok', judgment: {} },
      { persona: 'x', status: 'ok', judgment: xJ },
    ]), resolve);
    expect(bad.verdicts.map((v) => [v.persona, v.status])).toEqual([['g', 'malformed'], ['nobody', 'error'], ['x', 'ok']]);
    expect(bad.verdicts[0]!.reason).toMatch(/^1 violation: verdict must be/);
    expect(bad.verdicts[1]!.reason).toBe('persona does not resolve — fix the name before re-running');
    expect(bad.ok).toBe(false);
    expect(bad.followUps.map((f) => f.type === 'rerun' && f.persona)).toEqual(['g', 'nobody']);
  });

  it('keeps a pre-supplied malformed reason, and builds one from violations otherwise', () => {
    const c = comparePanel(result([
      { persona: 'g', status: 'malformed', reason: 'panel skill flagged this already' },
      { persona: 'x', status: 'malformed', violations: ['bad verdict', 'missing claim'] },
    ]), resolve);
    expect(c.verdicts[0]!.reason).toBe('panel skill flagged this already');
    expect(c.verdicts[1]!.reason).toBe('2 violations: bad verdict');
  });

  it('claims the first finding when several share the top severity', () => {
    const tieJ = {
      persona: 'g', verdict: 'proceed',
      findings: [
        { unit: 'a', severity: 'medium', claim: 'first-medium', evidence: 'e' },
        { unit: 'a', severity: 'medium', claim: 'second-medium', evidence: 'e' },
      ],
      cleared: ['b'], not_applicable: [],
    };
    const c = comparePanel(result([{ persona: 'g', status: 'ok', judgment: tieJ }]), resolve);
    expect(c.units.find((r) => r.unit === 'a')!.cells[0]).toMatchObject({ severity: 'medium', claim: 'first-medium' });
  });

  it('sorts unit rows, independent of holder insertion order', () => {
    const vJ = { persona: 'v', verdict: 'proceed', findings: [], cleared: ['d', 'a'], not_applicable: [] };
    const c = comparePanel(result([{ persona: 'v', status: 'ok', judgment: vJ }]), resolve);
    expect(c.units.map((r) => r.unit)).toEqual(['a', 'd']);
  });

  it('merges missing information and sections in the persona\'s declared section order', () => {
    const wJ = {
      persona: 'w', verdict: 'insufficient-information',
      missing: ['need more data'],
      findings: [], cleared: ['wu'], not_applicable: [],
      sections: { Checks: 'checks-text', 'Risk notes': 'risk-text' },
    };
    const c = comparePanel(result([{ persona: 'w', status: 'ok', judgment: wJ }, { persona: 'x', status: 'ok', judgment: xJ }]), resolve);
    expect(c.merged.missing).toEqual([{ persona: 'w', text: 'need more data' }]);
    expect(c.merged.sections).toEqual([
      { persona: 'w', name: 'Risk notes', text: 'risk-text' },
      { persona: 'w', name: 'Checks', text: 'checks-text' },
    ]);
  });

  it('classifies three holders, two of whom flag, as split', () => {
    const flagF = (persona: string) => ({ persona, verdict: 'stop', findings: [{ unit: 'f', severity: 'high', claim: `f-${persona}`, evidence: 'e' }], cleared: ['e'], not_applicable: [] });
    const clearF = { persona: 'p3', verdict: 'proceed', findings: [], cleared: ['f'], not_applicable: [] };
    const c = comparePanel(result([
      { persona: 'p1', status: 'ok', judgment: flagF('p1') },
      { persona: 'p2', status: 'ok', judgment: flagF('p2') },
      { persona: 'p3', status: 'ok', judgment: clearF },
    ]), resolve);
    const f = c.units.find((r) => r.unit === 'f')!;
    expect(f.class).toBe('split');
    expect(f.cells.map((x) => x.status)).toEqual(['flagged', 'flagged', 'cleared']);
  });
});

describe('formatComparison', () => {
  it('prints sections in report order, deterministically', () => {
    const c = comparePanel(result([
      { persona: 'g', status: 'ok', judgment: gJ },
      { persona: 'x', status: 'ok', judgment: xJ },
      { persona: 'z', status: 'error', reason: 'subagent failed' },
    ]), resolve);
    const text = formatComparison(c);
    const order = ['Verdicts', 'Where they disagree', 'Where they agree', 'Outside their scope', 'Conditions', 'Follow-ups'].map((h) => text.indexOf(h));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toContain('1. Re-run z (subagent failed)');
    expect(text).toContain('2. g wants to investigate: run migration — reversibility (needs Bash)');
    expect(formatComparison(c)).toBe(text);
  });

  it('prints a verdict\'s tension after the verdict', () => {
    const j = { persona: 'x', verdict: 'proceed', findings: [{ unit: 'b', severity: 'medium', claim: 'b-x', evidence: 'e' }], cleared: ['c'], not_applicable: [] };
    const text = formatComparison(comparePanel(result([{ persona: 'x', status: 'ok', judgment: j }, { persona: 'y', status: 'ok', judgment: yJ }]), resolve));
    expect(text).toContain('- x — proceed (proceed despite its own medium finding in b)');
    expect(text).toContain('- y — proceed\n');
  });

  it('prints "- (none)" when there are no conditions, missing items or sections', () => {
    const c = comparePanel(result([{ persona: 'y', status: 'ok', judgment: yJ }]), resolve);
    const text = formatComparison(c);
    const section = text.slice(text.indexOf('Conditions, missing information and sections'), text.indexOf('Follow-ups'));
    expect(section).toContain('- (none)');
  });

  it('puts each unit class under the right heading, with the full content of each section', () => {
    const flagEF = (persona: string) => ({
      persona, verdict: 'stop',
      findings: [{ unit: 'e', severity: 'high', claim: `e-${persona}`, evidence: 'ev' }, { unit: 'f', severity: 'high', claim: `f-${persona}`, evidence: 'ev' }],
      cleared: [], not_applicable: [],
    });
    const wJ = {
      persona: 'w', verdict: 'insufficient-information',
      missing: ['need more data'], findings: [], cleared: ['wu'], not_applicable: [],
      sections: { 'Risk notes': 'risk-text', Checks: 'checks-text' },
    };
    const c = comparePanel(result([
      { persona: 'g', status: 'ok', judgment: gJ },
      { persona: 'x', status: 'ok', judgment: xJ },
      { persona: 'y', status: 'ok', judgment: yJ },
      { persona: 'p1', status: 'ok', judgment: flagEF('p1') },
      { persona: 'p2', status: 'ok', judgment: flagEF('p2') },
      { persona: 'p3', status: 'ok', judgment: { persona: 'p3', verdict: 'proceed', findings: [], cleared: ['f'], not_applicable: [] } },
      { persona: 'w', status: 'ok', judgment: wJ },
    ]), resolve);
    expect(c.units.map((u) => [u.unit, u.class])).toEqual([
      ['a', 'single-voice'], ['b', 'split'], ['c', 'split'], ['d', 'none'],
      ['e', 'all-flag'], ['f', 'split'], ['wu', 'none'],
    ]);

    const text = formatComparison(c);
    const between = (from: string, to: string) => text.slice(text.indexOf(from), text.indexOf(to));
    const disagree = between('Where they disagree', 'Where they agree');
    const agree = between('Where they agree', 'Outside their scope');
    const condSection = between('Conditions, missing information and sections', 'Follow-ups');

    expect(disagree).toContain('a [single-voice]');
    expect(disagree).toContain('b [split]');
    expect(disagree).toContain('c [split]');
    expect(disagree).toContain('f [split]');
    expect(disagree).not.toContain('e [all-flag]');

    expect(agree).toContain('e [all-flag]');
    expect(agree).not.toContain('b [split]');
    expect(agree).not.toContain('a [single-voice]');

    expect(text).toContain('- 2 unit(s) nobody raised');
    expect(text).toContain('- g: critical "licence"');
    expect(condSection).toContain('- x (condition): ship behind a flag');
    expect(condSection).toContain('- w (missing): need more data');
    expect(condSection).toContain('- w (Risk notes): risk-text');
  });
});

describe('formatComparison back-compat', () => {
  const old = result([
    { persona: 'g', status: 'ok', judgment: gJ },
    { persona: 'x', status: 'ok', judgment: xJ },
    { persona: 'y', status: 'ok', judgment: yJ },
    { persona: 't', status: 'timeout', reason: 'timed out after 10 min' },
  ]);

  it('prints a run without models exactly as 0.7.2 did', () => {
    expect(formatComparison(comparePanel(old, resolve))).toMatchSnapshot();
  });

  it('gives mixedModels false for a run that records no models', () => {
    expect(comparePanel(old, resolve).mixedModels).toBe(false);
  });

  it('prints an all-session run exactly as a run without models', () => {
    const session = result(old.panelists.map((p) => ({ ...p, model: null, modelSource: 'session' as const })));
    expect(formatComparison(comparePanel(session, resolve))).toBe(formatComparison(comparePanel(old, resolve)));
  });
});

describe('models', () => {
  const mixed = result([
    { persona: 'g', status: 'ok', judgment: gJ, model: 'opus', modelSource: 'panel' },
    { persona: 'x', status: 'ok', judgment: xJ, model: 'haiku', modelSource: 'panelist' },
    { persona: 'y', status: 'ok', judgment: yJ, model: null, modelSource: 'session' },
  ]);

  it('carries model and modelSource into verdict rows, after tension', () => {
    const c = comparePanel(mixed, resolve);
    expect(Object.keys(c.verdicts[0]!)).toEqual(['persona', 'status', 'verdict', 'reason', 'tension', 'model', 'modelSource']);
    expect(c.verdicts.map((v) => [v.model, v.modelSource])).toEqual([['opus', 'panel'], ['haiku', 'panelist'], [null, 'session']]);
  });

  it('puts mixedModels after ok, and counts only ok panelists, with null as its own value', () => {
    const c = comparePanel(mixed, resolve);
    expect(Object.keys(c).slice(-2)).toEqual(['ok', 'mixedModels']);
    expect(c.mixedModels).toBe(true);
    const sameOk = result([
      { persona: 'g', status: 'ok', judgment: gJ, model: 'sonnet', modelSource: 'run' },
      { persona: 'x', status: 'ok', judgment: xJ, model: 'sonnet', modelSource: 'run' },
      { persona: 't', status: 'timeout', reason: 'r', model: 'opus', modelSource: 'panelist' },
    ]);
    expect(comparePanel(sameOk, resolve).mixedModels).toBe(false);
    const sessionAndNamed = result([
      { persona: 'g', status: 'ok', judgment: gJ, model: null, modelSource: 'session' },
      { persona: 'x', status: 'ok', judgment: xJ, model: 'sonnet', modelSource: 'run' },
    ]);
    expect(comparePanel(sessionAndNamed, resolve).mixedModels).toBe(true);
  });

  it('tags the header, verdicts and disagreeing cells when models are mixed, but not agreeing cells', () => {
    const text = formatComparison(comparePanel(mixed, resolve));
    expect(text.split('\n')[1]).toBe('Models: g [opus], x [haiku], y [session model]');
    expect(text).toMatch(/^- g — stop \[opus\]$/m);
    expect(text).toMatch(/^- y — proceed \[session model\]$/m);
    const disagree = text.slice(text.indexOf('Where they disagree'), text.indexOf('Where they agree'));
    expect(disagree).toMatch(/ \[haiku\]$/m);
    const agree = text.slice(text.indexOf('Where they agree'), text.indexOf('Outside their scope'));
    expect(agree).not.toMatch(/\[(opus|haiku|session model)\]/);
  });

  it('tags verdicts but not cells when everyone ran on one named model', () => {
    const same = result(mixed.panelists.map((p) => ({ ...p, model: 'sonnet', modelSource: 'run' as const })));
    const text = formatComparison(comparePanel(same, resolve));
    expect(text).toMatch(/^- g — stop \[sonnet\]$/m);
    const disagree = text.slice(text.indexOf('Where they disagree'), text.indexOf('Where they agree'));
    expect(disagree).not.toContain('[sonnet]');
  });

  it("says 'not recorded' beside recorded models", () => {
    const partly = result([
      { persona: 'g', status: 'ok', judgment: gJ, model: 'opus', modelSource: 'panel' },
      { persona: 'x', status: 'ok', judgment: xJ },
    ]);
    expect(formatComparison(comparePanel(partly, resolve)).split('\n')[1]).toBe('Models: g [opus], x [not recorded]');
  });
});

describe('parsePanelResult models', () => {
  const one = (extra: Record<string, unknown>) =>
    parsePanelResult(JSON.stringify({ question: 'q', panel: null, panelists: [{ persona: 'g', status: 'timeout', reason: 'r', ...extra }] }));

  it('reads absent fields as null, and accepts any model name', () => {
    expect(one({}).result!.panelists[0]).toMatchObject({ model: null, modelSource: null });
    expect(one({ model: 'gpt-5', modelSource: 'panelist' }).diagnostics).toEqual([]);
  });

  it.each([
    ['an empty model', { model: '  ', modelSource: 'run' }, 'panelists[0] "model" must be a non-empty string or null'],
    ['a numeric model', { model: 5, modelSource: 'run' }, 'panelists[0] "model" must be a non-empty string or null'],
    ['a padded model', { model: ' sonnet', modelSource: 'run' }, 'panelists[0] "model" has surrounding spaces'],
    ['an unknown source', { model: 'sonnet', modelSource: 'Session' }, 'panelists[0] has an unknown modelSource "Session"'],
    ['a model on the session', { model: 'sonnet', modelSource: 'session' }, 'panelists[0] names model "sonnet" but says it ran on the session model'],
    ['a named source without a model', { model: null, modelSource: 'run' }, 'panelists[0] says its model came from "run" but names no model'],
    ['a model without a source', { model: 'sonnet' }, 'panelists[0] names model "sonnet" but no modelSource'],
  ])('rejects %s', (_label, extra, message) => {
    const r = one(extra);
    expect(r.result).toBeUndefined();
    expect(r.diagnostics.map((d) => [d.code, d.message])).toEqual([['E_PANEL_RESULT', message]]);
  });
});
