import { describe, expect, it } from "vitest";
import { runMetaSchema, timelineSchema } from "../../shared/runs";

const timeline = {
  schemaVersion: 1,
  complete: true,
  watchingSince: "2026-10-10T19:00:00.000Z",
  events: [
    { at: "2026-10-10T19:00:01.000Z", kind: "panelist-start", panelist: "guardian", callId: "s1" },
    { at: "2026-10-10T19:00:02.000Z", kind: "read", panelist: "guardian", callId: "s1", target: "/repo/a.ts" },
    { at: "2026-10-10T19:00:03.000Z", kind: "panelist-end", panelist: "guardian", callId: "s1", status: "failed" },
    { at: "2026-10-10T19:00:04.000Z", kind: "outcome", panelist: null, callId: null },
  ],
};

describe("timelineSchema", () => {
  it("accepts a timeline with every optional field used or left out", () => {
    expect(timelineSchema.safeParse(timeline).success).toBe(true);
  });

  it("rejects a non-ISO time, an unknown kind and another schema version", () => {
    expect(timelineSchema.safeParse({ ...timeline, events: [{ ...timeline.events[0], at: "yesterday" }] }).success).toBe(false);
    expect(timelineSchema.safeParse({ ...timeline, events: [{ ...timeline.events[0], kind: "write" }] }).success).toBe(false);
    expect(timelineSchema.safeParse({ ...timeline, schemaVersion: 2 }).success).toBe(false);
  });
});

describe("runMetaSchema", () => {
  it("still parses a meta written before timelineDigest existed", () => {
    const meta = {
      schemaVersion: 1,
      id: "20261009T201512Z-Ab12Cd",
      source: "paseo",
      tmpDir: "/tmp/aska-panel-Ab12Cd",
      agentId: null,
      workspaceId: null,
      projectPath: null,
      question: "q",
      panel: null,
      panelists: [],
      startedAt: "2026-10-09T20:15:12.000Z",
      comparedAt: null,
      archivedAt: "2026-10-09T20:16:00.000Z",
      digest: "0123456789abcdef",
      reportCallId: null,
      skipped: [],
    };
    expect(runMetaSchema.safeParse(meta).success).toBe(true);
    expect(runMetaSchema.parse({ ...meta, timelineDigest: "fedcba9876543210" }).timelineDigest).toBe("fedcba9876543210");
  });
});
