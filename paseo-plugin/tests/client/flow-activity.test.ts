import { describe, expect, it } from "vitest";
import { caption, liveActivity, liveEvidence, mergeActivity, THINKING_MS, type PanelistLive } from "../../client/logic/flow/activity";
import type { RunActivity } from "../../shared/activity";
import type { LiveRun, PanelistRow } from "../../shared/recognize";

const DIR = "/tmp/aska-panel-OZIwJw";
const BRIEF = "**Question:** q\n\n**Materials** (repository root: /repo)\n- /repo/a.ts\n";
const row = (callId: string, persona: string, state: PanelistRow["state"] = "running", reask = false): PanelistRow => ({ kind: "panelist", callId, state, persona, reask, error: null });
const run = (panelists: PanelistRow[]): LiveRun => ({ dir: DIR, panelists, reportCallId: null, judgmentsSaved: [] });
const at = (s: number) => new Date(Date.parse("2026-10-10T19:00:00.000Z") + s * 1000).toISOString();
let seq = 0;
const e = (kind: "read" | "search" | "other", target: string | null, s: number, callId = `c${++seq}`) => ({ seq: seq, callId, kind, target, at: at(s) });
const act = (subagents: RunActivity["subagents"], over: Partial<RunActivity> = {}): RunActivity => ({ epoch: "e", cursor: 10, complete: true, watchingSince: at(-60), subagents, ...over });
const sub = (id: string, activity: RunActivity["subagents"][number]["activity"], status: RunActivity["subagents"][number]["status"] = "running") => ({ id, status, description: null, createdAt: at(0), activity });

describe("liveActivity", () => {
  it("returns null without activity", () => {
    expect(liveActivity(run([row("s1", "aska:guardian")]), null, BRIEF)).toBeNull();
  });

  it("joins sub-agents to panelists by call id and counts reads and searches", () => {
    const a = act([sub("s1", [e("read", "/repo/a.ts", 1), e("search", "rename", 2), e("other", null, 3)])]);
    const live = liveActivity(run([row("s1", "aska:guardian"), row("s2", "aska:tester")]), a, BRIEF)!;
    const g = live.byPanelist.guardian!;
    expect(g.counts).toEqual({ reads: 1, searches: 1 });
    expect(g.now).toMatchObject({ kind: "search", target: "rename" });
    expect(g.lastActiveAt).toBe(Date.parse(at(3)));
    expect(g.recent.map((x) => x.kind)).toEqual(["read", "search", "other"]);
    expect(live.byPanelist.tester).toBeUndefined();
    expect(live.complete).toBe(true);
  });

  it("normalises paths against the brief root, merges readers, and excludes run-folder files from the ring", () => {
    const a = act([
      sub("s1", [e("read", "/repo/server/x.ts", 1), e("read", `${DIR}/brief.md`, 2)]),
      sub("s2", [e("read", "/repo/server/x.ts", 5), e("read", "/repo/y.ts", 6)]),
    ]);
    const live = liveActivity(run([row("s1", "aska:guardian"), row("s2", "aska:tester")]), a, BRIEF)!;
    expect(live.files.map((f) => [f.path, f.readers, f.reads])).toEqual([
      ["server/x.ts", ["guardian", "tester"], 2],
      ["y.ts", ["tester"], 1],
    ]);
    expect(live.byPanelist.guardian!.counts.reads).toBe(2);
    expect(live.byPanelist.guardian!.readIds).toHaveLength(2);
  });

  it("uses only the latest attempt of a re-asked panelist", () => {
    const a = act([sub("s1", [e("read", "/repo/old.ts", 1)], "failed"), sub("s9", [e("read", "/repo/new.ts", 9)])]);
    const live = liveActivity(run([row("s1", "aska:guardian", "failed"), row("s9", "aska:guardian", "running", true)]), a, BRIEF)!;
    expect(live.files.map((f) => f.path)).toEqual(["new.ts"]);
    expect(live.byPanelist.guardian!.counts.reads).toBe(1);
  });
});

