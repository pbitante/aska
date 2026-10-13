import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { archiveFolder, archiveFromTimeline, type ArchiveDeps } from "../../server/runs/archive";
import type { RunPaths } from "../../server/runs/paths";
import { RunStore } from "../../server/runs/store";
import type { RunActivity } from "../../shared/activity";
import { timelineSchema, type Timeline } from "../../shared/runs";

const FIXTURES = join(__dirname, "../fixtures/runs");
const BASE = Date.parse("2026-10-09T19:00:00.000Z");
const at = (s: number) => new Date(BASE + s * 1000).toISOString();
const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

function setup() {
  const base = mkdtempSync(join(tmpdir(), "aska-editor-timeline-"));
  roots.push(base);
  const paths: RunPaths = { tmpRoot: join(base, "tmp"), askaRunsRoot: join(base, "aska"), storeRoot: join(base, "store") };
  mkdirSync(paths.tmpRoot, { recursive: true });
  const clock = { now: BASE + 3600 * 1000 };
  const deps: ArchiveDeps = {
    store: new RunStore(paths.storeRoot),
    compare: async () => JSON.parse(readFileSync(join(FIXTURES, "plan-trio/comparison.json"), "utf8")),
    now: () => new Date(clock.now),
    log: () => {},
  };
  const dir = join(paths.tmpRoot, "aska-panel-Ab12Cd");
  cpSync(join(FIXTURES, "plan-trio"), dir, { recursive: true });
  const landed = (name: string, s: number) => utimesSync(join(dir, "judgments", `${name}.json`), new Date(BASE + s * 1000), new Date(BASE + s * 1000));
  landed("planner", 21);
  landed("guardian", -100);
  landed("accelerator", 50);
  const timelineOf = (id: string): Timeline | null => {
    const file = join(deps.store.entryDir(id), "timeline.json");
    return existsSync(file) ? timelineSchema.parse(JSON.parse(readFileSync(file, "utf8"))) : null;
  };
  return { paths, deps, clock, dir, timelineOf };
}

const panelist = (callId: string, persona: string) => ({
  type: "tool_call", callId, name: "Agent", status: "completed", error: null,
  detail: { type: "sub_agent", subAgentType: "aska:panelist", description: `panelist ${persona}` },
});
const compare = (callId: string, dir: string) => ({
  type: "tool_call", callId, name: "Bash", status: "completed", error: null,
  detail: { type: "shell", command: `node /p/persona.mjs compare --file ${dir}/panel-result.json --json`, output: "{}" },
});
const PANELISTS = [panelist("s-p", "aska:planner"), panelist("s-g", "aska:guardian"), panelist("s-a", "aska:accelerator")];
const turn = (dir: string, items: unknown[], reportCallId = "r1") => ({ agent: { id: "a1", workspaceId: null, cwd: "/repo" }, timeline: [...items, compare(reportCallId, dir)] });
const read = (seq: number, s: number, target: string) => ({ seq, callId: `t${seq}`, kind: "read" as const, target, at: at(s) });
const sub = (id: string, start: number, end: number | null, activity: ReturnType<typeof read>[] = []): RunActivity["subagents"][number] => ({
  id,
  status: end === null ? "running" : "completed",
  description: null,
  createdAt: at(start),
  endedAt: end === null ? null : at(end),
  activity,
});
const collector = (subagents: RunActivity["subagents"]): RunActivity => ({ epoch: "e", cursor: 1, complete: true, watchingSince: at(-60), subagents });
const TWO = () => collector([sub("s-p", 0, 20, [read(1, 5, "/repo/a.ts")]), sub("s-g", 1, 30, [read(2, 6, "/repo/b.ts")])]);

