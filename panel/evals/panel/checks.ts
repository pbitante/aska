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

export interface ExpectedModel { persona: string; model: string | null; modelSource: string }

// persona → the `model` of each aska:panelist launch for it (null when the launch passed none).
export function panelistLaunchModels(events: unknown[]): Record<string, (string | null)[]> {
  const out: Record<string, (string | null)[]> = {};
  for (const e of events) {
    const content = (e as { message?: { content?: unknown } }).message?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content as { type?: string; name?: string; input?: { subagent_type?: unknown; description?: unknown; model?: unknown } }[]) {
      if (c.type !== 'tool_use' || c.input?.subagent_type !== 'aska:panelist' || typeof c.input.description !== 'string') continue;
      const m = /^panelist (\S+)(?: re-ask)?$/.exec(c.input.description.trim());
      if (!m) continue;
      (out[m[1]!] ??= []).push(typeof c.input.model === 'string' ? c.input.model : null);
    }
  }
  return out;
}

export function panelistModelMismatches(
  entries: { persona: string; model?: string | null; modelSource?: string | null }[] | undefined,
  launches: Record<string, (string | null)[]>,
  expected: ExpectedModel[],
): string[] {
  const problems: string[] = [];
  const name = (m: string | null | undefined) => m ?? 'the session model';
  for (const x of expected) {
    const e = entries?.find((p) => p.persona === x.persona);
    if (!e) {
      problems.push(`${x.persona} has no entry in panel-result.json`);
    } else if ((e.model ?? null) !== x.model || (e.modelSource ?? null) !== x.modelSource) {
      problems.push(`${x.persona} was recorded on ${name(e.model)} (${e.modelSource ?? 'no source'}), expected ${name(x.model)} (${x.modelSource})`);
    }
    const launched = launches[x.persona] ?? [];
    if (launched.length === 0) {
      problems.push(`${x.persona} was never launched as aska:panelist`);
      continue;
    }
    const wrong = launched.filter((m) => m !== x.model);
    if (wrong.length > 0) {
      problems.push(wrong[0] === null ? `${x.persona} was launched without a model, expected ${name(x.model)}` : `${x.persona} was launched on ${wrong[0]}, expected ${name(x.model)}`);
    }
  }
  return problems;
}

// The family of a model id or alias (`claude-sonnet-5-5` and `sonnet` are both sonnet).
function modelFamily(id: string): string | undefined {
  return ['haiku', 'sonnet', 'opus', 'fable'].find((f) => id.includes(f));
}

// A mixed-models run puts one panelist on haiku and one on sonnet, so the run's per-model cost
// rows (evals/cost) must include both. The eval's own session runs on `sessionModel`, so its
// chair always produces a row for that model; that row proves nothing about a panelist, so only
// the expected models that differ from the session's are required (today: haiku).
export function costModelMismatches(cost: { byModel: Record<string, unknown> }, sessionModel: string): string[] {
  const ids = Object.keys(cost.byModel);
  const session = modelFamily(sessionModel);
  return ['haiku', 'sonnet'].filter((f) => f !== session && !ids.some((id) => modelFamily(id) === f)).map((f) => `the cost rows include no ${f} model`);
}

// The environment the eval hands `claude -p`. ASKA_RUNS_DIR is dropped so `runs new` can't put a
// kept run in the caller's real store; the approver only recognises runs under PERSONA_HOME.
export function evalEnv(base: NodeJS.ProcessEnv, personaHome: string, pluginsJsonFile: string): NodeJS.ProcessEnv {
  const { ASKA_RUNS_DIR: _runsDir, ...rest } = base;
  return { ...rest, PERSONA_HOME: personaHome, PERSONA_PLUGINS_JSON: pluginsJsonFile };
}

// The text of every tool result in a stream-json transcript.
function toolResultTexts(events: unknown[]): string[] {
  const out: string[] = [];
  for (const e of events) {
    const ev = e as { type?: string; message?: { content?: { type?: string; content?: unknown }[] } };
    if (ev.type !== 'user' && ev.type !== 'assistant') continue;
    for (const c of ev.message?.content ?? []) {
      if (c.type !== 'tool_result') continue;
      if (typeof c.content === 'string') out.push(c.content);
      else if (Array.isArray(c.content)) out.push(c.content.map((x) => (typeof (x as { text?: unknown })?.text === 'string' ? (x as { text: string }).text : '')).join(''));
    }
  }
  return out;
}

// The folder the panel skill keeps its brief, judgments and panel-result.json in is created by the
// skill itself at run time, so run.ts can't know its path in advance. It is either the kept-run
// folder `…/.claude/aska/runs/<run id>` (`runs new`, aska >= 0.4.0; the id has the shape of RUN_ID
// in src/runs/store.ts) or, when that fails, a `mktemp -d -t aska-panel-XXXXXX` folder. The report
// footer names it (skills/panel/SKILL.md step 5's "Footer"); the tool results are a fallback for a
// run whose report is missing or malformed.
export function findTempFolder(report: string, events: unknown[]): string | undefined {
  const re = /\/\S*(?:aska-panel-[A-Za-z0-9]+|\.claude\/aska\/runs\/\d{8}T\d{6}Z-[A-Za-z0-9]{6})/g;
  const fromReport = report.match(re);
  if (fromReport) return fromReport[fromReport.length - 1];
  for (const text of toolResultTexts(events)) {
    const m = text.match(re);
    if (m) return m[m.length - 1];
  }
  return undefined;
}

// Drops the diffSnapshots problems inside a kept-run folder (`.claude/aska/runs/<run id>/`): the panel
// skill legitimately writes there in PERSONA_HOME. Anything else under runs/ is still reported.
export function ignoreKeptRunChanges(problems: string[]): string[] {
  return problems.filter((p) => !/^(added|removed|modified) \.claude\/aska\/runs\/\d{8}T\d{6}Z-[A-Za-z0-9]{6}\//.test(p));
}