describe("liveEvidence", () => {
  it("ranks by distinct readers then recency, keeps every file, and lists each panelist's files", () => {
    const files = Array.from({ length: 10 }, (_, i) => ({ path: `f${i}.ts`, readers: i === 3 ? ["a", "b"] : ["a"], reads: 1, lastAt: i }));
    const ev = liveEvidence(files);
    expect(ev.items).toHaveLength(10);
    expect(ev.items[0]!.id).toBe("f3.ts");
    expect(ev.items[1]!.id).toBe("f9.ts");
    expect("more" in ev).toBe(false);
    expect(ev.byPanelist.b).toEqual(["f3.ts"]);
    expect(ev.items[0]).toMatchObject({ label: "f3.ts", citedBy: ["a", "b"], count: 1 });
  });
});

// Review Focus 5: two files that share a basename.
describe("liveEvidence with shared basenames", () => {
  it("keeps both files as separate items with the same label", () => {
    const ev = liveEvidence([
      { path: "src/a/index.ts", readers: ["a"], reads: 1, lastAt: 2 },
      { path: "src/b/index.ts", readers: ["a"], reads: 1, lastAt: 1 },
    ]);
    expect(ev.items.map((i) => [i.id, i.label])).toEqual([
      ["src/a/index.ts", "index.ts"],
      ["src/b/index.ts", "index.ts"],
    ]);
    expect(ev.byPanelist.a).toEqual(["src/a/index.ts", "src/b/index.ts"]);
  });
});

describe("caption", () => {
  const live = (now: PanelistLive["now"], lastActiveAt: number | null, counts = { reads: 0, searches: 0 }): PanelistLive => ({ now, counts, recent: [], lastActiveAt, readIds: [] });
  const T = 1_000_000;
  it("describes the latest read or search while running", () => {
    expect(caption(live({ callId: "c", kind: "read", target: "/repo/server/archive.ts", ref: "server/archive.ts", at: T }, T), true, T + 1000)).toBe("reading archive.ts");
    expect(caption(live({ callId: "c", kind: "search", target: "rename", ref: null, at: T }, T), true, T)).toBe("searching 'rename'");
  });
  it("truncates long search patterns", () => {
    expect(caption(live({ callId: "c", kind: "search", target: "force|confirm|Alert|expectHash|conflict", ref: null, at: T }, T), true, T)).toBe("searching 'force|confirm|Alert|expe…'");
  });
  it(`says thinking when running with no activity, or none for ${THINKING_MS} ms`, () => {
    expect(caption(null, true, T)).toBe("thinking");
    expect(caption(live({ callId: "c", kind: "read", target: "/a.ts", ref: "a.ts", at: T }, T), true, T + THINKING_MS + 1)).toBe("thinking");
  });
  it("summarises counts once done, pluralised, omitting zeros", () => {
    expect(caption(live(null, T, { reads: 17, searches: 3 }), false, T)).toBe("17 reads · 3 searches");
    expect(caption(live(null, T, { reads: 1, searches: 0 }), false, T)).toBe("1 read");
    expect(caption(live(null, T, { reads: 0, searches: 1 }), false, T)).toBe("1 search");
    expect(caption(live(null, null), false, T)).toBeNull();
    expect(caption(null, false, T)).toBeNull();
  });
});

describe("mergeActivity", () => {
  it("replaces on a full fetch and merges a partial one by sub-agent and call id", () => {
    const first = act([sub("s1", [e("read", "/a.ts", 1, "c1")])]);
    expect(mergeActivity(null, first, false)).toBe(first);
    const next = act([sub("s1", [e("read", "/b.ts", 2, "c2")], "completed"), sub("s2", [e("search", "x", 3, "c3")])], { cursor: 20, complete: false });
    const m = mergeActivity(first, next, true);
    expect(m.cursor).toBe(20);
    expect(m.complete).toBe(false);
    expect(m.subagents.map((s) => [s.id, s.status, s.activity.map((x) => x.callId)])).toEqual([
      ["s1", "completed", ["c1", "c2"]],
      ["s2", "running", ["c3"]],
    ]);
  });
  it("replaces an entry with the same call id instead of duplicating it", () => {
    const first = act([sub("s1", [e("read", null, 1, "c1")])]);
    const next = act([sub("s1", [e("read", "/a.ts", 1, "c1")])]);
    expect(mergeActivity(first, next, true).subagents[0]!.activity).toEqual([expect.objectContaining({ callId: "c1", target: "/a.ts" })]);
  });
  it("discards the previous state when the epoch changes", () => {
    const first = act([sub("s1", [e("read", "/a.ts", 1, "c1")])]);
    const next = act([], { epoch: "other" });
    expect(mergeActivity(first, next, true)).toBe(next);
  });
});
