import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LiveActivity } from "../../client/logic/flow/activity";
import { bumpFlashes, buildFlowModel, particleReads, searchFlashes, startTimes, trackStop } from "../../client/logic/flow/model";
import type { LiveRun, PanelistRow } from "../../shared/recognize";
import { comparisonSchema, panelResultSchema, type RunReport } from "../../shared/runs";

const DIR = "/tmp/aska-panel-6au0hY";
const fx = (file: string) => JSON.parse(readFileSync(join(__dirname, "../fixtures/runs/plan-trio", file), "utf8")) as unknown;
const brief = readFileSync(join(__dirname, "../fixtures/runs/plan-trio/brief.md"), "utf8");
const result = panelResultSchema.parse(fx("panel-result.json"));
const comparison = comparisonSchema.parse(fx("comparison.json"));
const judgments = result.panelists.map((p) => ({ persona: p.persona, judgment: p.judgment }));

const row = (callId: string, persona: string, state: PanelistRow["state"] = "running", reask = false): PanelistRow => ({ kind: "panelist", callId, state, persona, reask, error: null });
const run = (panelists: PanelistRow[], judgmentsSaved: string[] = [], reportCallId: string | null = null): LiveRun => ({ dir: DIR, panelists, reportCallId, judgmentsSaved });
const report = (over: Partial<RunReport> = {}): RunReport => ({ source: "live", dir: DIR, brief, result: null, comparison: null, judgments: [], meta: null, compareError: null, timeline: null, ...over });

describe("phases", () => {
  it("is running before any judgment, with personas, initials and start times", () => {
    const m = buildFlowModel(run([row("c1", "guardian"), row("c2", "accelerator")]), null, { c1: 1000 });
    expect(m.phase).toBe("running");
    expect(m.panelists.map((p) => [p.id, p.persona, p.initial, p.state, p.startedAt])).toEqual([
      ["guardian", "guardian", "G", "running", 1000],
      ["accelerator", "accelerator", "A", "running", null],
    ]);
    expect(m.units).toEqual([]);
    expect(m.evidence.items).toEqual([]);
  });

  it("is collecting once a judgment is saved, with that judgment's verdict and evidence", () => {
    const guardian = judgments.find((j) => j.persona === "aska:guardian")!;
    const m = buildFlowModel(run([row("c1", "guardian", "done"), row("c2", "planner")], ["guardian"]), report({ judgments: [guardian] }), {});
    expect(m.phase).toBe("collecting");
    const g = m.panelists.find((p) => p.key === "guardian")!;
    expect(g).toMatchObject({ id: "guardian", persona: "aska:guardian", verdict: "proceed-with-conditions", status: null });
    expect(g.evidence.length).toBeGreaterThan(0);
  });

  it("is the outcome once a comparison exists, with short ids and track positions", () => {
    const m = buildFlowModel(
      run([row("c1", "planner", "done"), row("c2", "guardian", "done"), row("c3", "accelerator", "done")], ["planner", "guardian", "accelerator"], "r1"),
      report({ result, comparison, judgments }),
      {},
    );
    expect(m.phase).toBe("outcome");
    expect(m.panelists.map((p) => [p.id, p.persona, p.status, p.verdict])).toEqual([
      ["planner", "aska:planner", "ok", "proceed-with-conditions"],
      ["guardian", "aska:guardian", "ok", "proceed-with-conditions"],
      ["accelerator", "aska:accelerator", "ok", "proceed-with-conditions"],
    ]);
    expect(m.units).toHaveLength(8);
    const pos = (unit: string) => Object.fromEntries(m.units.find((u) => u.id === unit)!.cells.map((c) => [c.panelist, c.position]));
    expect(pos("aska:delivery-speed")).toEqual({ planner: "not-raised", guardian: null, accelerator: "high" });
    expect(pos("aska:rollback-safety")).toEqual({ planner: "cleared", guardian: "high", accelerator: "not-raised" });
    expect(m.units.find((u) => u.id === "aska:rollback-safety")!.label).toBe("rollback-safety");
  });
});

