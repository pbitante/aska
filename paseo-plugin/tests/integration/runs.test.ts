import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { callAska } from "../../server/aska";
import { chooseCwd, type WorkspaceLookup } from "../../server/cwd";
import { nodeRunner } from "../../server/runner";
import { archiveFolder, type ArchiveDeps } from "../../server/runs/archive";
import { createRunHandlers } from "../../server/runs/handlers";
import type { RunPaths } from "../../server/runs/paths";
import { RunStore } from "../../server/runs/store";
import { status } from "./aska-cli";

if (!status.ok) console.warn(`Skipping the panel-runs integration test: ${status.reason}.`);

const base = mkdtempSync(join(tmpdir(), "aska-editor-runs-it-"));
afterAll(() => rmSync(base, { recursive: true, force: true }));
const paths: RunPaths = { tmpRoot: join(base, "tmp"), askaRunsRoot: join(base, "aska"), storeRoot: join(base, "store") };
mkdirSync(paths.tmpRoot, { recursive: true });
const dir = join(paths.tmpRoot, "aska-panel-It0001");
cpSync(join(__dirname, "../fixtures/runs/plan-trio"), dir, { recursive: true });

const archive: ArchiveDeps = {
  store: new RunStore(paths.storeRoot),
  compare: async (resultFile, cwd) => {
    const where = cwd ?? (await chooseCwd(undefined, { tmpDir: tmpdir(), ensureDir: async (p) => void (await mkdir(p, { recursive: true })), workspaceDirectory: async () => null }));
    return callAska({ runner: nodeRunner, tmpDir: tmpdir() }, { cliPath: status.cliPath!, cwd: where, args: ["compare", "--file", resultFile, "--json"] });
  },
  now: () => new Date(),
  log: (m) => console.error(m),
};
const handlers = createRunHandlers({ paths, archive, autoImport: async () => ({ imported: 0, skipped: 0, alreadyArchived: 0 }), workspaceDir: async () => null });
const paseo: WorkspaceLookup = { workspaces: { ref: () => ({ refresh: async () => null }) } };
const ctx = { paseo };

describe.skipIf(!status.ok)(`panel runs against the real aska CLI (${status.ok ? `aska ${status.version}` : `skipped: ${status.reason}`})`, () => {
  it("compares a live run folder", async () => {
    const r = await handlers.report({ dir }, ctx);
    expect(r.source).toBe("live");
    expect(r.comparison?.panel).toBe("aska:plan");
    expect(r.comparison?.verdicts.map((v) => v.persona)).toEqual(["aska:planner", "aska:guardian", "aska:accelerator"]);
    expect(r.comparison?.followUps.length).toBeGreaterThan(0);
  });

  it("archives it with a frozen comparison and serves it after the folder is gone", async () => {
    const out = await archiveFolder({ dir, realDir: dir, source: "paseo", agentId: "it", workspaceId: null, projectPath: null, reportCallId: "c1" }, archive);
    expect(out?.changed).toBe(true);
    expect(existsSync(join(archive.store.entryDir(out!.id), "comparison.json"))).toBe(true);
    rmSync(dir, { recursive: true });
    const r = await handlers.report({ dir }, ctx);
    expect(r).toMatchObject({ source: "archive" });
    expect(r.comparison?.panel).toBe("aska:plan");
    expect((await handlers.status({ dir })).reportCallId).toBe("c1");
  });
});
