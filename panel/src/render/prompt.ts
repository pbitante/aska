import type { Target } from '../gate/targets';
import { effectiveThreshold, type EffUnit, type EffectivePersona } from '../model/effective';

export type RenderMode = 'swap' | 'panel';

const bullets = (items: readonly string[]): string => items.map((i) => `- ${i}`).join('\n');
const code = (s: string): string => `\`${s}\``;
const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

function primaryBlock(u: EffUnit, n: number): string {
  const lines = [`### ${n}. ${u.canonical}`, '', u.unit.description, ''];
  if (u.unit.appliesWhen) lines.push(`- Applies when: ${u.unit.appliesWhen}`);
  lines.push(`- Threshold: ${effectiveThreshold(u)}`, '', '**Looks for**', '', u.unit.looksFor, '');
  const questions = [...u.unit.questions, ...u.addQuestions];
  const redFlags = [...u.unit.redFlags, ...u.addRedFlags];
  if (questions.length > 0) lines.push('**Questions**', '', bullets(questions), '');
  if (redFlags.length > 0) lines.push('**Red flags**', '', bullets(redFlags), '');
  lines.push('**Good looks like**', '', u.unit.goodLooksLike);
  return lines.join('\n');
}

function judgmentExample(p: EffectivePersona, targets?: readonly Target[]): object {
  const first = targets?.[0]?.id;
  const finding: Record<string, string> = {
    unit: p.units.primary[0]?.canonical ?? 'concern-id',
    severity: 'low | medium | high | critical',
    claim: '...',
    evidence: '...',
    suggestion: '...',
  };
  if (first !== undefined) finding.check = first;
  const example: Record<string, unknown> = {
    persona: p.canonical,
    verdict: 'proceed | proceed-with-conditions | stop | insufficient-information',
    conditions: ['...'],
    missing: ['...'],
    findings: [finding],
    cleared: ['concern-id'],
    not_applicable: [{ unit: 'concern-id', reason: '...' }],
    sections: Object.fromEntries(p.judgmentSections.map((s) => [s.name, '...'])),
    investigate: [{ what: '...', why: '...', tools: ['...'] }],
  };
  if (first !== undefined) example.checks = [{ id: first, status: 'holds | broken | deferred', evidence: '...', needs: '...' }];
  return example;
}

const TARGET_RULES = [
  'Every target appears in `checks` exactly once, by its id, with a `status`: `holds` (you checked and it holds), `broken` (it does not hold), or `deferred` (it cannot be checked here). Every entry has `evidence`: what you ran or read, and what you saw.',
  '`broken` needs at least one finding with `"check": "<id>"`. A finding tied to a target may name any of your concerns, or `outside-scope`, at any severity; the threshold and critical-only rules do not apply to it.',
  '`deferred` needs `needs`: what it would take to check it (for example a device, production data, or a person). `holds` and `broken` have no `needs`.',
  'Only a finding tied to a `broken` target has `check`. If any target is `broken`, the verdict cannot be `proceed`.',
];

