import type { RunActivity } from "../../shared/activity";
import { shortKey, type LiveRun } from "../../shared/recognize";
import { digest, type Timeline, type TimelineEvent } from "../../shared/runs";

// The collector-sourced part of a run's timeline (starts, reads, searches, ends), before the
// archiver adds judgment and outcome events.
export interface ArchiveActivity {
  complete: boolean;
  watchingSince: string | null;
  events: TimelineEvent[];
}

// When a judgment file landed, by its short key (`judgments/<key>.json`).
export interface JudgmentTime {
  panelist: string;
  at: string;
}

const KIND_ORDER: Record<TimelineEvent["kind"], number> = { "panelist-start": 0, read: 1, search: 1, judgment: 2, "panelist-end": 3, outcome: 4 };

const iso = (s: string): string | null => {
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function sortEvents(events: readonly TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || cmp(a.callId ?? "", b.callId ?? ""));
}

// The run's panelists joined to their sub-agents (a panelist row's callId is its sub-agent's
// id). Only tool names' targets are kept: paths for reads, patterns for searches.
export function activityPart(run: LiveRun, activity: RunActivity): ArchiveActivity | null {
  const events: TimelineEvent[] = [];
  const matchedSubs: typeof activity.subagents = [];
  for (const row of run.panelists) {
    const sub = activity.subagents.find((s) => s.id === row.callId);
    if (!sub) continue;
    matchedSubs.push(sub);
    const panelist = shortKey(row.persona);
    const start = iso(sub.createdAt);
    if (start) events.push({ at: start, kind: "panelist-start", panelist, callId: sub.id });
    for (const a of sub.activity) {
      if (a.kind === "other") continue;
      const when = iso(a.at);
      if (when) events.push({ at: when, kind: a.kind, panelist, callId: sub.id, target: a.target });
    }
    const end = sub.endedAt ? iso(sub.endedAt) : null;
    if (end && sub.status !== "running") events.push({ at: end, kind: "panelist-end", panelist, callId: sub.id, status: sub.status });
  }
  if (matchedSubs.length === 0) return null;
  // Run-scoped, not agent-scoped: the collector's `complete` covers every sub-agent the parent
  // agent has ever had, but a reconnect or reload only needs to have watched this run's own.
  const watching = activity.watchingSince !== null ? Date.parse(activity.watchingSince) : null;
  const complete = activity.complete || (watching !== null && matchedSubs.every((s) => Date.parse(s.createdAt) >= watching));
  return { complete, watchingSince: activity.watchingSince, events: sortEvents(events) };
}

// A re-archive's activity, plus the earlier attempts it doesn't cover: a re-run archived from a
// later turn may show only the re-run panelist, and the collector may have dropped older ones.
export function withEarlier(prev: ArchiveActivity | null, next: ArchiveActivity): ArchiveActivity {
  if (!prev) return next;
  const fresh = new Set(next.events.map((e) => e.callId));
  const kept = prev.events.filter((e) => e.callId !== null && !fresh.has(e.callId));
  if (kept.length === 0) return next;
  // A reconnect can degrade next's complete/watchingSince even though the kept (earlier) events
  // were already fully covered by prev's window. When that's so, keep prev's window.
  const nextWatching = next.watchingSince !== null ? Date.parse(next.watchingSince) : null;
  const keepsPrevWindow = prev.complete && nextWatching !== null && kept.every((e) => Date.parse(e.at) < nextWatching);
  return {
    complete: keepsPrevWindow || (prev.complete && next.complete),
    watchingSince: keepsPrevWindow ? prev.watchingSince : prev.complete ? next.watchingSince : prev.watchingSince,
    events: sortEvents([...kept, ...next.events]),
  };
}

export function activityOf(timeline: Timeline): ArchiveActivity {
  return {
    complete: timeline.complete,
    watchingSince: timeline.watchingSince,
    events: timeline.events.filter((e) => e.kind !== "judgment" && e.kind !== "outcome"),
  };
}

// The full timeline: the activity, each judgment (never before its panelist's first start), and
// the outcome at comparedAt.
export function buildTimeline(activity: ArchiveActivity, judgments: readonly JudgmentTime[], comparedAt: string | null): Timeline {
  const firstStart = new Map<string, number>();
  for (const e of activity.events) {
    if (e.kind !== "panelist-start" || e.panelist === null) continue;
    const t = Date.parse(e.at);
    const cur = firstStart.get(e.panelist);
    if (cur === undefined || t < cur) firstStart.set(e.panelist, t);
  }
  const events: TimelineEvent[] = [...activity.events];
  for (const j of judgments) {
    const start = firstStart.get(j.panelist);
    const when = start !== undefined && Date.parse(j.at) < start ? new Date(start).toISOString() : j.at;
    events.push({ at: when, kind: "judgment", panelist: j.panelist, callId: null });
  }
  if (comparedAt) events.push({ at: comparedAt, kind: "outcome", panelist: null, callId: null });
  return { schemaVersion: 1, complete: activity.complete, watchingSince: activity.watchingSince, events: sortEvents(events) };
}

// Field by field, not JSON.stringify of the objects: zod rebuilds parsed objects in schema key
// order, so a carried-forward timeline would otherwise never match its own digest.
export function activityDigest(activity: ArchiveActivity): string {
  const rows = activity.events.map((e) => [e.at, e.kind, e.panelist, e.callId, e.status ?? null, e.target ?? null]);
  return digest(JSON.stringify([activity.complete, activity.watchingSince, rows]));
}
