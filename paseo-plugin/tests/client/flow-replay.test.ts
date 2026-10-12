import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LiveActivity } from "../../client/logic/flow/activity";
import { buildFlowModel, diffBase, particleReads, searchFlashes } from "../../client/logic/flow/model";
import {
  scrubYields,
  REPLAY_MS,
  momentAt,
  moments,
  nextMoment,
  prevMoment,
  replayAt,
  replayLabel,
  runSpan,
  scrubFraction,
  scrubTime,
  stepPlayback,
} from "../../client/logic/flow/replay";
import type { LiveRun, PanelistRow } from "../../shared/recognize";
import { comparisonSchema, panelResultSchema, type RunReport, type Timeline, type TimelineEvent } from "../../shared/runs";

const DIR = "/tmp/aska-panel-6au0hY";
const fx = (file: string) => JSON.parse(readFileSync(join(__dirname, "../fixtures/runs/plan-trio", file), "utf8")) as unknown;
const brief = readFileSync(join(__dirname, "../fixtures/runs/plan-trio/brief.md"), "utf8");
const result = panelResultSchema.parse(fx("panel-result.json"));
const comparison = comparisonSchema.parse(fx("comparison.json"));
const judgments = result.panelists.map((p) => ({ persona: p.persona, judgment: p.judgment }));
const PLAN = "/home/u/project/tidepool/docs/plans/2026-03-02-tidepool-step4-offline-sync.md";
const README = "/home/u/project/tidepool/README.md";

const BASE = Date.parse("2026-10-10T19:00:00.000Z");
const at = (s: number) => new Date(BASE + s * 1000).toISOString();
const ms = (s: number) => BASE + s * 1000;
const ev = (s: number, kind: TimelineEvent["kind"], panelist: string | null, callId: string | null, extra: Partial<TimelineEvent> = {}): TimelineEvent => ({ at: at(s), kind, panelist, callId, ...extra });
const TL: Timeline = {
  schemaVersion: 1,
  complete: true,
  watchingSince: at(-60),
  events: [
    ev(0, "panelist-start", "planner", "s-p"),
    ev(1, "panelist-start", "guardian", "s-g"),
    ev(5, "read", "planner", "s-p", { target: PLAN }),
    ev(6, "read", "guardian", "s-g", { target: PLAN }),
    ev(7, "search", "guardian", "s-g", { target: "step 10" }),
    ev(8, "read", "guardian", "s-g", { target: README }),
    ev(20, "panelist-end", "planner", "s-p", { status: "completed" }),
    ev(21, "judgment", "planner", null),
    ev(30, "panelist-end", "guardian", "s-g", { status: "failed" }),
    ev(31, "panelist-start", "guardian", "s-g2"),
    ev(40, "panelist-end", "guardian", "s-g2", { status: "completed" }),
    ev(41, "judgment", "guardian", null),
    ev(60, "outcome", null, null),
  ],
};
const report = (over: Partial<RunReport> = {}): RunReport => ({ source: "archive", dir: DIR, brief, result, comparison, compareError: null, judgments, meta: null, timeline: TL, ...over });
const model = (r: RunReport, tl: Timeline | null, t: number) => {
  const i = replayAt(r, tl, t);
  return buildFlowModel(i.run, i.report, i.startedAt, i.live);
};