function judgmentContract(p: EffectivePersona, mode: RenderMode, targets?: readonly Target[]): string {
  const ids = (us: EffUnit[]) => us.map((u) => code(u.canonical)).join(', ');
  const active = [...p.units.primary, ...p.units.secondary, ...p.units.deprioritized];
  const rules = [
    'The verdict is one of: `proceed`, `proceed-with-conditions`, `stop`, `insufficient-information`.',
    '`proceed-with-conditions` lists at least one condition. `insufficient-information` lists what is missing. `stop` needs at least one `high` or `critical` finding. Never `proceed` while a `critical` finding stands.',
    `Each finding names one concern by id (${ids(active)}) or \`outside-scope\`, a severity (\`low\`, \`medium\`, \`high\`, \`critical\`) at or above that concern's threshold, a claim, evidence, and optionally a suggestion.`,
    '`outside-scope` findings, and findings for deprioritized concerns, are allowed only at `critical`.',
    `Every primary concern (${ids(p.units.primary)}) appears exactly once across: findings, cleared (checked, nothing to raise), or not applicable (with a one-line reason that cites its "applies when" if it has one). Secondary and deprioritized concerns appear only if they raised a finding.`,
    'If something can only be checked with tools you do not have (running code, querying a system, opening the interface), do not guess: list it under `investigate` with what to check, why it matters, and the tools needed. `investigate` is optional.',
  ];
  const intro = mode === 'swap'
    ? 'When you are asked for an assessment, give a judgment that follows these rules:'
    : 'You are on a review panel. Give a judgment that follows these rules:';
  const parts = ['## Giving a judgment', intro, bullets(rules)];
  const sectionList = bullets(p.judgmentSections.map((s) => `${s.name}: ${s.ask}`));
  if (mode === 'swap') {
    const headings = ['Verdict', 'Conditions or Missing (when the verdict needs one)', 'Findings', 'Cleared', 'Not applicable', ...p.judgmentSections.map((s) => s.name)];
    parts.push(`Format it in markdown with these headings, in order: ${headings.join('; ')}. Write each finding as: \`- [severity] concern-id: claim — evidence\`.`);
    if (p.judgmentSections.length > 0) parts.push(`Also include:\n\n${sectionList}`);
  } else {
    if (targets !== undefined && targets.length > 0) {
      parts.push([
        '### Review targets',
        'Answer each of these in `checks`:',
        bullets(targets.map((t) => `${t.id}: ${oneLine(t.text)}`)),
        bullets(TARGET_RULES),
      ].join('\n\n'));
    }
    parts.push('Respond with only a JSON object (no prose, no code fence) of this shape:');
    parts.push(`\`\`\`json\n${JSON.stringify(judgmentExample(p, targets), null, 2)}\n\`\`\``);
    parts.push(`Include \`conditions\` only for \`proceed-with-conditions\` and \`missing\` only for \`insufficient-information\`. \`suggestion\` and \`investigate\` are optional.${targets !== undefined && targets.length > 0 ? ' Include `needs` only for `deferred` targets, and `check` only on findings tied to a `broken` target.' : ''}`);
    parts.push(p.judgmentSections.length > 0
      ? `\`sections\` has exactly these keys:\n\n${sectionList}`
      : 'Leave `sections` as `{}`: this persona defines no sections.');
  }
  return parts.join('\n\n');
}

export function renderPrompt(p: EffectivePersona, mode: RenderMode, targets?: readonly Target[]): string {
  const out: string[] = [`# Persona: ${p.name}`, p.description, `## Stance\n\n${p.stance.text}`];
  for (const s of p.extraSections) out.push(`## ${s.heading}\n\n${s.text}`);
  out.push([
    '## Primary concerns',
    'These are your most important concerns, in priority order. Raise a finding for a concern only at or above its threshold.',
    ...p.units.primary.map((u, i) => primaryBlock(u, i + 1)),
  ].join('\n\n'));
  if (p.units.secondary.length > 0) {
    out.push([
      '## Secondary concerns',
      'Glance at these. Raise a finding only at or above the stated threshold.',
      bullets(p.units.secondary.map((u) => `${u.canonical} (threshold ${effectiveThreshold(u)}): ${oneLine(u.unit.description)}`)),
    ].join('\n\n'));
  }
  if (p.units.deprioritized.length > 0) {
    out.push([
      '## Deprioritized',
      bullets(p.units.deprioritized.map((u) => `${code(u.canonical)}: Resist raising concerns about: ${oneLine(u.unit.description)} unless critical.${u.note ? ` ${oneLine(u.note)}` : ''}`)),
    ].join('\n\n'));
  }
  out.push(`## Tie-breaking\n\n${p.tieBreaking.text}`);
  if (p.capabilities.length > 0) {
    out.push([
      '## Capabilities',
      bullets(p.capabilities.map((c) =>
        `If the ${c.kind === 'skills' ? 'skill' : 'MCP server'} ${code(c.name)} is available, use it when ${c.when}; if it isn't, say so rather than guessing.`)),
    ].join('\n\n'));
  }
  out.push(judgmentContract(p, mode, mode === 'panel' ? targets : undefined));
  return `${out.join('\n\n')}\n`;
}