describe("identity", () => {
  it("merges re-asks and naming styles into one panelist, taking the latest state", () => {
    const m = buildFlowModel(run([row("c1", "guardian", "done"), row("c2", "guardian", "running", true)]), report({ comparison }), {});
    const guardians = m.panelists.filter((p) => p.key === "guardian");
    expect(guardians).toHaveLength(1);
    expect(guardians[0]).toMatchObject({ id: "guardian", persona: "aska:guardian", reask: true, state: "running" });
  });
  it("gives two-letter initials on a collision", () => {
    const m = buildFlowModel(run([row("c1", "tester"), row("c2", "tracker"), row("c3", "guardian")]), null, {});
    expect(m.panelists.map((p) => p.initial)).toEqual(["Te", "Tr", "G"]);
  });
  it("adds panelists known only from the comparison, as done", () => {
    const m = buildFlowModel(run([]), report({ comparison }), {});
    expect(m.panelists.map((p) => [p.id, p.state])).toEqual([
      ["planner", "done"],
      ["guardian", "done"],
      ["accelerator", "done"],
    ]);
  });
  it("handles an empty run without throwing", () => {
    expect(buildFlowModel({ dir: null, panelists: [], reportCallId: null, judgmentsSaved: [] }, null, {})).toMatchObject({ phase: "running", panelists: [], units: [] });
  });
  it("keeps the panelist id stable whether known only from the timeline or also from a comparison naming it canonically", () => {
    const fromTimeline = buildFlowModel(run([row("c1", "guardian")]), null, {});
    const fromComparison = buildFlowModel(run([row("c1", "guardian")]), report({ comparison }), {});
    expect(fromTimeline.panelists.find((p) => p.key === "guardian")!.id).toBe("guardian");
    expect(fromComparison.panelists.find((p) => p.key === "guardian")!.id).toBe("guardian");
  });
});

describe("trackStop and startTimes", () => {
  const cell = (status: string, tier: string, severity: string | null) => ({ persona: "p", tier, status, severity, claim: null, why: null }) as Parameters<typeof trackStop>[0];
  it("maps every cell status and severity", () => {
    expect(trackStop(cell("flagged", "primary", "low"))).toBe("low");
    expect(trackStop(cell("flagged", "primary", "medium"))).toBe("medium");
    expect(trackStop(cell("flagged", "primary", "high"))).toBe("high");
    expect(trackStop(cell("flagged", "primary", "critical"))).toBe("high");
    expect(trackStop(cell("flagged", "primary", null))).toBe("medium");
    expect(trackStop(cell("cleared", "primary", null))).toBe("cleared");
    expect(trackStop(cell("not-applicable", "secondary", null))).toBe("not-raised");
    expect(trackStop(cell("not-raised", "secondary", null))).toBe("not-raised");
    expect(trackStop(cell("not-raised", "none", null))).toBeNull();
  });
  it("records the first timestamp seen per call", () => {
    const entries = [
      { item: { type: "tool_call", callId: "c1" }, timestamp: "2026-10-10T10:00:00.000Z" },
      { item: { type: "tool_call", callId: "c1" }, timestamp: "2026-10-10T10:05:00.000Z" },
      { item: { type: "assistant_message", text: "hi" }, timestamp: "2026-10-10T10:01:00.000Z" },
      { item: { type: "tool_call", callId: "c2" }, timestamp: "not a date" },
    ];
    expect(startTimes(entries)).toEqual({ c1: Date.parse("2026-10-10T10:00:00.000Z") });
  });
});

