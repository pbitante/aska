import { err, type Diagnostic } from '../diagnostics';
import { validateJudgment } from '../judgment/validate';
import { effectiveThreshold, type EffectivePersona } from '../model/effective';
import { cmp, severityRank, TIERS, type Severity, type Tier } from '../model/types';

type PanelistStatus = 'ok' | 'malformed' | 'timeout' | 'error';
const STATUSES: readonly PanelistStatus[] = ['ok', 'malformed', 'timeout', 'error'];

interface PanelistEntry {
  persona: string;
  status: PanelistStatus;
  judgment?: unknown;
  violations?: string[];
  reason?: string;
}

export interface PanelResult {
  question: string;
  panel: string | null;
  panelists: PanelistEntry[];
}

// `tension`: a plain `proceed` beside the panelist's own medium-or-higher finding, or its own
// finding of any severity in a primary-tier security unit.
interface VerdictRow { persona: string; status: PanelistStatus; verdict: string | null; reason: string | null; tension: string | null }
type CellTier = Tier | 'none';
type CellStatus = 'flagged' | 'cleared' | 'not-applicable' | 'not-raised';
interface UnitCell { persona: string; tier: CellTier; status: CellStatus; severity: string | null; claim: string | null; why: string | null }
type UnitClass = 'all-flag' | 'split' | 'single-voice' | 'none';
interface UnitComparison { unit: string; class: UnitClass; cells: UnitCell[] }
type FollowUp =
  | { type: 'rerun'; persona: string; reason: string }
  | { type: 'investigate'; persona: string; what: string; why: string; tools: string[] };

export interface Comparison {
  question: string;
  panel: string | null;
  verdicts: VerdictRow[];
  units: UnitComparison[];
  outsideScope: { persona: string; severity: string; claim: string; evidence: string }[];
  merged: {
    conditions: { persona: string; text: string }[];
    missing: { persona: string; text: string }[];
    investigate: { persona: string; what: string; why: string; tools: string[] }[];
    sections: { persona: string; name: string; text: string }[];
  };
  followUps: FollowUp[];
  ok: boolean;
}

