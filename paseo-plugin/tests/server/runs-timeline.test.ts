import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyUpdate, emptyState, snapshot } from "../../server/activity/state";
import { activityDigest, activityOf, activityPart, buildTimeline, sortEvents, withEarlier, type ArchiveActivity } from "../../server/runs/timeline";
import type { RunActivity } from "../../shared/activity";
import type { LiveRun, PanelistRow } from "../../shared/recognize";
import { timelineSchema, type TimelineEvent } from "../../shared/runs";

const fx = JSON.parse(readFileSync(join(__dirname, "../fixtures/activity/events.json"), "utf8")) as { parentAgentId: string; guardian: unknown[] };
const GUARDIAN = "toolu_01Jue2EXmGFLXvtfC4mQTijf";
const BASE = Date.parse("2026-10-10T19:00:00.000Z");
const at = (s: number) => new Date(BASE + s * 1000).toISOString();

const row = (callId: string, persona: string, reask = false): PanelistRow => ({ kind: "panelist", callId, state: "done", persona, reask, error: null });
const run = (panelists: PanelistRow[]): LiveRun => ({ dir: "/tmp/aska-panel-Ab12Cd", panelists, reportCallId: "r1", judgmentsSaved: [] });
const recorded = (): RunActivity => {
  const s = emptyState("e1");
  s.up = true;
  s.startedAt = "2026-10-10T15:00:00.000Z";
  for (const m of fx.guardian) applyUpdate(s, m, Date.parse("2026-10-10T16:00:00.000Z"));
  return snapshot(s, fx.parentAgentId);
};
const sub = (id: string, start: number, end: number | null, activity: RunActivity["subagents"][number]["activity"] = []): RunActivity["subagents"][number] => ({
  id,
  status: end === null ? "running" : "completed",
  description: null,
  createdAt: at(start),
  endedAt: end === null ? null : at(end),
  activity,
});
const collector = (subagents: RunActivity["subagents"], over: Partial<RunActivity> = {}): RunActivity => ({ epoch: "e", cursor: 1, complete: true, watchingSince: at(-60), subagents, ...over });
const ev = (s: number, kind: TimelineEvent["kind"], panelist: string | null, callId: string | null, extra: Partial<TimelineEvent> = {}): TimelineEvent => ({ at: at(s), kind, panelist, callId, ...extra });

describe("activityPart", () => {
  it("joins the recorded guardian to its panelist row: start, 14 reads, 3 searches, end", () => {
    const part = activityPart(run([row(GUARDIAN, "aska:guardian")]), recorded())!;
    const count = (k: TimelineEvent["kind"]) => part.events.filter((e) => e.kind === k).length;
    expect([count("panelist-start"), count("read"), count("search"), count("panelist-end")]).toEqual([1, 14, 3, 1]);
    expect(part.events[0]).toEqual({ at: "2026-10-10T15:42:24.187Z", kind: "panelist-start", panelist: "guardian", callId: GUARDIAN });
    expect(part.events.find((e) => e.kind === "panelist-end")).toEqual({ at: "2026-10-10T15:43:46.581Z", kind: "panelist-end", panelist: "guardian", callId: GUARDIAN, status: "completed" });
    expect(part.events.every((e) => e.panelist === "guardian" && e.callId === GUARDIAN)).toBe(true);
    expect(part.events.filter((e) => e.kind === "read").every((e) => typeof e.target === "string" && e.target.startsWith("/"))).toBe(true);
    expect(part.events).toEqual(sortEvents(part.events));
    expect(part).toMatchObject({ complete: true, watchingSince: "2026-10-10T15:00:00.000Z" });
    expect(timelineSchema.safeParse(buildTimeline(part, [], null)).success).toBe(true);
  });

  it("returns null when no sub-agent matches any panelist", () => {
    expect(activityPart(run([row("someone-else", "aska:guardian")]), recorded())).toBeNull();
  });

  it("keeps a re-ask as a second callId for the same panelist", () => {
    const part = activityPart(run([row("s1", "aska:guardian"), row("s2", "aska:guardian", true)]), collector([sub("s1", 0, 5), sub("s2", 10, 20)]))!;
    expect(part.events.filter((e) => e.kind === "panelist-start").map((e) => [e.panelist, e.callId])).toEqual([
      ["guardian", "s1"],
      ["guardian", "s2"],
    ]);
  });

  it("drops 'other' entries and gives a still-running sub-agent no end", () => {
    const other = { seq: 1, callId: "t1", kind: "other" as const, target: null, at: at(2) };
    const part = activityPart(run([row("s1", "aska:guardian")]), collector([sub("s1", 0, null, [other])]))!;
    expect(part.events.map((e) => e.kind)).toEqual(["panelist-start"]);
  });

  it("is run-scoped complete: true when every matched sub started after watchingSince, even if the collector snapshot isn't complete", () => {
    const part = activityPart(run([row("s1", "aska:guardian")]), collector([sub("s1", 10, 20)], { complete: false, watchingSince: at(5) }))!;
    expect(part.complete).toBe(true);
  });

  it("is run-scoped complete: stays false when a matched sub predates watchingSince", () => {
    const part = activityPart(run([row("s1", "aska:guardian")]), collector([sub("s1", 0, 20)], { complete: false, watchingSince: at(5) }))!;
    expect(part.complete).toBe(false);
  });
});