describe("live activity", () => {
  const live = (over: Partial<LiveActivity> = {}): LiveActivity => ({
    byPanelist: {
      guardian: { now: null, counts: { reads: 2, searches: 0 }, recent: [], lastActiveAt: 1, readIds: ["r1", "r2"] },
    },
    files: [
      { path: "server/runs/archive.ts", readers: ["guardian", "planner"], reads: 3, lastAt: 5 },
      { path: "server/runs/store.ts", readers: ["guardian"], reads: 1, lastAt: 4 },
    ],
    complete: false,
    watchingSince: "2026-10-10T19:00:00.000Z",
    ...over,
  });

  it("without activity, panelists and the model carry live: null and nothing else changes", () => {
    const a = buildFlowModel(run([row("c1", "guardian")]), null, {});
    expect(a.live).toBeNull();
    expect(a.panelists[0]!.live).toBeNull();
  });

  it("while running, the ring is the live files and panelists link to what they read", () => {
    const m = buildFlowModel(run([row("c1", "guardian"), row("c2", "planner")]), null, {}, live());
    expect(m.phase).toBe("running");
    expect(m.evidence.items.map((e) => [e.id, e.citedBy])).toEqual([
      ["server/runs/archive.ts", ["guardian", "planner"]],
      ["server/runs/store.ts", ["guardian"]],
    ]);
    expect(m.panelists.find((p) => p.key === "guardian")!.evidence).toEqual(["server/runs/archive.ts", "server/runs/store.ts"]);
    expect(m.panelists.find((p) => p.key === "guardian")!.live?.counts.reads).toBe(2);
    expect(m.live).toEqual({ complete: false, watchingSince: "2026-10-10T19:00:00.000Z" });
  });

  it("at the outcome, the ring is the cited evidence, marked with how many panelists read each file", () => {
    const m = buildFlowModel(run([row("c1", "guardian", "done")]), report({ comparison, judgments }), {}, live({ files: [] }));
    expect(m.phase).toBe("outcome");
    expect(m.evidence.items.every((e) => e.readBy === undefined)).toBe(true);
    const cited = m.evidence.items[0]!.id;
    const withRead = buildFlowModel(run([row("c1", "guardian", "done")]), report({ comparison, judgments }), {}, live({ files: [{ path: cited, readers: ["guardian", "planner"], reads: 2, lastAt: 1 }] }));
    expect(withRead.evidence.items.find((e) => e.id === cited)!.readBy).toBe(2);
  });
});

describe("particleReads", () => {
  const withReads = (readIds: string[], recent: { callId: string; ref: string | null }[]): LiveActivity => ({
    byPanelist: { guardian: { now: null, counts: { reads: readIds.length, searches: 0 }, recent: recent.map((r) => ({ ...r, kind: "read" as const, target: r.ref, at: 1 })), lastActiveAt: 1, readIds } },
    files: [],
    complete: true,
    watchingSince: null,
  });
  const m = (l: LiveActivity | null) => buildFlowModel(run([row("c1", "guardian")]), null, {}, l);

  it("returns nothing on the first activity load", () => {
    expect(particleReads(m(null), m(withReads(["a"], [{ callId: "a", ref: "x.ts" }])))).toEqual([]);
  });
  it("returns one entry per new read, with its ring ref", () => {
    const before = m(withReads(["a"], [{ callId: "a", ref: "x.ts" }]));
    const after = m(withReads(["a", "b", "c"], [{ callId: "a", ref: "x.ts" }, { callId: "b", ref: "y.ts" }, { callId: "c", ref: null }]));
    expect(particleReads(before, after)).toEqual([
      { panelist: "guardian", ref: "y.ts" },
      { panelist: "guardian", ref: null },
    ]);
  });
});

describe("searchFlashes", () => {
  const withSearches = (searches: number): LiveActivity => ({
    byPanelist: { guardian: { now: null, counts: { reads: 0, searches }, recent: [], lastActiveAt: 1, readIds: [] } },
    files: [],
    complete: true,
    watchingSince: null,
  });
  const m = (l: LiveActivity | null) => buildFlowModel(run([row("c1", "guardian")]), null, {}, l);

  it("returns nothing on the first activity load", () => {
    expect(searchFlashes(m(null), m(withSearches(1)))).toEqual([]);
  });
  it("returns the panelist id when its search count grows", () => {
    expect(searchFlashes(m(withSearches(1)), m(withSearches(2)))).toEqual(["guardian"]);
  });
  it("returns nothing when the count is unchanged", () => {
    expect(searchFlashes(m(withSearches(1)), m(withSearches(1)))).toEqual([]);
  });
});

describe("bumpFlashes", () => {
  it("counts each flash per node", () => {
    const once = bumpFlashes({}, ["p:a", "e:x"], ["p:a", "e:x", "chair"]);
    expect(bumpFlashes(once, ["p:a"], ["p:a", "e:x", "chair"])).toEqual({ "p:a": 2, "e:x": 1 });
  });

  it("drops nodes that are no longer laid out, so the map can't grow per node id forever", () => {
    expect(bumpFlashes({ "p:a": 3, "e:gone": 2 }, ["p:a"], ["p:a"])).toEqual({ "p:a": 4 });
  });

  it("ignores a flash for a node that isn't laid out", () => {
    expect(bumpFlashes({}, ["p:a", "p:hidden"], ["p:a"])).toEqual({ "p:a": 1 });
  });
});
