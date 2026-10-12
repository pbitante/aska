import { describe, expect, it } from 'vitest';
import { checkPanelRun, followUpLineCount, followUpLineMismatches, hasUnrequestedRecommendation, parallelPanelistLaunch, reportSections } from '../../evals/panel/checks';
import { trimmedRealTranscript } from './fixtures/panel-split-launch';

// Claude Code's `stream-json` output never puts more than one content block per top-level
// `assistant` event; a message with two tool_uses (e.g. two subagent launches side by side)
// shows up as two events that share `message.id`. These fixtures mirror that real shape —
// not the synthetic "N blocks in one event" shape the original (wrong) fixtures used.
const split = (id: string, n: number) =>
  Array.from({ length: n }, () => ({
    type: 'assistant',
    parent_tool_use_id: null,
    message: { id, content: [{ type: 'tool_use', name: 'Agent', input: { subagent_type: 'aska:panelist' } }] },
  }));

// The real Follow-ups sections from a recorded run 1 (the defect: an invented rerun
// swapped in for guardian's first investigate item, and guardian's two items merged into one
// line) and run 2 (the fixed skill: one line per followUp, persona-tagged, in order).
const RUN1_FOLLOWUPS = [
  "1. Re-run either panelist after the migration is split into expand/contract phases, to see if guardian's verdict moves off `stop`.",
  '2. Investigate (needs DB/ops tooling, not available to the panel): confirm transaction behavior of the migration runner and backup/PITR coverage for `users`.',
  "3. Investigate (needs deploy pipeline access): confirm sequencing guarantees between app-code rollout and the migration's `DROP COLUMN` step.",
].join('\n');
const RUN2_FOLLOWUPS = [
  '1. **Investigate** (guardian): Whether the migration runner wraps the script in an implicit transaction, and what happens to already-applied state if the process is killed mid-UPDATE.',
  '2. **Investigate** (guardian): The deployment topology and how long the dual-version window lasts.',
  '3. **Investigate** (accelerator): Whether the production database/ORM enforces a maintenance window or has replicas sensitive to long-running unbatched UPDATEs.',
].join('\n');
const EXPECTED_FOLLOWUPS = [
  { type: 'investigate' as const, persona: 'guardian' },
  { type: 'investigate' as const, persona: 'guardian' },
  { type: 'investigate' as const, persona: 'accelerator' },
];

