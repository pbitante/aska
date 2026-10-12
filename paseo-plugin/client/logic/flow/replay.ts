import type { RunActivity, SubagentActivity } from "../../../shared/activity";
import type { LiveRun, PanelistState } from "../../../shared/recognize";
import type { RunReport, Timeline, TimelineEvent } from "../../../shared/runs";
import { shortPersona } from "../report";
import { liveActivity, type LiveActivity } from "./activity";
import type { StartTimes } from "./model";

// A whole replay takes REPLAY_MS, or real time if the run was shorter. The clock ticks every TICK_MS.
export const REPLAY_MS = 24_000;
export const TICK_MS = 100;

export interface ReplayInputs {
  run: LiveRun;
  report: RunReport;
  startedAt: StartTimes;
  live: LiveActivity | null;
}
export interface Moment {
  at: number;
  label: string;
}
export interface RunSpan {
  start: number;
  end: number;
}

type EndStatus = NonNullable<TimelineEvent["status"]>;
const END_STATE: Record<EndStatus, PanelistState> = { completed: "done", failed: "failed", canceled: "canceled" };
const END_VERB: Record<EndStatus, string> = { completed: "finishes", failed: "fails", canceled: "is canceled" };
const SUB_STATUS: Record<PanelistState, SubagentActivity["status"]> = { running: "running", done: "completed", failed: "failed", canceled: "canceled" };

const ms = (e: TimelineEvent): number => Date.parse(e.at);
const basename = (p: string): string => p.split("/").filter((s) => s !== "").pop() ?? p;

// The Flow's inputs at time t (ms since epoch), for buildFlowModel. Without a timeline: the outcome only.
export function replayAt(report: RunReport, timeline: Timeline | null, t: number): ReplayInputs {
  const run: LiveRun = { dir: report.dir, panelists: [], reportCallId: report.meta?.reportCallId ?? null, judgmentsSaved: [] };
  if (!timeline) return { run: { ...run, judgmentsSaved: report.judgments.map((j) => shortPersona(j.persona)) }, report, startedAt: {}, live: null };

  const outcome = timeline.events.find((e) => e.kind === "outcome");
  const atOutcome = outcome ? ms(outcome) <= t : t >= runSpan(timeline).end;
  const startedAt: StartTimes = {};
  const attempts: Record<string, number> = {};
  for (const e of timeline.events) {
    if (e.kind !== "panelist-start" || ms(e) > t || e.callId === null || e.panelist === null || e.callId in startedAt) continue;
    const n = attempts[e.panelist] ?? 0;
    attempts[e.panelist] = n + 1;
    startedAt[e.callId] = ms(e);
    run.panelists.push({ kind: "panelist", callId: e.callId, state: "running", persona: e.panelist, reask: n > 0, error: null });
  }
  for (const e of timeline.events) {
    if (e.kind !== "panelist-end" || ms(e) > t || e.status === undefined) continue;
    const row = run.panelists.find((r) => r.callId === e.callId);
    if (!row) continue;
    row.state = END_STATE[e.status];
    row.error = e.status === "failed" ? "failed" : null;
  }
  // A panelist whose end the collector never saw is done by the outcome, not running forever.
  if (atOutcome) for (const r of run.panelists) if (r.state === "running") r.state = "done";
  for (const e of timeline.events) {
    if (e.kind === "judgment" && ms(e) <= t && e.panelist !== null && !run.judgmentsSaved.includes(e.panelist)) run.judgmentsSaved.push(e.panelist);
  }

  const subagents: SubagentActivity[] = run.panelists.map((r) => ({
    id: r.callId,
    status: SUB_STATUS[r.state],
    description: null,
    createdAt: new Date(startedAt[r.callId] ?? t).toISOString(),
    activity: [],
  }));
  timeline.events.forEach((e, i) => {
    if ((e.kind !== "read" && e.kind !== "search") || ms(e) > t) return;
    // The event's index is its id, so the same read keeps its id from tick to tick.
    subagents.find((s) => s.id === e.callId)?.activity.push({ seq: i, callId: `${e.callId ?? ""}#${i}`, kind: e.kind, target: e.target ?? null, at: e.at });
  });
  const activity: RunActivity = { epoch: "replay", cursor: 0, complete: timeline.complete, watchingSince: timeline.watchingSince, subagents };
  const shown: RunReport = {
    ...report,
    judgments: atOutcome ? report.judgments : report.judgments.filter((j) => run.judgmentsSaved.includes(shortPersona(j.persona))),
    comparison: atOutcome ? report.comparison : null,
  };
  return { run, report: shown, startedAt, live: liveActivity(run, activity, report.brief) };
}

