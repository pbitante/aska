import type { LiveRun, PanelistRow, PanelistState } from "../../../shared/recognize";
import { judgmentSchema, type RunReport, type UnitCell } from "../../../shared/runs";
import { shortPersona } from "../report";
import { liveEvidence, type LiveActivity, type PanelistLive } from "./activity";
import { collectEvidence, type EvidenceSet } from "./evidence";
import { isObj } from "../../../shared/guards";

export type FlowPhase = "running" | "collecting" | "outcome";
export type TrackStop = "cleared" | "not-raised" | "low" | "medium" | "high";
export const TRACK_STOPS: readonly TrackStop[] = ["cleared", "not-raised", "low", "medium", "high"];
export type StartTimes = Record<string, number>;

export interface FlowPanelist {
  id: string;
  key: string;
  persona: string;
  initial: string;
  state: PanelistState | "unknown";
  startedAt: number | null;
  reask: boolean;
  status: string | null;
  verdict: string | null;
  error: string | null;
  evidence: string[];
  live: PanelistLive | null;
}
export interface FlowCell {
  panelist: string;
  position: TrackStop | null;
  claim: string | null;
  why: string | null;
}
export interface FlowUnit {
  id: string;
  label: string;
  cls: "all-flag" | "split" | "single-voice" | "none";
  cells: FlowCell[];
}
export interface FlowModel {
  phase: FlowPhase;
  panelists: FlowPanelist[];
  evidence: EvidenceSet;
  units: FlowUnit[];
  live: { complete: boolean; watchingSince: string | null } | null;
}

export function trackStop(cell: UnitCell): TrackStop | null {
  if (cell.status === "flagged") {
    const s = cell.severity ?? "";
    if (s === "low") return "low";
    if (s === "high" || s === "critical") return "high";
    return "medium";
  }
  if (cell.status === "cleared") return "cleared";
  if (cell.tier === "none") return null;
  return "not-raised";
}