describe("timeline.json", () => {
  it("is written (0600) from the collector, the source judgment files' times and the outcome", async () => {
    const { deps, paths, dir, timelineOf } = setup();
    const [out] = await archiveFromTimeline(turn(dir, PANELISTS), { ...deps, paths, activityOf: () => TWO() });
    expect(statSync(join(deps.store.entryDir(out!.id), "timeline.json")).mode & 0o777).toBe(0o600);
    const t = timelineOf(out!.id)!;
    expect(t).toMatchObject({ schemaVersion: 1, complete: true, watchingSince: at(-60) });
    expect(t.events.map((e) => [e.at, e.kind, e.panelist, e.callId])).toEqual([
      [at(0), "panelist-start", "planner", "s-p"],
      [at(1), "panelist-start", "guardian", "s-g"],
      [at(1), "judgment", "guardian", null], // its file's mtime (-100 s) clamps to the start
      [at(5), "read", "planner", "s-p"],
      [at(6), "read", "guardian", "s-g"],
      [at(20), "panelist-end", "planner", "s-p"],
      [at(21), "judgment", "planner", null],
      [at(30), "panelist-end", "guardian", "s-g"],
      [at(50), "judgment", "accelerator", null],
      [at(3600), "outcome", null, null],
    ]);
    expect(t.events.find((e) => e.kind === "read")?.target).toBe("/repo/a.ts");
    expect((await deps.store.get(out!.id))!.meta.timelineDigest).toMatch(/^[0-9a-f]{16}$/);
  });

  it("keys a judgment file saved under its canonical name by the short name", async () => {
    const { deps, paths, dir, timelineOf } = setup();
    renameSync(join(dir, "judgments", "planner.json"), join(dir, "judgments", "aska:planner.json"));
    const [out] = await archiveFromTimeline(turn(dir, PANELISTS), { ...deps, paths, activityOf: () => TWO() });
    const judged = timelineOf(out!.id)!.events.filter((e) => e.kind === "judgment").map((e) => e.panelist);
    expect(judged).toContain("planner");
    expect(judged).not.toContain("aska:planner");
  });

  it("is not written when no sub-agent matches a panelist, or without a collector", async () => {
    const { deps, paths, dir, timelineOf } = setup();
    const [out] = await archiveFromTimeline(turn(dir, PANELISTS), { ...deps, paths, activityOf: () => collector([sub("someone-else", 0, 1)]) });
    expect(timelineOf(out!.id)).toBeNull();
    expect((await deps.store.get(out!.id))!.meta.timelineDigest).toBeNull();
    const [again] = await archiveFromTimeline(turn(dir, PANELISTS, "r2"), { ...deps, paths });
    expect(timelineOf(again!.id)).toBeNull();
  });

  it("re-archives an unchanged folder when its activity grew, and skips it when it didn't", async () => {
    const { deps, paths, dir, timelineOf } = setup();
    let current = collector([sub("s-p", 0, 20, [read(1, 5, "/repo/a.ts")])]);
    const d = { ...deps, paths, activityOf: () => current };
    const [first] = await archiveFromTimeline(turn(dir, PANELISTS), d);
    expect(first!.changed).toBe(true);
    expect(await archiveFromTimeline(turn(dir, PANELISTS), d)).toEqual([{ id: first!.id, changed: false }]);
    current = collector([sub("s-p", 0, 20, [read(1, 5, "/repo/a.ts"), read(3, 7, "/repo/c.ts")])]);
    expect(await archiveFromTimeline(turn(dir, PANELISTS), d)).toEqual([{ id: first!.id, changed: true }]);
    expect(timelineOf(first!.id)!.events.filter((e) => e.kind === "read").map((e) => e.target)).toEqual(["/repo/a.ts", "/repo/c.ts"]);
  });

  it("carries the timeline forward, with a moved outcome, when a re-archive has no activity", async () => {
    const { deps, paths, dir, clock, timelineOf } = setup();
    const [first] = await archiveFromTimeline(turn(dir, PANELISTS), { ...deps, paths, activityOf: () => TWO() });
    const before = timelineOf(first!.id)!;
    const forgotten = { ...deps, paths, activityOf: () => collector([]) };
    // Nothing changed and the collector has forgotten the run: still a skip, not a rewrite.
    expect(await archiveFromTimeline(turn(dir, PANELISTS), forgotten)).toEqual([{ id: first!.id, changed: false }]);
    clock.now += 60 * 1000;
    expect(await archiveFromTimeline(turn(dir, PANELISTS, "r2"), forgotten)).toEqual([{ id: first!.id, changed: true }]);
    const after = timelineOf(first!.id)!;
    expect(statSync(join(deps.store.entryDir(first!.id), "timeline.json")).mode & 0o777).toBe(0o600);
    expect(after.events.filter((e) => e.kind !== "outcome")).toEqual(before.events.filter((e) => e.kind !== "outcome"));
    expect(after.events.filter((e) => e.kind === "outcome").map((e) => e.at)).toEqual([at(3660)]);
  });

  it("keeps earlier attempts when a re-run is archived from a later turn that shows only the re-run panelist", async () => {
    const { deps, paths, dir, timelineOf } = setup();
    await archiveFromTimeline(turn(dir, PANELISTS), { ...deps, paths, activityOf: () => TWO() });
    const [out] = await archiveFromTimeline(turn(dir, [panelist("s-g2", "aska:guardian [re-ask]")], "r2"), {
      ...deps,
      paths,
      activityOf: () => collector([sub("s-g2", 40, 55, [read(4, 45, "/repo/d.ts")])]),
    });
    const starts = timelineOf(out!.id)!.events.filter((e) => e.kind === "panelist-start").map((e) => [e.panelist, e.callId]);
    expect(starts).toEqual([
      ["planner", "s-p"],
      ["guardian", "s-g"],
      ["guardian", "s-g2"],
    ]);
  });

  it("keeps earlier attempts inside the replay window after a simulated reconnect mid-run", async () => {
    const { deps, paths, dir, timelineOf } = setup();
    const [first] = await archiveFromTimeline(turn(dir, PANELISTS), { ...deps, paths, activityOf: () => TWO() });
    const before = timelineOf(first!.id)!;
    expect(before).toMatchObject({ complete: true, watchingSince: at(-60) });
    // The collector reconnects: it keeps s-g's state (so its createdAt still predates the new
    // watchingSince) but reports complete: false and a watchingSince well after R's own events.
    const reconnected: RunActivity = { ...collector([sub("s-g", 1, 30, [read(2, 6, "/repo/b.ts"), read(3, 25, "/repo/e.ts")])]), complete: false, watchingSince: at(50) };
    const [out] = await archiveFromTimeline(turn(dir, PANELISTS, "r2"), { ...deps, paths, activityOf: () => reconnected });
    expect(out!.changed).toBe(true);
    const after = timelineOf(first!.id)!;
    expect(after).toMatchObject({ complete: true, watchingSince: at(-60) });
    expect(after.events.some((e) => e.callId === "s-p" && e.kind === "panelist-start")).toBe(true);
  });

  it("never copies a timeline.json from the run folder", async () => {
    const { deps, dir, timelineOf } = setup();
    writeFileSync(join(dir, "timeline.json"), JSON.stringify({ schemaVersion: 1, complete: true, watchingSince: null, events: [{ at: at(0), kind: "outcome", panelist: null, callId: null }] }));
    const out = await archiveFolder({ dir, realDir: dir, source: "import", agentId: null, workspaceId: null, projectPath: null, reportCallId: null, activity: null }, deps);
    expect(timelineOf(out!.id)).toBeNull();
  });
});
