export interface ToolUse { type: string; name?: string; input?: { subagent_type?: unknown } }
interface AssistantEvent { type?: string; message?: { id?: string; content?: ToolUse[] }; parent_tool_use_id?: string | null }

export function isPanelistLaunch(c: ToolUse): boolean {
  return c.type === 'tool_use' && (c.name === 'Agent' || c.name === 'Task') && c.input?.subagent_type === 'aska:panelist';
}

// Claude Code's `stream-json` output splits one assistant message's multiple content blocks
// (e.g. two subagent launches side by side) across separate top-level `assistant` events that
// share the same `message.id`. Counting tool_uses per event (instead of per message) can never
// see more than one panelist launch at a time, even when the model did put both calls in a
// single message. Group by `message.id`, summed across the top-level events (those with no
// `parent_tool_use_id`, i.e. not a subagent's own events); fall back to counting an event alone
// when it carries no `message.id`.
export function parallelPanelistLaunch(events: unknown[]): number {
  let best = 0;
  const sums = new Map<string, number>();
  for (const e of events) {
    const ev = e as AssistantEvent;
    if (ev.type !== 'assistant' || !Array.isArray(ev.message?.content)) continue;
    if (ev.parent_tool_use_id) continue;
    const n = ev.message!.content!.filter(isPanelistLaunch).length;
    const id = ev.message?.id;
    if (id) {
      const total = (sums.get(id) ?? 0) + n;
      sums.set(id, total);
      best = Math.max(best, total);
    } else {
      best = Math.max(best, n);
    }
  }
  return best;
}

export function reportSections(text: string): string[] {
  const wanted = ['Verdicts', 'Where they disagree', 'Where they agree', 'Follow-ups'];
  return wanted.filter((w) => new RegExp(`^#+\\s*${w}\\b`, 'm').test(text));
}

function followUpsSectionText(report: string): string {
  const heading = report.match(/^#+\s*Follow-ups\b.*$/m);
  if (!heading) return '';
  const rest = report.slice(heading.index! + heading[0].length);
  const next = rest.search(/\n#+\s/);
  return next === -1 ? rest : rest.slice(0, next);
}

// Counts the numbered lines (`1. …`, `2. …`, …) inside the report's "Follow-ups" section only,
// so a numbered list anywhere else in the report (there isn't one today, but nothing stops a
// future section from having one) isn't miscounted as a follow-up.
export function followUpLineCount(report: string): number {
  return (followUpsSectionText(report).match(/^\s*\d+\.\s/gm) ?? []).length;
}

// Each numbered item, including any wrapped or sub-bullet lines under it up to the next number.
function followUpLines(report: string): string[] {
  const section = followUpsSectionText(report);
  return [...section.matchAll(/^\s*\d+\.\s.*(?:\n(?!\s*\d+\.\s).*)*/gm)].map((m) => m[0]);
}

export interface ExpectedFollowUp { type: 'rerun' | 'investigate'; persona: string }

const TYPE_KEYWORD: Record<ExpectedFollowUp['type'], RegExp> = {
  rerun: /re-?run/i,
  investigate: /investigat/i,
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A count-only check (the report has as many numbered Follow-ups lines as `compare` has
// `followUps`) can pass on a same-count substitution: an invented re-run swapped in for a merged
// investigate item, as the model actually did in one recorded run (3 lines either way,
// wrong content). This checks position: line i must name `expected[i]`'s persona and read as its
// type (a re-run vs. an investigation) — exactly the "in order, one numbered line each" rule
// skills/panel/SKILL.md's Report section states.
export function followUpLineMismatches(report: string, expected: ExpectedFollowUp[]): string[] {
  const lines = followUpLines(report);
  const problems: string[] = [];
  expected.forEach((exp, i) => {
    const line = lines[i];
    if (line === undefined) {
      problems.push(`Follow-ups is missing line ${i + 1} (expected a ${exp.type} for ${exp.persona})`);
      return;
    }
    if (!new RegExp(escapeRegExp(exp.persona), 'i').test(line)) problems.push(`Follow-ups line ${i + 1} doesn't name ${exp.persona}`);
    if (!TYPE_KEYWORD[exp.type].test(line)) problems.push(`Follow-ups line ${i + 1} doesn't read as a ${exp.type}`);
  });
  if (lines.length > expected.length) problems.push(`Follow-ups has ${lines.length - expected.length} extra numbered line(s) beyond compare's ${expected.length} followUps`);
  return problems;
}

// Without a request for a recommendation, the report must carry no recommendation,
// "my read", or verdict of Claude's own anywhere in it — the chair section is the only place that
// may appear, and only when asked.
export function hasUnrequestedRecommendation(report: string, recommendationRequested: boolean): boolean {
  if (recommendationRequested) return false;
  return /\brecommendation\b|\bmy read\b|\bi recommend\b/i.test(report);
}

type PanelResultStatus = 'ok' | 'missing' | 'malformed';

export interface PanelRunInput {
  events: unknown[];
  report: string;
  judgmentViolations: Record<string, string[]>;
  verdicts: Record<string, string>;
  panelResultStatus: PanelResultStatus;
  projectChanges: string[];
  expectedFollowUps: ExpectedFollowUp[];
  recommendationRequested: boolean;
}

export function checkPanelRun(input: PanelRunInput): { problems: string[]; soft: string[] } {
  const problems: string[] = [];
  const soft: string[] = [];
  const panelists = Object.keys(input.judgmentViolations);
  const launched = parallelPanelistLaunch(input.events);
  if (launched < panelists.length) problems.push(`panelists were not all launched in the same turn (max ${launched} of ${panelists.length})`);
  const found = reportSections(input.report);
  for (const s of ['Verdicts', 'Where they disagree', 'Where they agree', 'Follow-ups']) if (!found.includes(s)) problems.push(`report is missing the "${s}" section`);
  for (const [p, v] of Object.entries(input.judgmentViolations)) if (v.length > 0) problems.push(`${p}'s judgment is invalid: ${v[0]}`);
  if (input.panelResultStatus === 'missing') problems.push('no panel-result.json was written');
  else if (input.panelResultStatus === 'malformed') problems.push('panel-result.json exists but could not be parsed');
  if (input.projectChanges.length > 0) problems.push(`the project was modified: ${input.projectChanges.slice(0, 3).join(', ')}`);
  problems.push(...followUpLineMismatches(input.report, input.expectedFollowUps));
  if (hasUnrequestedRecommendation(input.report, input.recommendationRequested)) soft.push('report contains recommendation-like text ("Recommendation"/"my read"/"I recommend") without being asked for one');
  const vs = Object.values(input.verdicts);
  if (vs.length >= 2 && new Set(vs).size === 1) soft.push(`verdicts did not differ (${vs.join(' / ')})`);
  return { problems, soft };
}