describe("sortEvents", () => {
  it("orders by time, then kind, then callId", () => {
    const shuffled = [
      ev(1, "outcome", null, null),
      ev(1, "panelist-end", "g", "b", { status: "completed" }),
      ev(1, "judgment", "g", null),
      ev(1, "search", "g", "b", { target: "x" }),
      ev(1, "read", "p", "a", { target: "/r/a.ts" }),
      ev(1, "panelist-start", "g", "b"),
      ev(1, "panelist-start", "p", "a"),
      ev(0, "outcome", null, null),
    ];
    expect(sortEvents(shuffled).map((e) => `${e.at === at(0) ? 0 : 1}:${e.kind}:${e.callId ?? "-"}`)).toEqual([
      "0:outcome:-",
      "1:panelist-start:a",
      "1:panelist-start:b",
      "1:read:a",
      "1:search:b",
      "1:judgment:-",
      "1:panelist-end:b",
      "1:outcome:-",
    ]);
  });
});

describe("buildTimeline", () => {
  const part: ArchiveActivity = { complete: false, watchingSince: at(-5), events: [ev(0, "panelist-start", "guardian", "s1"), ev(10, "panelist-start", "planner", "s2")] };

  it("adds judgments (clamped to their panelist's first start) and the outcome, and copies complete and watchingSince", () => {
    const t = buildTimeline(part, [{ panelist: "planner", at: at(3) }, { panelist: "guardian", at: at(4) }, { panelist: "tester", at: at(-9) }], at(30));
    expect(t).toMatchObject({ schemaVersion: 1, complete: false, watchingSince: at(-5) });
    expect(t.events.map((e) => [e.at, e.kind, e.panelist])).toEqual([
      [at(-9), "judgment", "tester"],
      [at(0), "panelist-start", "guardian"],
      [at(4), "judgment", "guardian"],
      [at(10), "panelist-start", "planner"],
      [at(10), "judgment", "planner"],
      [at(30), "outcome", null],
    ]);
  });

  it("has no outcome event when there is no comparedAt", () => {
    expect(buildTimeline(part, [], null).events.some((e) => e.kind === "outcome")).toBe(false);
  });
});

describe("withEarlier and activityOf", () => {
  const prev: ArchiveActivity = { complete: false, watchingSince: at(-5), events: [ev(0, "panelist-start", "planner", "s1"), ev(1, "panelist-start", "guardian", "s2"), ev(2, "read", "guardian", "s2", { target: "/r/old.ts" })] };

  it("keeps attempts the new activity doesn't have, and takes the new activity's events for those it does", () => {
    const next: ArchiveActivity = { complete: true, watchingSince: at(-60), events: [ev(1, "panelist-start", "guardian", "s2"), ev(3, "read", "guardian", "s2", { target: "/r/new.ts" }), ev(9, "panelist-start", "guardian", "s3")] };
    const merged = withEarlier(prev, next);
    expect(merged.events.map((e) => [e.callId, e.kind, e.target ?? null])).toEqual([
      ["s1", "panelist-start", null],
      ["s2", "panelist-start", null],
      ["s2", "read", "/r/new.ts"],
      ["s3", "panelist-start", null],
    ]);
    expect(merged).toMatchObject({ complete: false, watchingSince: at(-5) });
  });

  it("returns the new activity unchanged when nothing earlier is missing from it, or when there is no previous one", () => {
    const next: ArchiveActivity = { complete: true, watchingSince: at(-60), events: prev.events };
    expect(withEarlier(prev, next)).toBe(next);
    expect(withEarlier(null, next)).toBe(next);
  });

  it("on a reconnect, keeps prev's window when prev was complete and every kept attempt predates next's (later) watchingSince", () => {
    const completePrev: ArchiveActivity = { complete: true, watchingSince: at(-60), events: [ev(0, "panelist-start", "planner", "s1"), ev(1, "panelist-start", "guardian", "s2")] };
    const next: ArchiveActivity = { complete: false, watchingSince: at(50), events: [ev(55, "panelist-start", "guardian", "s3")] };
    const merged = withEarlier(completePrev, next);
    expect(merged).toMatchObject({ complete: true, watchingSince: at(-60) });
    expect(merged.events.map((e) => e.callId)).toEqual(["s1", "s2", "s3"]);
  });

  it("activityOf drops judgment and outcome events", () => {
    const t = buildTimeline(prev, [{ panelist: "planner", at: at(4) }], at(30));
    expect(activityOf(t)).toEqual(prev);
  });
});

describe("activityDigest", () => {
  it("is stable across a timeline.json write and zod parse, and changes when activity grows", () => {
    const part = activityPart(run([row(GUARDIAN, "aska:guardian")]), recorded())!;
    const written = JSON.parse(JSON.stringify(buildTimeline(part, [{ panelist: "guardian", at: "2026-10-10T15:43:40.000Z" }], "2026-10-10T15:50:00.000Z")));
    expect(activityDigest(activityOf(timelineSchema.parse(written)))).toBe(activityDigest(part));
    const grown = { ...part, events: [...part.events, ev(99, "read", "guardian", GUARDIAN, { target: "/r/more.ts" })] };
    expect(activityDigest(grown)).not.toBe(activityDigest(part));
  });
});
