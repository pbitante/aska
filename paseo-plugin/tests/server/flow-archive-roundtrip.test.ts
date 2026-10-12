import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildFlowModel } from "../../client/logic/flow/model";
import { replayAt, runSpan } from "../../client/logic/flow/replay";
import type { WorkspaceLookup } from "../../server/cwd";
import { archiveFromTimeline, type ArchiveDeps } from "../../server/runs/archive";
import { createRunHandlers } from "../../server/runs/handlers";
import type { RunPaths } from "../../server/runs/paths";
import { RunStore } from "../../server/runs/store";
import type { RunActivity } from "../../shared/activity";

const FIXTURES = join(__dirname, "../fixtures/runs");
const paseo: WorkspaceLookup = { workspaces: { ref: () => ({ refresh: async () => null }) } };
const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

describe("archive → run.report → replay", () => {
  it("archives a run with collector activity, serves its timeline, and replays it to the outcome", async () => {
    const base = mkdtempSync(join(tmpdir(), "aska-editor-roundtrip-"));
    roots.push(base);
    const paths: RunPaths = { tmpRoot: join(base, "tmp"), askaRunsRoot: join(base, "aska"), storeRoot: join(base, "store") };
    mkdirSync(paths.tmpRoot, { recursive: true });
    const archive: ArchiveDeps = {
      store: new RunStore(paths.storeRoot),
      compare: async () => JSON.parse(readFileSync(join(FIXTURES, "plan-trio/comparison.json"), "utf8")),
      now: () => new Date("2026-10-09T20:00:00.000Z"),
      log: () => {},
    };
    const h = createRunHandlers({ paths, archive, autoImport: async () => ({ imported: 0, skipped: 0, alreadyArchived: 0 }), workspaceDir: async () => null });
    const dir = join(paths.tmpRoot, "aska-panel-Ab12Cd");
    cpSync(join(FIXTURES, "plan-trio"), dir, { recursive: true });
    for (const name of ["planner", "guardian", "accelerator"]) {
      const when = new Date("2026-10-09T19:06:00.000Z");
      utimesSync(join(dir, "judgments", `${name}.json`), when, when);
    }
    const activity: RunActivity = {
      epoch: "e",
      cursor: 1,
      complete: true,
      watchingSince: "2026-10-09T18:00:00.000Z",
      subagents: [
        {
          id: "s-g",
          status: "completed",
          description: "panelist aska:guardian",
          createdAt: "2026-10-09T19:00:00.000Z",
          endedAt: "2026-10-09T19:05:00.000Z",
          activity: [{ seq: 1, callId: "t1", kind: "read", target: "/home/u/project/tidepool/README.md", at: "2026-10-09T19:01:00.000Z" }],
        },
      ],
    };
    const items = [
      { type: "tool_call", callId: "s-g", name: "Agent", status: "completed", error: null, detail: { type: "sub_agent", subAgentType: "aska:panelist", description: "panelist aska:guardian" } },
      { type: "tool_call", callId: "r1", name: "Bash", status: "completed", error: null, detail: { type: "shell", command: `node /p/persona.mjs compare --file ${dir}/panel-result.json --json`, output: "{}" } },
    ];
    const [out] = await archiveFromTimeline({ agent: { id: "a1", workspaceId: null, cwd: "/repo" }, timeline: items }, { ...archive, paths, activityOf: () => activity });

    const report = await h.report({ id: out!.id }, { paseo });
    expect(report.timeline).not.toBeNull();
    const span = runSpan(report.timeline!);
    const end = replayAt(report, report.timeline, span.end);
    expect(buildFlowModel(end.run, end.report, end.startedAt, end.live).phase).toBe("outcome");
    const mid = replayAt(report, report.timeline, Date.parse("2026-10-09T19:02:00.000Z"));
    const m = buildFlowModel(mid.run, mid.report, mid.startedAt, mid.live);
    expect(m.phase).toBe("running");
    expect(m.panelists.find((p) => p.key === "guardian")?.live?.counts.reads).toBe(1);
  });
});
