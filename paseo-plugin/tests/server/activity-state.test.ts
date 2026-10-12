import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACTIVITY_CAP, IDLE_MS, PARENT_CAP, applyUpdate, dropParent, emptyState, evictIdle, snapshot } from "../../server/activity/state";

const fx = JSON.parse(readFileSync(join(__dirname, "../fixtures/activity/events.json"), "utf8")) as {
  parentAgentId: string;
  explore: unknown[];
  guardian: unknown[];
};
const P = fx.parentAgentId;
const GUARDIAN = "toolu_01Jue2EXmGFLXvtfC4mQTijf";
const T = Date.parse("2026-10-10T20:00:00.000Z");

const up = () => {
  const s = emptyState("e1");
  s.up = true;
  s.startedAt = "2026-10-10T00:00:00.000Z";
  return s;
};
const tl = (parent: string, sub: string, seq: number, item: unknown, timestamp = "2026-10-10T19:00:00.000Z") => ({
  type: "agent.provider_subagents.update",
  payload: { kind: "timeline", parentAgentId: parent, subagentId: sub, provider: "claude", item, timestamp, seq, epoch: "x" },
});
const read = (callId: string, filePath: string, status = "completed") => ({ type: "tool_call", callId, name: "Read", status, error: null, detail: { type: "read", filePath } });

describe("applyUpdate on recorded streams", () => {
  it("merges start and completion events into one entry per call, and maps kinds", () => {
    const s = up();
    for (const m of fx.explore) applyUpdate(s, m, T);
    const snap = snapshot(s, P);
    expect(snap.subagents).toHaveLength(1);
    const sub = snap.subagents[0]!;
    expect(sub.status).toBe("completed");
    const reads = sub.activity.filter((a) => a.kind === "read").map((a) => a.target);
    expect(reads).toEqual(["/home/u/project/aska-paseo/server/runs/archive.ts", "/home/u/project/aska-paseo/server/runs/store.ts"]);
    expect(new Set(sub.activity.map((a) => a.callId)).size).toBe(sub.activity.length);
    expect(sub.activity.filter((a) => a.kind === "other").length).toBe(3);
  });

  it("keeps the guardian's reads and searches, with search targets from detail.query", () => {
    const s = up();
    for (const m of fx.guardian) applyUpdate(s, m, T);
    const sub = snapshot(s, P).subagents.find((x) => x.id === GUARDIAN)!;
    expect(sub.description).toBe("panelist aska:guardian");
    expect(sub.activity.filter((a) => a.kind === "read")).toHaveLength(14);
    const searches = sub.activity.filter((a) => a.kind === "search");
    expect(searches).toHaveLength(3);
    expect(searches.every((a) => typeof a.target === "string" && a.target.length > 0)).toBe(true);
  });
});

describe("applyUpdate edge cases", () => {
  it("creates a running sub-agent when a timeline event arrives before its upsert", () => {
    const s = up();
    expect(applyUpdate(s, tl("p1", "s1", 1, read("c1", "/r/a.ts")), T)).toBe("applied");
    const sub = snapshot(s, "p1").subagents[0]!;
    expect(sub).toMatchObject({ id: "s1", status: "running", createdAt: "2026-10-10T19:00:00.000Z" });
    expect(sub.activity).toEqual([{ seq: 1, callId: "c1", kind: "read", target: "/r/a.ts", at: "2026-10-10T19:00:00.000Z" }]);
  });

  it("ignores other message types and skips malformed payloads", () => {
    const s = up();
    expect(applyUpdate(s, { type: "agent_update", payload: {} }, T)).toBe("ignored");
    expect(applyUpdate(s, { type: "agent.provider_subagents.update", payload: { kind: "timeline" } }, T)).toBe("skipped");
    expect(applyUpdate(s, "nonsense", T)).toBe("ignored");
    expect(s.skipped).toBe(1);
  });

  it("adds no entry for messages but keeps the parent fresh", () => {
    const s = up();
    applyUpdate(s, tl("p1", "s1", 1, { type: "assistant_message", text: "…" }), T);
    expect(snapshot(s, "p1").subagents[0]!.activity).toEqual([]);
  });

  it("removes a sub-agent on a remove event", () => {
    const s = up();
    applyUpdate(s, tl("p1", "s1", 1, read("c1", "/r/a.ts")), T);
    applyUpdate(s, { type: "agent.provider_subagents.update", payload: { kind: "remove", parentAgentId: "p1", subagentId: "s1" } }, T);
    expect(snapshot(s, "p1").subagents).toEqual([]);
  });
});

