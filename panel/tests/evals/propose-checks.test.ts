import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkProposalRun, panelistLaunchCount, parseProposal } from '../../evals/propose/checks';
import { SCENARIOS, type ProposalScenario } from '../../evals/propose/scenarios';
import { resolvePersona } from '../../src/resolve/resolve';
import { Registry } from '../../src/scopes/registry';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const reg = new Registry([{ kind: 'plugin', root: repo, plugin: 'aska' }]);
const resolves = (p: string) => resolvePersona(reg, p).effective !== undefined;

const NEW_LINEUP = [
  'Question: "Should we switch the summariser to the smaller model?"',
  'Concerns: llm-behavior, eval-evidence, cost, user-value',
  '',
  'Proposed panel:',
  '  model-skeptic — llm-behavior, eval-evidence primary',
  '  ai-economist  — cost, user-value primary; weighs savings against quality',
  '  accelerator   — user-value primary, edge-cases deprioritized; the counterweight',
  '',
  'Saved panel `llm` is close (model-skeptic, ai-economist, red-team) but adds',
  "red-team for security, which this question doesn't turn on.",
  '',
  'Run this panel? Reply yes, edit it ("add …", "drop …"), or name a saved panel.',
].join('\n');

const SAVED = [
  '```',
  'Question: "Is the plan in scenario.md ready to execute?"',
  'Concerns: plan-executability, rollback-safety',
  '',
  'Proposed panel: plan (saved, plugin)',
  '  - `aska:planner` — plan-executability, rollback-safety primary',
  '  - `aska:guardian` — rollback-safety primary',
  '  - `aska:accelerator` - scope-creep primary; the counterweight',
  '```',
].join('\n');

const scenario: ProposalScenario = { id: 't', file: 'x', question: 'q', mustInclude: ['model-skeptic'], mustExclude: ['guardian'] };
const launch = { type: 'assistant', message: { id: 'm', content: [{ type: 'tool_use', name: 'Agent', input: { subagent_type: 'aska:panelist' } }] } };
const input = (over: Partial<Parameters<typeof checkProposalRun>[0]> = {}) => ({ events: [], reply: NEW_LINEUP, scenario, resolves, projectChanges: [], ...over });

describe('parseProposal', () => {
  it('reads the spec layout for a new lineup', () => {
    expect(parseProposal(NEW_LINEUP)).toEqual({
      proposal: {
        question: 'Should we switch the summariser to the smaller model?',
        concerns: ['llm-behavior', 'eval-evidence', 'cost', 'user-value'],
        savedPanel: null,
        personas: ['model-skeptic', 'ai-economist', 'accelerator'],
      },
      missing: [],
    });
  });

  it('reads a saved-panel header, bullets, backticks, aska: prefixes and a code fence', () => {
    const { proposal } = parseProposal(SAVED);
    expect(proposal!.savedPanel).toBe('plan');
    expect(proposal!.personas).toEqual(['planner', 'guardian', 'accelerator']);
  });

  it('names every missing block', () => {
    expect(parseProposal('Proposed panel:\n  guardian — x').missing).toEqual(['Question:', 'Concerns:']);
    expect(parseProposal('').proposal).toBeNull();
  });
});

describe('checkProposalRun', () => {
  it('passes a good proposal and reports the shape softly', () => {
    const r = checkProposalRun(input());
    expect(r.problems).toEqual([]);
    expect(r.soft).toEqual(['proposed a new lineup', 'concerns: llm-behavior, eval-evidence, cost, user-value']);
  });

  it('fails when a panelist was launched before confirmation', () => {
    expect(checkProposalRun(input({ events: [launch] })).problems).toContain('launched 1 aska:panelist call(s) before the user confirmed');
    expect(panelistLaunchCount([launch, launch])).toBe(2);
  });

  it('fails on size, resolution, duplicates, must-include and must-exclude', () => {
    const one = NEW_LINEUP.replace(/ {2}ai-economist.*\n {2}accelerator.*\n/, '');
    expect(checkProposalRun(input({ reply: one })).problems).toContain('proposed 1 personas; a panel has 2–6');
    const ghost = NEW_LINEUP.replace('accelerator   —', 'nobody   —');
    expect(checkProposalRun(input({ reply: ghost })).problems).toContain('proposed persona nobody does not resolve');
    const twice = NEW_LINEUP.replace('ai-economist  —', 'model-skeptic  —');
    expect(checkProposalRun(input({ reply: twice })).problems).toContain('proposed model-skeptic more than once');
    const r = checkProposalRun(input({ scenario: { ...scenario, mustInclude: ['planner'], mustExclude: ['accelerator'] } }));
    expect(r.problems).toEqual(['proposal is missing planner', "proposal includes accelerator, which this question doesn't call for"]);
  });

  it('fails on missing blocks and on project writes', () => {
    const r = checkProposalRun(input({ reply: 'Here is my panel: guardian, accelerator.', projectChanges: ['a.md'] }));
    expect(r.problems).toEqual(['reply has no "Question:" block', 'reply has no "Concerns:" block', 'reply has no "Proposed panel:" block', 'the project was modified: a.md']);
  });
});

describe('proposal scenarios', () => {
  it('have files on disk and name only shipped personas', () => {
    for (const s of SCENARIOS) {
      expect(existsSync(join(repo, s.file)), s.file).toBe(true);
      for (const p of [...s.mustInclude, ...s.mustExclude]) expect(resolves(p), `${s.id}: ${p}`).toBe(true);
    }
  });
});