// The first timestamp seen for each tool call: when a panelist started.
export function startTimes(entries: readonly { item: unknown; timestamp: string }[]): StartTimes {
  const out: StartTimes = {};
  for (const e of entries) {
    if (!isObj(e.item) || typeof e.item.callId !== "string" || e.item.callId in out) continue;
    const t = Date.parse(e.timestamp);
    if (!Number.isNaN(t)) out[e.item.callId] = t;
  }
  return out;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function initials(keys: readonly string[]): string[] {
  const first = keys.map((k) => k.charAt(0).toUpperCase());
  return keys.map((k, i) => (first.filter((f) => f === first[i]).length > 1 ? cap(k.slice(0, 2)) : first[i]!));
}

export function buildFlowModel(run: LiveRun, report: RunReport | null, startedAt: StartTimes, live: LiveActivity | null = null): FlowModel {
  const c = report?.comparison ?? null;
  const judgments = report?.judgments ?? [];
  const order: string[] = [];
  const rowsByKey = new Map<string, PanelistRow[]>();
  const note = (key: string) => {
    if (!order.includes(key)) order.push(key);
  };
  for (const r of run.panelists) {
    const key = shortPersona(r.persona);
    note(key);
    rowsByKey.set(key, [...(rowsByKey.get(key) ?? []), r]);
  }
  for (const v of c?.verdicts ?? []) note(shortPersona(v.persona));
  for (const j of judgments) note(shortPersona(j.persona));

  const phase: FlowPhase = c ? "outcome" : run.judgmentsSaved.length > 0 || judgments.length > 0 ? "collecting" : "running";

  const cited = collectEvidence(judgments, report?.brief ?? null, run.dir);
  const useLive = live !== null && phase !== "outcome" && live.files.length > 0;
  const evidence = useLive
    ? liveEvidence(live.files)
    : live === null
      ? cited
      : {
          ...cited,
          items: cited.items.map((item) => {
            const readers = live.files.find((f) => f.path === item.id)?.readers.length ?? 0;
            return readers > 0 ? { ...item, readBy: readers } : item;
          }),
        };
  const letters = initials(order);
  const panelists: FlowPanelist[] = order.map((key, i) => {
    const rows = rowsByKey.get(key) ?? [];
    const verdictRow = c?.verdicts.find((v) => shortPersona(v.persona) === key);
    const judgment = judgments.find((j) => shortPersona(j.persona) === key);
    const parsed = judgment ? judgmentSchema.safeParse(judgment.judgment) : null;
    const persona = verdictRow?.persona ?? judgment?.persona ?? rows[0]?.persona ?? key;
    const latest = rows[rows.length - 1];
    return {
      id: key,
      key,
      persona,
      initial: letters[i]!,
      state: latest?.state ?? (verdictRow || judgment ? "done" : "unknown"),
      startedAt: rows[0] ? (startedAt[rows[0].callId] ?? null) : null,
      reask: rows.some((r) => r.reask),
      status: verdictRow?.status ?? null,
      verdict: verdictRow ? (verdictRow.status === "ok" ? verdictRow.verdict : null) : parsed?.success ? (parsed.data.verdict ?? null) : null,
      error: latest?.error ?? null,
      evidence: evidence.byPanelist[key] ?? [],
      live: live?.byPanelist[key] ?? null,
    };
  });

  const units: FlowUnit[] = (c?.units ?? []).map((u) => ({
    id: u.unit,
    label: shortPersona(u.unit),
    cls: u.class,
    cells: u.cells.map((cell) => ({ panelist: shortPersona(cell.persona), position: trackStop(cell), claim: cell.claim, why: cell.why })),
  }));

  return { phase, panelists, evidence, units, live: live ? { complete: live.complete, watchingSince: live.watchingSince } : null };
}

// Reads that appeared since `before`, for particles. Nothing on the first activity load,
// so opening a panel mid-run doesn't replay history.
export function particleReads(before: FlowModel, after: FlowModel): { panelist: string; ref: string | null }[] {
  if (before.live === null) return [];
  const out: { panelist: string; ref: string | null }[] = [];
  for (const p of after.panelists) {
    if (!p.live) continue;
    const seen = before.panelists.find((o) => o.id === p.id)?.live?.readIds ?? [];
    for (const id of p.live.readIds) {
      if (seen.includes(id)) continue;
      out.push({ panelist: p.id, ref: p.live.recent.find((r) => r.callId === id)?.ref ?? null });
    }
  }
  return out;
}

// Panelists whose search count grew since `before`, for flashes. Nothing on the first
// activity load, the same rule as `particleReads`, so opening a panel mid-run doesn't
// flash every panelist that has already searched.
export function searchFlashes(before: FlowModel, after: FlowModel): string[] {
  if (before.live === null) return [];
  const out: string[] = [];
  for (const p of after.panelists) {
    const prev = before.panelists.find((o) => o.id === p.id)?.live?.counts.searches ?? 0;
    if ((p.live?.counts.searches ?? 0) > prev) out.push(p.id);
  }
  return out;
}

// Each node's flash counter, bumped for `ids`. Only nodes in `nodeIds` (the current layout) are
// kept, so a long run's counters don't pile up for every node that ever flashed.
export function bumpFlashes(cur: Readonly<Record<string, number>>, ids: readonly string[], nodeIds: readonly string[]): Record<string, number> {
  const flashed = new Set(ids);
  const next: Record<string, number> = {};
  for (const id of nodeIds) {
    const count = (cur[id] ?? 0) + (flashed.has(id) ? 1 : 0);
    if (count > 0) next[id] = count;
  }
  return next;
}

// The model the next one is diffed against: itself after a replay jump (a scrub or a prev/next
// step), so a jump animates nothing, as on a first load. Playback diffs against the last model.
export function diffBase(before: FlowModel, after: FlowModel, jumped: boolean): FlowModel {
  return jumped ? after : before;
}