describe("caps and eviction", () => {
  it(`keeps the newest ${ACTIVITY_CAP} entries per sub-agent`, () => {
    const s = up();
    for (let i = 0; i < ACTIVITY_CAP + 5; i++) applyUpdate(s, tl("p1", "s1", i, read(`c${i}`, `/r/${i}.ts`)), T);
    const a = snapshot(s, "p1").subagents[0]!.activity;
    expect(a).toHaveLength(ACTIVITY_CAP);
    expect(a[0]!.callId).toBe("c5");
  });

  it(`evicts the least recently updated parent beyond ${PARENT_CAP}`, () => {
    const s = up();
    for (let i = 0; i <= PARENT_CAP; i++) applyUpdate(s, tl(`p${i}`, "s", 1, read("c", "/r/a.ts")), T + i);
    expect(s.parents.size).toBe(PARENT_CAP);
    expect(snapshot(s, "p0").subagents).toEqual([]);
    expect(snapshot(s, `p${PARENT_CAP}`).subagents).toHaveLength(1);
  });

  it("drops idle parents and archived parents", () => {
    const s = up();
    applyUpdate(s, tl("old", "s", 1, read("c", "/r/a.ts")), T);
    applyUpdate(s, tl("new", "s", 1, read("c", "/r/a.ts")), T + IDLE_MS);
    evictIdle(s, T + IDLE_MS + 1);
    expect([...s.parents.keys()]).toEqual(["new"]);
    dropParent(s, "new");
    expect(s.parents.size).toBe(0);
  });
});

describe("snapshot", () => {
  it("returns the epoch, an increasing cursor, and only what changed after `since`", () => {
    const s = up();
    applyUpdate(s, tl("p1", "s1", 1, read("c1", "/r/a.ts")), T);
    const first = snapshot(s, "p1");
    expect(first.epoch).toBe("e1");
    applyUpdate(s, tl("p1", "s1", 2, read("c2", "/r/b.ts")), T);
    applyUpdate(s, tl("p1", "s2", 1, read("c3", "/r/c.ts")), T);
    const next = snapshot(s, "p1", first.cursor);
    expect(next.cursor).toBeGreaterThan(first.cursor);
    expect(next.subagents.map((x) => [x.id, x.activity.map((a) => a.callId)])).toEqual([
      ["s1", ["c2"]],
      ["s2", ["c3"]],
    ]);
    expect(snapshot(s, "p1", next.cursor).subagents).toEqual([]);
  });

  it("reports complete only when up and watching since before every sub-agent started", () => {
    const s = up();
    applyUpdate(s, tl("p1", "s1", 1, read("c1", "/r/a.ts"), "2026-10-10T19:00:00.000Z"), T);
    expect(snapshot(s, "p1").complete).toBe(true);
    s.startedAt = "2026-10-10T19:30:00.000Z";
    expect(snapshot(s, "p1").complete).toBe(false);
    s.startedAt = "2026-10-10T00:00:00.000Z";
    s.up = false;
    expect(snapshot(s, "p1").complete).toBe(false);
  });

  it("returns an empty, incomplete result for an unknown agent", () => {
    expect(snapshot(up(), "nobody")).toMatchObject({ epoch: "e1", subagents: [], complete: false });
  });
});

describe("endedAt", () => {
  const upsert = (status: string, updatedAt?: string) => ({
    type: "agent.provider_subagents.update",
    payload: {
      kind: "upsert",
      subagent: { id: "s1", parentAgentId: "p1", description: "panelist aska:guardian", status, createdAt: "2026-10-10T19:00:00.000Z", ...(updatedAt ? { updatedAt } : {}) },
    },
  });

  it("is null while running, then set once from the first terminal upsert's updatedAt", () => {
    const s = up();
    applyUpdate(s, upsert("running", "2026-10-10T19:00:00.000Z"), T);
    expect(snapshot(s, "p1").subagents[0]!.endedAt).toBeNull();
    applyUpdate(s, upsert("completed", "2026-10-10T19:05:00.000Z"), T);
    applyUpdate(s, upsert("completed", "2026-10-10T19:09:00.000Z"), T);
    expect(snapshot(s, "p1").subagents[0]!.endedAt).toBe("2026-10-10T19:05:00.000Z");
  });

  it("falls back to the arrival time when the upsert has no updatedAt", () => {
    const s = up();
    applyUpdate(s, upsert("failed"), T);
    expect(snapshot(s, "p1").subagents[0]!.endedAt).toBe(new Date(T).toISOString());
  });

  it("records the recorded guardian's completion time", () => {
    const s = up();
    for (const m of fx.guardian) applyUpdate(s, m, T);
    expect(snapshot(s, P).subagents.find((x) => x.id === GUARDIAN)!.endedAt).toBe("2026-10-10T15:43:46.581Z");
  });
});
