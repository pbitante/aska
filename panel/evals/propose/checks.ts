import { isPanelistLaunch, type ToolUse } from '../panel/checks';
import type { ProposalScenario } from './scenarios';

export interface Proposal {
  question: string;
  concerns: string[];
  savedPanel: string | null;
  personas: string[];
}

const bare = (name: string): string => name.replace(/^aska:/, '');
const LABELS = ['Question', 'Concerns', 'Proposed panel'] as const;
// "  - `aska:planner` — …", "  guardian — …", "  accelerator - …"
const PERSONA_LINE = /^\s*(?:[-*]\s+)?`?([a-z0-9][a-z0-9-]*(?::[a-z0-9-]+)?)`?\s+[—–-]\s/;

// Parses the layout the panel skill's step 1a pins. Leading whitespace and a surrounding code
// fence are tolerated; anything else about the layout is not.
export function parseProposal(reply: string): { proposal: Proposal | null; missing: string[] } {
  const lines = reply.split('\n');
  const at = (label: string) => lines.findIndex((l) => l.trimStart().startsWith(`${label}:`));
  const idx = LABELS.map(at);
  const missing = LABELS.filter((_, i) => idx[i]! < 0).map((l) => `${l}:`);
  if (missing.length > 0) return { proposal: null, missing };
  const [qi, ci, pi] = idx as [number, number, number];
  const rest = (i: number, label: string) => lines[i]!.trimStart().slice(label.length + 1).trim();
  const saved = /^`?([a-z0-9][a-z0-9:-]*)`?\s+\(saved,/.exec(rest(pi, 'Proposed panel'));
  const personas: string[] = [];
  for (const l of lines.slice(pi + 1)) {
    if (l.trim() === '' && personas.length === 0) continue;
    const m = PERSONA_LINE.exec(l);
    if (!m) break;
    personas.push(bare(m[1]!));
  }
  return {
    proposal: {
      question: rest(qi, 'Question').replace(/^"|"$/g, ''),
      concerns: rest(ci, 'Concerns').split(',').map((c) => c.trim()).filter(Boolean),
      savedPanel: saved ? bare(saved[1]!) : null,
      personas,
    },
    missing: [],
  };
}

export function panelistLaunchCount(events: unknown[]): number {
  let n = 0;
  for (const e of events) {
    const ev = e as { type?: string; message?: { content?: unknown } };
    if (ev.type !== 'assistant' || !Array.isArray(ev.message?.content)) continue;
    n += (ev.message!.content as ToolUse[]).filter(isPanelistLaunch).length;
  }
  return n;
}

export interface ProposalRunInput {
  events: unknown[];
  reply: string;
  scenario: ProposalScenario;
  resolves: (persona: string) => boolean;
  projectChanges: string[];
}

export function checkProposalRun(input: ProposalRunInput): { problems: string[]; soft: string[] } {
  const problems: string[] = [];
  const soft: string[] = [];
  const launched = panelistLaunchCount(input.events);
  if (launched > 0) problems.push(`launched ${launched} aska:panelist call(s) before the user confirmed`);
  const { proposal, missing } = parseProposal(input.reply);
  for (const m of missing) problems.push(`reply has no "${m}" block`);
  if (proposal) {
    const ps = proposal.personas;
    if (ps.length < 2 || ps.length > 6) problems.push(`proposed ${ps.length} personas; a panel has 2–6`);
    for (const p of ps) if (!input.resolves(p)) problems.push(`proposed persona ${p} does not resolve`);
    for (const p of new Set(ps)) if (ps.filter((x) => x === p).length > 1) problems.push(`proposed ${p} more than once`);
    for (const p of input.scenario.mustInclude) if (!ps.includes(p)) problems.push(`proposal is missing ${p}`);
    for (const p of input.scenario.mustExclude) if (ps.includes(p)) problems.push(`proposal includes ${p}, which this question doesn't call for`);
    soft.push(proposal.savedPanel ? `proposed the saved panel ${proposal.savedPanel}` : 'proposed a new lineup');
    soft.push(`concerns: ${proposal.concerns.join(', ') || '(none)'}`);
  }
  if (input.projectChanges.length > 0) problems.push(`the project was modified: ${input.projectChanges.slice(0, 3).join(', ')}`);
  return { problems, soft };
}