interface Finding { unit: string; severity: string; claim: string; evidence: string }
interface Judgment {
  verdict: string;
  conditions?: string[];
  missing?: string[];
  findings: Finding[];
  cleared: string[];
  not_applicable: { unit: string; reason: string }[];
  sections?: Record<string, string>;
  investigate?: { what: string; why: string; tools: string[] }[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const FIX = 'Pass the panel-result JSON the panel skill writes: { question, panel, panelists: [{ persona, status, judgment (required for "ok", optional otherwise), violations?, reason? }] }';

export function parsePanelResult(text: string): { result?: PanelResult; diagnostics: Diagnostic[] } {
  const fail = (message: string) => ({ diagnostics: [err('E_PANEL_RESULT', message, undefined, FIX)] });
  if (text.trim() === '') return fail('no panel result given');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail('panel result is not valid JSON');
  }
  if (!isObj(data)) return fail('panel result must be a JSON object');
  if (typeof data.question !== 'string' || data.question.trim() === '') return fail('panel result needs a non-empty "question"');
  if (data.panel !== undefined && data.panel !== null && typeof data.panel !== 'string') return fail('"panel" must be a string or null');
  if (!Array.isArray(data.panelists)) return fail('"panelists" must be a list');
  const panelists: PanelistEntry[] = [];
  const seen = new Set<string>();
  for (const [i, p] of data.panelists.entries()) {
    if (!isObj(p) || typeof p.persona !== 'string' || p.persona.trim() === '') return fail(`panelists[${i}] needs a "persona"`);
    if (seen.has(p.persona)) return fail(`panelists[${i}] repeats persona ${p.persona}; replace the earlier entry instead`);
    seen.add(p.persona);
    if (typeof p.status !== 'string' || !(STATUSES as readonly string[]).includes(p.status)) return fail(`panelists[${i}] has an unknown status "${String(p.status)}"`);
    const status = p.status as PanelistStatus;
    if (status === 'ok' && p.judgment === undefined) return fail(`panelists[${i}] (${status}) needs a "judgment"`);
    panelists.push({
      persona: p.persona,
      status,
      judgment: p.judgment,
      violations: Array.isArray(p.violations) ? p.violations.filter((v): v is string => typeof v === 'string') : undefined,
      reason: typeof p.reason === 'string' ? p.reason : undefined,
    });
  }
  return { result: { question: data.question, panel: typeof data.panel === 'string' ? data.panel : null, panelists }, diagnostics: [] };
}

const isSecurity = (canonical: string): boolean => canonical === 'security' || canonical.endsWith(':security');

// A finding a `proceed` shouldn't sit beside unremarked: medium or higher in any unit, or any
// severity in a security unit the panelist holds as primary.
function proceedTension(j: Judgment, eff: EffectivePersona): string | null {
  if (j.verdict !== 'proceed') return null;
  const primarySecurity = new Set(eff.units.primary.map((u) => u.canonical).filter(isSecurity));
  const marked = j.findings.filter((f) => severityRank(f.severity as Severity) >= severityRank('medium') || primarySecurity.has(f.unit));
  if (marked.length === 0) return null;
  const top = Math.max(...marked.map((f) => severityRank(f.severity as Severity)));
  const f = marked.find((x) => severityRank(x.severity as Severity) === top)!;
  return `proceed despite its own ${f.severity} finding in ${f.unit}`;
}

export function comparePanel(result: PanelResult, resolve: (ref: string) => EffectivePersona | undefined): Comparison {
  const verdicts: VerdictRow[] = [];
  const followUps: FollowUp[] = [];
  const ok: { persona: string; eff: EffectivePersona; j: Judgment }[] = [];

  for (const entry of result.panelists) {
    let status = entry.status;
    let reason: string | null = entry.reason ?? null;
    let verdict: string | null = null;
    let tension: string | null = null;
    if (status === 'ok') {
      const eff = resolve(entry.persona);
      if (!eff) {
        status = 'error';
        reason = 'persona does not resolve — fix the name before re-running';
      } else {
        const violations = validateJudgment(eff, entry.judgment);
        if (violations.length > 0) {
          status = 'malformed';
          reason = `${violations.length} violation${violations.length === 1 ? '' : 's'}: ${violations[0]}`;
        } else {
          const j = entry.judgment as Judgment;
          verdict = j.verdict;
          tension = proceedTension(j, eff);
          ok.push({ persona: entry.persona, eff, j });
        }
      }
    } else if (status === 'malformed' && reason === null) {
      const n = entry.violations?.length ?? 0;
      reason = n > 0 ? `${n} violation${n === 1 ? '' : 's'}: ${entry.violations![0]}` : 'malformed judgment';
    }
    verdicts.push({ persona: entry.persona, status, verdict, reason, tension });
    if (status !== 'ok') followUps.push({ type: 'rerun', persona: entry.persona, reason: reason ?? status });
  }

  const unitIds = [...new Set(ok.flatMap(({ eff }) => TIERS.flatMap((t) => eff.units[t].map((u) => u.canonical))))].sort(cmp);
  const units: UnitComparison[] = unitIds.map((unit) => {
    const cells: UnitCell[] = ok.map(({ persona, eff, j }) => {
      const tier = (TIERS.find((t) => eff.units[t].some((u) => u.canonical === unit)) ?? 'none') as CellTier;
      const found = j.findings.filter((f) => f.unit === unit);
      if (found.length > 0) {
        const top = Math.max(...found.map((f) => severityRank(f.severity as Severity)));
        const first = found.find((f) => severityRank(f.severity as Severity) === top)!;
        return { persona, tier, status: 'flagged', severity: first.severity, claim: first.claim, why: null };
      }
      if (j.cleared.includes(unit)) return { persona, tier, status: 'cleared', severity: null, claim: null, why: null };
      const na = j.not_applicable.find((n) => n.unit === unit);
      if (na) return { persona, tier, status: 'not-applicable', severity: null, claim: null, why: na.reason };
      if (tier === 'none') return { persona, tier, status: 'not-raised', severity: null, claim: null, why: 'not held' };
      const u = eff.units[tier].find((x) => x.canonical === unit)!;
      return { persona, tier, status: 'not-raised', severity: null, claim: null, why: `not reported (threshold ${effectiveThreshold(u)})` };
    });
    const holders = cells.filter((c) => c.tier !== 'none');
    const flaggers = cells.filter((c) => c.status === 'flagged');
    const cls: UnitClass = flaggers.length === 0 ? 'none'
      : holders.length === 1 ? 'single-voice'
      : flaggers.length === holders.length ? 'all-flag'
      : 'split';
    return { unit, class: cls, cells };
  });

  const merged: Comparison['merged'] = { conditions: [], missing: [], investigate: [], sections: [] };
  const outsideScope: Comparison['outsideScope'] = [];
  for (const { persona, eff, j } of ok) {
    for (const f of j.findings) if (f.unit === 'outside-scope') outsideScope.push({ persona, severity: f.severity, claim: f.claim, evidence: f.evidence });
    for (const text of j.conditions ?? []) merged.conditions.push({ persona, text });
    for (const text of j.missing ?? []) merged.missing.push({ persona, text });
    for (const it of j.investigate ?? []) merged.investigate.push({ persona, what: it.what, why: it.why, tools: [...it.tools] });
    for (const s of eff.judgmentSections) {
      const text = j.sections?.[s.name];
      if (text !== undefined) merged.sections.push({ persona, name: s.name, text });
    }
  }
  for (const it of merged.investigate) followUps.push({ type: 'investigate', ...it });

  return { question: result.question, panel: result.panel, verdicts, units, outsideScope, merged, followUps, ok: ok.length >= 2 };
}

function cellText(c: UnitCell): string {
  if (c.status === 'flagged') return `${c.persona}: ${c.severity} (${c.tier}) "${c.claim}"`;
  if (c.status === 'not-raised') return `${c.persona}: not raised — ${c.why}${c.tier === 'none' ? '' : ` (${c.tier})`}`;
  if (c.status === 'not-applicable') return `${c.persona}: not applicable (${c.tier}) — ${c.why}`;
  return `${c.persona}: cleared (${c.tier})`;
}

export function formatComparison(c: Comparison): string {
  const lines: string[] = [`Panel: ${c.panel ?? 'ad-hoc'} — "${c.question}"`, '', 'Verdicts'];
  for (const v of c.verdicts) lines.push(`- ${v.persona} — ${v.status === 'ok' ? `${v.verdict}${v.tension ? ` (${v.tension})` : ''}` : `${v.status}${v.reason ? ` (${v.reason})` : ''}`}`);
  const section = (title: string, rows: UnitComparison[]) => {
    lines.push('', title);
    if (rows.length === 0) lines.push('- (none)');
    for (const r of rows) lines.push(`- ${r.unit} [${r.class}]`, ...r.cells.map((x) => `    ${cellText(x)}`));
  };
  section('Where they disagree', c.units.filter((u) => u.class === 'split' || u.class === 'single-voice'));
  section('Where they agree', c.units.filter((u) => u.class === 'all-flag'));
  lines.push(`- ${c.units.filter((u) => u.class === 'none').length} unit(s) nobody raised`);
  lines.push('', 'Outside their scope');
  if (c.outsideScope.length === 0) lines.push('- (none)');
  for (const o of c.outsideScope) lines.push(`- ${o.persona}: ${o.severity} "${o.claim}"`);
  lines.push('', 'Conditions, missing information and sections');
  if (c.merged.conditions.length === 0 && c.merged.missing.length === 0 && c.merged.sections.length === 0) lines.push('- (none)');
  for (const x of c.merged.conditions) lines.push(`- ${x.persona} (condition): ${x.text}`);
  for (const x of c.merged.missing) lines.push(`- ${x.persona} (missing): ${x.text}`);
  for (const x of c.merged.sections) lines.push(`- ${x.persona} (${x.name}): ${x.text}`);
  lines.push('', 'Follow-ups');
  if (c.followUps.length === 0) lines.push('- (none)');
  c.followUps.forEach((f, i) => {
    lines.push(f.type === 'rerun'
      ? `${i + 1}. Re-run ${f.persona} (${f.reason})`
      : `${i + 1}. ${f.persona} wants to investigate: ${f.what} — ${f.why} (needs ${f.tools.join(', ')})`);
  });
  if (!c.ok) lines.push('', 'not enough judgments to compare');
  return lines.join('\n');
}