describe('panel eval checks', () => {
  it('counts panelists launched in one message, split across same-id events', () => {
    expect(parallelPanelistLaunch(split('m1', 2))).toBe(2);
  });

  it('counts panelists launched across two different message ids as not parallel', () => {
    expect(parallelPanelistLaunch([...split('m1', 1), ...split('m2', 1)])).toBe(1);
  });

  it('ignores a panelist tool_use nested inside a subagent (parent_tool_use_id set)', () => {
    const nested = {
      type: 'assistant',
      parent_tool_use_id: 'toolu_outer',
      message: { id: 'm3', content: [{ type: 'tool_use', name: 'Agent', input: { subagent_type: 'aska:panelist' } }] },
    };
    expect(parallelPanelistLaunch([...split('m1', 1), nested])).toBe(1);
  });

  it('still counts a split event as parallel when other events are interleaved between the two blocks', () => {
    const between = { type: 'assistant', parent_tool_use_id: 'toolu_outer', message: { id: 'other', content: [{ type: 'tool_use', name: 'Read', input: {} }] } };
    expect(parallelPanelistLaunch([...split('m1', 1), between, ...split('m1', 1)])).toBe(2);
  });

  it('falls back to per-event counting when message.id is missing', () => {
    const noId = { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Agent', input: { subagent_type: 'aska:panelist' } }] } };
    expect(parallelPanelistLaunch([noId, noId])).toBe(1);
  });

  it('counts 2 on a trimmed real transcript slice (the actual split-launch shape)', () => {
    expect(parallelPanelistLaunch(trimmedRealTranscript)).toBe(2);
  });

  it('finds report sections', () => {
    expect(reportSections('## Panel\n### Verdicts\n…\n### Where they disagree\n…\n### Where they agree\n…\n### Follow-ups\n')).toEqual(['Verdicts', 'Where they disagree', 'Where they agree', 'Follow-ups']);
  });

  it('counts only the numbered lines inside the Follow-ups section', () => {
    const report = '### Follow-ups\n1. Re-run guardian.\n2. Investigate X.\n### Chair\nsome other numbered list:\n1. not a follow-up\n';
    expect(followUpLineCount(report)).toBe(2);
    expect(followUpLineCount('### Follow-ups\n(none)\n')).toBe(0);
  });

  it('flags recommendation-like text only when none was requested', () => {
    expect(hasUnrequestedRecommendation('**My read:** ship it.', false)).toBe(true);
    expect(hasUnrequestedRecommendation('I recommend shipping.', false)).toBe(true);
    expect(hasUnrequestedRecommendation('### Recommendation (chair)\nship it.', false)).toBe(true);
    expect(hasUnrequestedRecommendation('### Recommendation (chair)\nship it.', true)).toBe(false);
    expect(hasUnrequestedRecommendation('no opinions here.', false)).toBe(false);
  });

  describe('followUpLineMismatches (positional)', () => {
    it('passes when each line names its expected persona and reads as its type, in order', () => {
      const report = `### Follow-ups\n${RUN2_FOLLOWUPS}\n`;
      expect(followUpLineMismatches(report, EXPECTED_FOLLOWUPS)).toEqual([]);
    });

    it('flags a same-count substitution: an invented rerun and a merged line', () => {
      const report = `### Follow-ups\n${RUN1_FOLLOWUPS}\n`;
      const problems = followUpLineMismatches(report, EXPECTED_FOLLOWUPS);
      // Line 1 reads as a rerun, not an investigation, for guardian's first investigate item.
      expect(problems.some((p) => p.includes('line 1') && p.includes('investigate'))).toBe(true);
      // Line 2 never names guardian (it merges both of guardian's items without a persona tag).
      expect(problems.some((p) => p.includes('line 2') && p.includes('guardian'))).toBe(true);
      // Line 3 never names accelerator.
      expect(problems.some((p) => p.includes('line 3') && p.includes('accelerator'))).toBe(true);
      expect(problems.length).toBeGreaterThan(0);
    });

    it('flags a missing line when the report has fewer lines than expected', () => {
      const report = '### Follow-ups\n1. **Investigate** (guardian): one thing.\n';
      const problems = followUpLineMismatches(report, EXPECTED_FOLLOWUPS);
      expect(problems).toContain("Follow-ups is missing line 2 (expected a investigate for guardian)");
      expect(problems).toContain('Follow-ups is missing line 3 (expected a investigate for accelerator)');
    });

    it('flags extra lines beyond what compare expects', () => {
      const report = `### Follow-ups\n${RUN2_FOLLOWUPS}\n4. **Investigate** (guardian): a bonus line nobody asked for.\n`;
      const problems = followUpLineMismatches(report, EXPECTED_FOLLOWUPS);
      expect(problems).toContain("Follow-ups has 1 extra numbered line(s) beyond compare's 3 followUps");
    });

    it('matches a rerun by its type keyword', () => {
      const report = '### Follow-ups\n1. **Re-run** guardian after the fix.\n';
      expect(followUpLineMismatches(report, [{ type: 'rerun', persona: 'guardian' }])).toEqual([]);
    });
  });

  const good = {
    events: split('m1', 2),
    report: '### Verdicts\n### Where they disagree\n### Where they agree\n### Follow-ups\n1. **Re-run** guardian.\n',
    judgmentViolations: { guardian: [], accelerator: [] },
    verdicts: { guardian: 'stop', accelerator: 'proceed-with-conditions' },
    panelResultStatus: 'ok' as const,
    projectChanges: [],
    expectedFollowUps: [{ type: 'rerun' as const, persona: 'guardian' }],
    recommendationRequested: false,
  };

  it('passes a good run', () => {
    expect(checkPanelRun(good)).toEqual({ problems: [], soft: [] });
  });

  it('fails a sequential launch, missing sections, invalid judgments, a missing result file and project writes', () => {
    const r = checkPanelRun({
      ...good,
      events: [...split('m1', 1), ...split('m2', 1)],
      report: '### Verdicts\n',
      judgmentViolations: { guardian: ['verdict must be one of …'], accelerator: [] },
      panelResultStatus: 'missing',
      expectedFollowUps: [],
      projectChanges: ['+ .claude/personas/x.persona.md'],
    });
    expect(r.problems.join('\n')).toMatch(/same turn/);
    expect(r.problems.join('\n')).toMatch(/Where they disagree/);
    expect(r.problems.join('\n')).toMatch(/guardian/);
    expect(r.problems.join('\n')).toMatch(/no panel-result\.json was written/);
    expect(r.problems.join('\n')).toMatch(/project/);
  });

  it('reports a malformed panel-result.json distinctly from a missing one', () => {
    const missing = checkPanelRun({ ...good, panelResultStatus: 'missing' });
    const malformed = checkPanelRun({ ...good, panelResultStatus: 'malformed' });
    expect(missing.problems).toContain('no panel-result.json was written');
    expect(malformed.problems).toContain('panel-result.json exists but could not be parsed');
    expect(missing.problems[0]).not.toEqual(malformed.problems[0]);
  });

  it("flags a positional mismatch between the report's Follow-ups and compare's followUps (hard)", () => {
    const r = checkPanelRun({ ...good, expectedFollowUps: EXPECTED_FOLLOWUPS });
    expect(r.problems.some((p) => p.includes('is missing line 2'))).toBe(true);
    expect(r.problems.some((p) => p.includes('is missing line 3'))).toBe(true);
  });

  it('flags an unrequested recommendation as a soft finding, and allows one when requested', () => {
    const unasked = checkPanelRun({ ...good, report: `${good.report}\n**My read:** ship it.` });
    expect(unasked.soft).toContain('report contains recommendation-like text ("Recommendation"/"my read"/"I recommend") without being asked for one');
    const asked = checkPanelRun({ ...good, report: `${good.report}\n### Recommendation (chair — Claude's synthesis, not a panelist)\nship it.`, recommendationRequested: true });
    expect(asked.soft).toEqual([]);
  });

  it('reports identical verdicts as a soft finding only', () => {
    const r = checkPanelRun({ ...good, verdicts: { guardian: 'stop', accelerator: 'stop' } });
    expect(r.problems).toEqual([]);
    expect(r.soft).toEqual(['verdicts did not differ (stop / stop)']);
  });
});