describe("replayAt", () => {
  it("before the first start: no panelists, no judgments, no comparison, the brief kept", () => {
    const i = replayAt(report(), TL, ms(-1));
    expect(i.run.panelists).toEqual([]);
    expect(i.report.judgments).toEqual([]);
    expect(i.report.comparison).toBeNull();
    expect(i.report.brief).toBe(brief);
    expect(model(report(), TL, ms(-1)).phase).toBe("running");
  });

  it("mid-run: running panelists with start times, and live reads and searches", () => {
    const i = replayAt(report(), TL, ms(7));
    expect(i.run.panelists.map((r) => [r.callId, r.persona, r.state, r.reask])).toEqual([
      ["s-p", "planner", "running", false],
      ["s-g", "guardian", "running", false],
    ]);
    expect(i.startedAt).toEqual({ "s-p": ms(0), "s-g": ms(1) });
    expect(i.live!.byPanelist.guardian!.counts).toEqual({ reads: 1, searches: 1 });
    expect(i.live!.files).toHaveLength(1);
    expect([...i.live!.files[0]!.readers].sort()).toEqual(["guardian", "planner"]);
    expect(i.live!.complete).toBe(true);
  });

  it("after a judgment: that panelist is done, its judgment shows, and the phase is collecting", () => {
    const i = replayAt(report(), TL, ms(21));
    expect(i.run.judgmentsSaved).toEqual(["planner"]);
    expect(i.report.judgments.map((j) => j.persona)).toEqual(["aska:planner"]);
    expect(i.run.panelists.find((r) => r.callId === "s-p")!.state).toBe("done");
    expect(model(report(), TL, ms(21)).phase).toBe("collecting");
  });

  it("across a re-ask: the failed first attempt and a running re-ask, which the model shows as running", () => {
    const i = replayAt(report(), TL, ms(35));
    expect(i.run.panelists.filter((r) => r.persona === "guardian").map((r) => [r.callId, r.state, r.reask, r.error])).toEqual([
      ["s-g", "failed", false, "failed"],
      ["s-g2", "running", true, null],
    ]);
    const g = model(report(), TL, ms(35)).panelists.find((p) => p.key === "guardian")!;
    expect([g.state, g.reask]).toEqual(["running", true]);
    expect(i.live!.byPanelist.guardian!.counts).toEqual({ reads: 0, searches: 0 });
  });

  it("at the outcome: the comparison and every judgment, and the outcome phase", () => {
    const i = replayAt(report(), TL, ms(60));
    expect(i.report.comparison).toBe(comparison);
    expect(i.report.judgments).toBe(judgments);
    const m = model(report(), TL, ms(60));
    expect(m.phase).toBe("outcome");
    expect(m.panelists.map((p) => p.key).sort()).toEqual(["accelerator", "guardian", "planner"]);
  });

  it("for a partial timeline, panelists that began before watching are already running at its start", () => {
    const partial: Timeline = { ...TL, complete: false, watchingSince: at(3) };
    const i = replayAt(report({ timeline: partial }), partial, runSpan(partial).start);
    expect(i.run.panelists.map((r) => r.state)).toEqual(["running", "running"]);
    expect(i.live!.complete).toBe(false);
    expect(i.live!.watchingSince).toBe(at(3));
  });

  it("gives each read a stable id, so the next tick's particles are only the new reads", () => {
    const a = model(report(), TL, ms(6));
    const b = model(report(), TL, ms(8));
    expect(particleReads(a, b)).toEqual([{ panelist: "guardian", ref: expect.stringMatching(/README\.md$/) }]);
  });

  it("without a timeline: the outcome only, with no panelist rows and no live activity", () => {
    const i = replayAt(report({ timeline: null }), null, 0);
    expect(i.run.panelists).toEqual([]);
    expect(i.live).toBeNull();
    expect(i.report.comparison).toBe(comparison);
    expect(model(report({ timeline: null }), null, 0).phase).toBe("outcome");
  });

  // Review Focus 3
  it("shows a panelist whose end was never recorded as done from the outcome on", () => {
    const noEnd: Timeline = { ...TL, events: TL.events.filter((e) => !(e.kind === "panelist-end" && e.callId === "s-p")) };
    expect(replayAt(report(), noEnd, ms(59)).run.panelists.find((r) => r.callId === "s-p")!.state).toBe("running");
    expect(replayAt(report(), noEnd, ms(60)).run.panelists.find((r) => r.callId === "s-p")!.state).toBe("done");
  });

  // Review Focus 4
  it("at the outcome, shows every judgment and its evidence even with no judgment events", () => {
    const noJudgments: Timeline = { ...TL, events: TL.events.filter((e) => e.kind !== "judgment") };
    const i = replayAt(report(), noJudgments, ms(60));
    expect(i.report.judgments).toBe(judgments);
    const m = model(report(), noJudgments, ms(60));
    const plain = model(report({ timeline: null }), null, 0);
    expect(m.evidence.items.map((e) => e.id)).toEqual(plain.evidence.items.map((e) => e.id));
    expect(m.evidence.items.length).toBeGreaterThan(0);
  });

  // Minor 1: a timeline with no outcome event (a failed compare) must still reach the end state.
  it("with no outcome event, at the run's end: unended panelists are done and every judgment shows", () => {
    const noOutcome: Timeline = { ...TL, events: TL.events.filter((e) => e.kind !== "outcome" && e.kind !== "judgment" && !(e.kind === "panelist-end" && e.callId === "s-p")) };
    const end = runSpan(noOutcome).end;
    const i = replayAt(report(), noOutcome, end);
    expect(i.run.panelists.find((r) => r.callId === "s-p")!.state).toBe("done");
    expect(i.report.judgments).toBe(judgments);
  });
});

describe("moments", () => {
  it("lists starts, first reads of each file, judgments, ends and the outcome, labelled", () => {
    expect(moments(TL).map((m) => m.label)).toEqual([
      "planner starts",
      "guardian starts",
      "planner reads 2026-03-02-tidepool-step4-offline-sync.md",
      "guardian reads README.md",
      "planner finishes",
      "planner's judgment lands",
      "guardian fails",
      "guardian starts",
      "guardian finishes",
      "guardian's judgment lands",
      "outcome",
    ]);
  });

  it("labels a canceled panelist and drops moments before a partial timeline's start", () => {
    const tl: Timeline = { ...TL, complete: false, watchingSince: at(3), events: [...TL.events.slice(0, 3), ev(9, "panelist-end", "planner", "s-p", { status: "canceled" })] };
    expect(moments(tl).map((m) => m.label)).toEqual(["planner reads 2026-03-02-tidepool-step4-offline-sync.md", "planner is canceled"]);
  });
});

