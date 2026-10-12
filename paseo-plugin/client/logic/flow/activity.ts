import type { ActivityKind, RunActivity } from "../../../shared/activity";
import type { LiveRun, PanelistRow } from "../../../shared/recognize";
import { shortPersona } from "../report";
import { briefRoot, labelOf, normalizeRef, type EvidenceSet } from "./evidence";

const RECENT_CAP = 10;
export const THINKING_MS = 10_000;
const PATTERN_MAX = 24;

export interface LiveEntry {
  callId: string;
  kind: ActivityKind;
  target: string | null;
  ref: string | null;
  at: number;
}
export interface PanelistLive {
  now: LiveEntry | null;
  counts: { reads: number; searches: number };
  recent: LiveEntry[];
  lastActiveAt: number | null;
  readIds: string[];
}
export interface LiveFile {
  path: string;
  readers: string[];
  reads: number;
  lastAt: number;
}
export interface LiveActivity {
  byPanelist: Record<string, PanelistLive>;
  files: LiveFile[];
  complete: boolean;
  watchingSince: string | null;
}

// Each panelist's latest attempt (a re-ask replaces the earlier one) → its sub-agent's activity.
export function liveActivity(run: LiveRun, activity: RunActivity | null, brief: string | null): LiveActivity | null {
  if (!activity) return null;
  const root = briefRoot(brief);
  const latest = new Map<string, PanelistRow>();
  for (const r of run.panelists) latest.set(shortPersona(r.persona), r);
  const byPanelist: Record<string, PanelistLive> = {};
  const files = new Map<string, LiveFile>();
  for (const [key, row] of latest) {
    const sub = activity.subagents.find((s) => s.id === row.callId);
    if (!sub) continue;
    const entries: LiveEntry[] = sub.activity.map((a) => {
      const inRun = run.dir !== null && a.target !== null && a.target.startsWith(`${run.dir}/`);
      const ref = a.kind === "read" && a.target !== null && !inRun ? normalizeRef(a.target, root, run.dir) : null;
      return { callId: a.callId, kind: a.kind, target: a.target, ref, at: Date.parse(a.at) };
    });
    const reads = entries.filter((x) => x.kind === "read");
    const shown = entries.filter((x) => x.kind !== "other");
    byPanelist[key] = {
      now: shown[shown.length - 1] ?? null,
      counts: { reads: reads.length, searches: entries.filter((x) => x.kind === "search").length },
      recent: entries.slice(-RECENT_CAP),
      lastActiveAt: entries.length > 0 ? Math.max(...entries.map((x) => x.at)) : null,
      readIds: reads.map((x) => x.callId),
    };
    for (const r of reads) {
      if (r.ref === null) continue;
      const f = files.get(r.ref) ?? { path: r.ref, readers: [], reads: 0, lastAt: 0 };
      if (!f.readers.includes(key)) f.readers.push(key);
      f.reads++;
      f.lastAt = Math.max(f.lastAt, r.at);
      files.set(r.ref, f);
    }
  }
  const ranked = [...files.values()].sort((a, b) => b.readers.length - a.readers.length || b.lastAt - a.lastAt);
  return { byPanelist, files: ranked, complete: activity.complete, watchingSince: activity.watchingSince };
}

export function liveEvidence(files: readonly LiveFile[]): EvidenceSet {
  const ranked = [...files].sort((a, b) => b.readers.length - a.readers.length || b.lastAt - a.lastAt);
  const byPanelist: Record<string, string[]> = {};
  for (const f of ranked) for (const who of f.readers) (byPanelist[who] ??= []).push(f.path);
  return {
    items: ranked.map((f) => ({ id: f.path, label: labelOf(f.path), citedBy: [...f.readers].sort(), count: f.reads })),
    byPanelist,
  };
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const basename = (p: string): string => p.split("/").filter((s) => s !== "").pop() ?? p;
const clip = (s: string): string => (s.length > PATTERN_MAX ? `${s.slice(0, PATTERN_MAX)}…` : s);

export function caption(p: PanelistLive | null, running: boolean, now: number): string | null {
  if (running) {
    if (!p || p.now === null || p.lastActiveAt === null || now - p.lastActiveAt > THINKING_MS) return "thinking";
    return p.now.kind === "read" ? `reading ${basename(p.now.target ?? "")}` : `searching '${clip(p.now.target ?? "")}'`;
  }
  if (!p) return null;
  const parts = [p.counts.reads > 0 ? plural(p.counts.reads, "read", "reads") : "", p.counts.searches > 0 ? plural(p.counts.searches, "search", "searches") : ""].filter((s) => s !== "");
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function mergeActivity(prev: RunActivity | null, next: RunActivity, partial: boolean): RunActivity {
  if (!partial || prev === null || prev.epoch !== next.epoch) return next;
  const subs = prev.subagents.map((s) => ({ ...s, activity: [...s.activity] }));
  for (const n of next.subagents) {
    const s = subs.find((x) => x.id === n.id);
    if (!s) {
      subs.push({ ...n, activity: [...n.activity] });
      continue;
    }
    s.status = n.status;
    s.description = n.description;
    s.createdAt = n.createdAt;
    s.endedAt = n.endedAt;
    for (const a of n.activity) {
      const i = s.activity.findIndex((x) => x.callId === a.callId);
      if (i === -1) s.activity.push(a);
      else s.activity[i] = a;
    }
  }
  return { ...next, subagents: subs };
}
