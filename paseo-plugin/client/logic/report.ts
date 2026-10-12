import { judgmentSchema, type Comparison, type PanelResult, type RunMeta, type UnitCell, type UnitComparison } from "../../shared/runs";
import type { Tone } from "./catalog";

export const shortPersona = (persona: string): string => persona.slice(persona.indexOf(":") + 1);

export interface Pill {
  persona: string;
  label: string;
  tone: Tone;
}

const VERDICTS: Record<string, { label: string; tone: Tone }> = {
  proceed: { label: "proceed", tone: "ok" },
  "proceed-with-conditions": { label: "with conditions", tone: "warning" },
  stop: { label: "stop", tone: "error" },
  "insufficient-information": { label: "insufficient info", tone: "warning" },
};

export function verdictPill(persona: string, status: string, verdict: string | null): Pill {
  if (status === "received") return { persona, label: "received", tone: "muted" };
  if (status !== "ok") return { persona, label: status, tone: "error" };
  const known = verdict ? VERDICTS[verdict] : undefined;
  return { persona, label: known?.label ?? verdict ?? "no verdict", tone: known?.tone ?? "muted" };
}

export const verdictPills = (c: Comparison): Pill[] => c.verdicts.map((v) => verdictPill(v.persona, v.status, v.verdict));
export const metaPills = (m: RunMeta): Pill[] => m.panelists.map((p) => verdictPill(p.persona, p.status, p.verdict));

export interface UnitCounts {
  split: number;
  singleVoice: number;
  allFlag: number;
  quiet: number;
}

function unitCounts(c: Comparison): UnitCounts {
  const n = (cls: UnitComparison["class"]) => c.units.filter((u) => u.class === cls).length;
  return { split: n("split"), singleVoice: n("single-voice"), allFlag: n("all-flag"), quiet: n("none") };
}

export function countsLine(c: Comparison): string {
  const n = unitCounts(c);
  const parts: [number, string][] = [
    [n.split, "split"],
    [n.singleVoice, "single-voice"],
    [n.allFlag, "all-flag"],
    [n.quiet, "quiet"],
  ];
  const shown = parts.filter(([count]) => count > 0).map(([count, word]) => `${count} ${word}`);
  return shown.length > 0 ? shown.join(" · ") : "no units compared";
}

export interface FollowUpLine {
  n: number;
  persona: string;
  text: string;
  tools: string[];
}

export function followUpLines(c: Comparison): FollowUpLine[] {
  return c.followUps.map((f, i) =>
    f.type === "rerun"
      ? { n: i + 1, persona: f.persona, text: `Re-run ${shortPersona(f.persona)}: ${f.reason}`, tools: [] }
      : { n: i + 1, persona: f.persona, text: `${shortPersona(f.persona)}: ${f.what} — because ${f.why}`, tools: f.tools },
  );
}

export interface CellView {
  persona: string;
  label: string;
  tone: Tone;
  claim: string | null;
  why: string | null;
}
export interface UnitRowView {
  unit: string;
  cls: UnitComparison["class"];
  cells: CellView[];
}

const TIER_LETTER: Record<UnitCell["tier"], string> = { primary: "P", secondary: "S", deprioritized: "D", none: "–" };
const SEVERITY_TONE: Record<string, Tone> = { critical: "error", high: "error", medium: "warning", low: "muted" };

export function cellView(c: UnitCell): CellView {
  const base = { persona: c.persona, claim: c.claim, why: c.why };
  if (c.status === "flagged") return { ...base, label: `${TIER_LETTER[c.tier]}·${c.severity ?? "?"}`, tone: SEVERITY_TONE[c.severity ?? ""] ?? "muted" };
  if (c.status === "cleared") return { ...base, label: "cleared", tone: "ok" };
  if (c.status === "not-applicable") return { ...base, label: "n/a", tone: "muted" };
  return { ...base, label: c.tier === "none" ? "not held" : "—", tone: "muted" };
}

const CLASS_ORDER: Record<UnitComparison["class"], number> = { split: 0, "single-voice": 1, "all-flag": 2, none: 3 };

export function gridRows(c: Comparison): { rows: UnitRowView[]; quiet: UnitRowView[] } {
  const views = c.units.map((u) => ({ unit: u.unit, cls: u.class, cells: u.cells.map(cellView) }));
  const rows = views.filter((v) => v.cls !== "none").sort((a, b) => CLASS_ORDER[a.cls] - CLASS_ORDER[b.cls]);
  return { rows, quiet: views.filter((v) => v.cls === "none") };
}

export interface PanelistSection {
  persona: string;
  status: string;
  pill: Pill;
  reason: string | null;
  violations: string[];
  findings: { unit: string; severity: string; claim: string; evidence?: string; suggestion?: string }[];
  cleared: string[];
  notApplicable: { unit: string; reason: string }[];
  conditions: string[];
  missing: string[];
  sections: { name: string; text: string }[];
  unreadable: boolean;
}

export function panelistSections(
  result: PanelResult | null,
  judgments: readonly { persona: string; judgment?: unknown }[],
  comparison: Comparison | null,
): PanelistSection[] {
  const entries = result
    ? result.panelists.map((p) => ({ persona: p.persona, status: p.status, judgment: p.judgment, violations: p.violations ?? [], reason: p.reason ?? null }))
    : judgments.map((j) => ({ persona: j.persona, status: "received", judgment: j.judgment, violations: [], reason: null }));
  return entries.map((e) => {
    const row = comparison?.verdicts.find((v) => v.persona === e.persona);
    const status = row?.status ?? e.status;
    const parsed = e.judgment === undefined ? null : judgmentSchema.safeParse(e.judgment);
    const j = parsed?.success ? parsed.data : null;
    return {
      persona: e.persona,
      status,
      pill: verdictPill(e.persona, status, row?.verdict ?? j?.verdict ?? null),
      reason: row?.reason ?? e.reason,
      violations: e.violations,
      findings: j?.findings ?? [],
      cleared: j?.cleared ?? [],
      notApplicable: j?.not_applicable ?? [],
      conditions: j?.conditions ?? [],
      missing: j?.missing ?? [],
      sections: Object.entries(j?.sections ?? {}).map(([name, text]) => ({ name, text })),
      unreadable: parsed !== null && !parsed.success,
    };
  });
}

// "**Question:** …" (the panel skill's brief) or "Question: …".
export function questionFromBrief(brief: string): string | null {
  const m = /^\s*(?:\*\*)?Question:?(?:\*\*)?:?\s*(.+)$/im.exec(brief);
  return m ? m[1]!.trim() : null;
}

// A report call is stale once the archive records a different call for its folder. The Run
// buttons' last-moment re-check uses this directly; the card's dimming also waits for the agent.
export function isStaleCall(latestCallId: string | null, callId: string): boolean {
  return latestCallId !== null && latestCallId !== callId;
}

// The owning agent's own status gates the Run buttons already, and the archive lags behind by up
// to a turn, so a running agent never counts as superseded even if the cache says otherwise.
export function isSuperseded(latestCallId: string | null, callId: string, agentBusy: boolean): boolean {
  return !agentBusy && isStaleCall(latestCallId, callId);
}

export function fmtElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}