describe("runSpan", () => {
  it("runs from the first event to the outcome", () => {
    expect(runSpan(TL)).toEqual({ start: ms(0), end: ms(60) });
  });
  it("starts at watchingSince for a partial timeline", () => {
    expect(runSpan({ ...TL, complete: false, watchingSince: at(3) }).start).toBe(ms(3));
  });
  it("starts at the first event when watchingSince predates it, even for a partial timeline", () => {
    expect(runSpan({ ...TL, complete: false, watchingSince: at(-10) }).start).toBe(ms(0));
  });
  it("ends at the last event without an outcome", () => {
    expect(runSpan({ ...TL, events: TL.events.filter((e) => e.kind !== "outcome") }).end).toBe(ms(41));
  });
});

describe("navigation, label and playback", () => {
  const marks = moments(TL);
  const span = runSpan(TL);

  it("steps to the next and previous moment, and stops at the ends", () => {
    expect(nextMoment(marks, ms(0))).toBe(ms(1));
    expect(prevMoment(marks, ms(1))).toBe(ms(0));
    expect(prevMoment(marks, ms(3))).toBe(ms(1));
    expect(nextMoment(marks, ms(60))).toBeNull();
    expect(prevMoment(marks, ms(0))).toBeNull();
  });

  it("labels the position with m:ss and the nearest moment at or before it", () => {
    expect(momentAt(marks, ms(7))?.label).toBe("planner reads 2026-03-02-tidepool-step4-offline-sync.md");
    expect(replayLabel(span, marks, ms(60))).toBe("1:00 · outcome");
    expect(replayLabel(span, marks, ms(5))).toBe("0:05 · planner reads 2026-03-02-tidepool-step4-offline-sync.md");
  });

  it("plays a long span in REPLAY_MS and a short one in real time, never past the end", () => {
    expect(stepPlayback(ms(0), 100, span)).toBe(ms(0) + 100 * ((60 * 1000) / REPLAY_MS));
    const short = { start: 0, end: 10_000 };
    expect(stepPlayback(0, 100, short)).toBe(100);
    expect(stepPlayback(9_950, 100, short)).toBe(10_000);
  });

  it("maps a scrubber position to a time and back", () => {
    expect(scrubTime(0, 200, span)).toBe(span.start);
    expect(scrubTime(100, 200, span)).toBe(ms(30));
    expect(scrubTime(-5, 200, span)).toBe(span.start);
    expect(scrubTime(250, 200, span)).toBe(span.end);
    expect(scrubTime(10, 0, span)).toBe(span.end);
    expect(scrubFraction(ms(30), span)).toBe(0.5);
    expect(scrubFraction(5, { start: 5, end: 5 })).toBe(1);
  });
});

describe("diffBase", () => {
  const row = (callId: string, persona: string): PanelistRow => ({ kind: "panelist", callId, state: "running", persona, reask: false, error: null });
  const run: LiveRun = { dir: DIR, panelists: [row("c1", "guardian")], reportCallId: null, judgmentsSaved: [] };
  const live = (readIds: string[], searches: number): LiveActivity => ({
    byPanelist: {
      guardian: {
        now: null,
        counts: { reads: readIds.length, searches },
        recent: readIds.map((id) => ({ callId: id, kind: "read" as const, target: `/r/${id}.ts`, ref: `${id}.ts`, at: 1 })),
        lastActiveAt: 1,
        readIds,
      },
    },
    files: [],
    complete: true,
    watchingSince: null,
  });
  const before = buildFlowModel(run, null, {}, live(["a"], 1));
  const after = buildFlowModel(run, null, {}, live(["a", "b"], 2));

  it("after a jump, diffs the model against itself, so no particle or flash fires", () => {
    expect(particleReads(diffBase(before, after, true), after)).toEqual([]);
    expect(searchFlashes(diffBase(before, after, true), after)).toEqual([]);
  });
  it("during playback, diffs against the previous model as live does", () => {
    expect(particleReads(diffBase(before, after, false), after)).toEqual([{ panelist: "guardian", ref: "b.ts" }]);
    expect(searchFlashes(diffBase(before, after, false), after)).toEqual(["guardian"]);
  });
});

describe("scrubYields", () => {
  it("keeps a horizontal or slightly diagonal drag on the scrubber", () => {
    expect(scrubYields({ x: 0, y: 0 }, { x: 40, y: 0 })).toBe(false);
    expect(scrubYields({ x: 0, y: 0 }, { x: -40, y: 25 })).toBe(false);
  });
  it("hands a mostly vertical swipe to the panel's ScrollView", () => {
    expect(scrubYields({ x: 0, y: 0 }, { x: 5, y: 30 })).toBe(true);
    expect(scrubYields({ x: 10, y: 50 }, { x: 0, y: 0 })).toBe(true);
  });
});
