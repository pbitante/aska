import type { Timeline } from "../../shared/runs";

export type ReplayMode = "live" | "waiting" | "replay";

export interface ReplayModeInput {
  running: boolean;
  reportCallId: string | null;
  archive: { archivedId: string | null; reportCallId: string | null } | null;
  timeline: Timeline | null;
}

// The live side panel's Flow tab: live while a panelist runs, waiting for the matching archive
// once the run reaches its outcome, and replaying it once found (if it recorded a timeline).
export function liveReplayMode({ running, reportCallId, archive, timeline }: ReplayModeInput): ReplayMode {
  if (running) return "live";
  if (archive === null || archive.archivedId === null || archive.reportCallId !== reportCallId) return "waiting";
  return timeline !== null ? "replay" : "live";
}

export const FAST_POLL_MS = 3000;
export const SLOW_POLL_MS = 15_000;
const FAST_POLL_WINDOW_MS = 60_000;

// The archive can land minutes after the compare, at the chair's turn end: poll quickly at first,
// then settle into a slow, indefinite poll rather than give up.
export function replayPollDelay(elapsedMs: number): number {
  return elapsedMs < FAST_POLL_WINDOW_MS ? FAST_POLL_MS : SLOW_POLL_MS;
}