// From the first event (or watchingSince, for a partial timeline) to the outcome (or the last event).
export function runSpan(timeline: Timeline): RunSpan {
  const times = timeline.events.map(ms);
  const first = times.length > 0 ? Math.min(...times) : null;
  const last = times.length > 0 ? Math.max(...times) : null;
  const watching = timeline.watchingSince !== null ? Date.parse(timeline.watchingSince) : null;
  const start = !timeline.complete && watching !== null && first !== null && watching > first ? watching : (first ?? watching ?? 0);
  const outcome = timeline.events.find((e) => e.kind === "outcome");
  const end = outcome ? ms(outcome) : (last ?? start);
  return { start, end: Math.max(start, end) };
}

// The moments prev/next step between: starts, the first read of each file, judgments, ends and the outcome.
export function moments(timeline: Timeline): Moment[] {
  const { start } = runSpan(timeline);
  const seen: string[] = [];
  const out: Moment[] = [];
  for (const e of timeline.events) {
    const who = e.panelist ?? "";
    let label: string | null = null;
    if (e.kind === "panelist-start") label = `${who} starts`;
    else if (e.kind === "read" && e.target && !seen.includes(e.target)) {
      seen.push(e.target);
      label = `${who} reads ${basename(e.target)}`;
    } else if (e.kind === "judgment") label = `${who}'s judgment lands`;
    else if (e.kind === "panelist-end") label = `${who} ${END_VERB[e.status ?? "completed"]}`;
    else if (e.kind === "outcome") label = "outcome";
    if (label !== null && ms(e) >= start) out.push({ at: ms(e), label });
  }
  return out.sort((a, b) => a.at - b.at);
}

export const nextMoment = (marks: readonly Moment[], t: number): number | null => marks.find((m) => m.at > t)?.at ?? null;

export function prevMoment(marks: readonly Moment[], t: number): number | null {
  let out: number | null = null;
  for (const m of marks) if (m.at < t) out = m.at;
  return out;
}

export function momentAt(marks: readonly Moment[], t: number): Moment | null {
  let out: Moment | null = null;
  for (const m of marks) if (m.at <= t) out = m;
  return out;
}

const clock = (elapsed: number): string => {
  const s = Math.max(0, Math.floor(elapsed / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function replayLabel(span: RunSpan, marks: readonly Moment[], t: number): string {
  const m = momentAt(marks, t);
  return m ? `${clock(t - span.start)} · ${m.label}` : clock(t - span.start);
}

// Advances t by `elapsed` wall-clock ms: frame-rate independent, compressed to REPLAY_MS for long runs.
export function stepPlayback(t: number, elapsed: number, span: RunSpan): number {
  const rate = Math.max(1, (span.end - span.start) / REPLAY_MS);
  return Math.min(span.end, t + elapsed * rate);
}

export function scrubTime(x: number, width: number, span: RunSpan): number {
  if (width <= 0) return span.end;
  return span.start + Math.min(1, Math.max(0, x / width)) * (span.end - span.start);
}

export const scrubFraction = (t: number, span: RunSpan): number =>
  span.end > span.start ? Math.min(1, Math.max(0, (t - span.start) / (span.end - span.start))) : 1;

// Whether the scrubber should hand its touch to the panel's ScrollView when asked: yes for a
// mostly vertical swipe (so the panel still scrolls from the strip), no for a horizontal or
// slightly diagonal drag.
export function scrubYields(start: { x: number; y: number }, now: { x: number; y: number }): boolean {
  return Math.abs(now.y - start.y) > Math.abs(now.x - start.x);
}
