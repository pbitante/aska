import { describe, expect, it } from "vitest";
import { FAST_POLL_MS, liveReplayMode, replayPollDelay, SLOW_POLL_MS } from "../../client/logic/replayMode";

const base = { running: false, reportCallId: "r2", archive: null as { archivedId: string | null; reportCallId: string | null } | null, timeline: null };

describe("liveReplayMode", () => {
  it("stays live while a panelist is running, archive or not", () => {
    expect(liveReplayMode({ ...base, running: true })).toBe("live");
    expect(liveReplayMode({ ...base, running: true, archive: { archivedId: "a1", reportCallId: "r2" }, timeline: {} as never })).toBe("live");
  });

  it("waits when the run reached its outcome but no archive exists yet", () => {
    expect(liveReplayMode({ ...base, archive: null })).toBe("waiting");
    expect(liveReplayMode({ ...base, archive: { archivedId: null, reportCallId: null } })).toBe("waiting");
  });

  it("replays once the archive matches the live run's reportCallId and has a timeline", () => {
    expect(liveReplayMode({ ...base, archive: { archivedId: "a1", reportCallId: "r2" }, timeline: {} as never })).toBe("replay");
  });

  it("keeps waiting when the archive is for an older reportCallId", () => {
    expect(liveReplayMode({ ...base, archive: { archivedId: "a0", reportCallId: "r1" }, timeline: {} as never })).toBe("waiting");
  });

  it("falls back to the live outcome view when the matching archive has no timeline", () => {
    expect(liveReplayMode({ ...base, archive: { archivedId: "a1", reportCallId: "r2" }, timeline: null })).toBe("live");
  });
});

describe("replayPollDelay", () => {
  it("polls fast for the first minute", () => {
    expect(replayPollDelay(0)).toBe(FAST_POLL_MS);
    expect(replayPollDelay(59_999)).toBe(FAST_POLL_MS);
  });

  it("settles into a slow, indefinite poll afterwards", () => {
    expect(replayPollDelay(60_000)).toBe(SLOW_POLL_MS);
    expect(replayPollDelay(60 * 60_000)).toBe(SLOW_POLL_MS);
  });
});
