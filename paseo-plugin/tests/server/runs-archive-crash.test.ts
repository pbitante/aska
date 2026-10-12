import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArchiveActivity } from "../../server/runs/timeline";

// Fails the rename whose destination is `crash.at`, once: the step between moving the old entry
// aside and moving the new copy in.
const crash = vi.hoisted(() => ({ at: null as string | null }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    rename: async (from: string, to: string) => {
      if (to === crash.at) {
        crash.at = null;
        throw new Error("simulated crash");
      }
      return actual.rename(from, to);
    },
  };
});

const { archiveFolder } = await import("../../server/runs/archive");
const { RunStore } = await import("../../server/runs/store");

const FIXTURES = join(__dirname, "../fixtures/runs");
const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

describe("archiveFolder after a crash between its two renames", () => {
  it("puts the previous entry straight back when the second rename fails in-process, then refreshes it on the next archive", async () => {
    const base = mkdtempSync(join(tmpdir(), "aska-editor-crash-"));
    roots.push(base);
    const store = new RunStore(join(base, "store"));
    const deps = {
      store,
      compare: async () => JSON.parse(readFileSync(join(FIXTURES, "plan-trio/comparison.json"), "utf8")),
      now: () => new Date(),
      log: () => {},
    };
    const dir = join(base, "tmp", "aska-panel-Ab12Cd");
    mkdirSync(join(base, "tmp"));
    cpSync(join(FIXTURES, "plan-trio"), dir, { recursive: true });
    const source = (reportCallId: string) => ({ dir, realDir: dir, source: "paseo" as const, agentId: "a1", workspaceId: null, projectPath: null, reportCallId });

    const first = await archiveFolder(source("r1"), deps);
    const final = store.entryDir(first!.id);
    crash.at = final;
    await expect(archiveFolder(source("r2"), deps)).rejects.toThrow("simulated crash");
    // The catch sees its own failure and puts the previous entry straight back: no .old left
    // and nothing missing from the list, because the process never actually died.
    expect(existsSync(final)).toBe(true);
    expect(readdirSync(store.root).filter((n) => n.includes(".old-"))).toHaveLength(0);
    expect((await store.findByTmpDir(dir))?.meta.reportCallId).toBe("r1");

    // Model a restart for the recovery archive: a fresh RunStore has no in-memory index yet.
    const fresh = new RunStore(store.root);
    const again = await archiveFolder(source("r2"), { ...deps, store: fresh });
    expect(again).toEqual({ id: first!.id, changed: true });
    expect(readdirSync(store.root)).toEqual([first!.id]);
    expect((await store.findByTmpDir(dir))?.meta.reportCallId).toBe("r2");
  });

  it("an entry left only as <id>.old-* by a process that died mid-swap comes back with its timeline.json", async () => {
    const base = mkdtempSync(join(tmpdir(), "aska-editor-crash-"));
    roots.push(base);
    const store = new RunStore(join(base, "store"));
    const deps = {
      store,
      compare: async () => JSON.parse(readFileSync(join(FIXTURES, "plan-trio/comparison.json"), "utf8")),
      now: () => new Date(),
      log: () => {},
    };
    const dir = join(base, "tmp", "aska-panel-Ab12Cd");
    mkdirSync(join(base, "tmp"));
    cpSync(join(FIXTURES, "plan-trio"), dir, { recursive: true });
    const activity: ArchiveActivity = { complete: true, watchingSince: null, events: [{ at: "2026-10-09T19:00:00.000Z", kind: "panelist-start", panelist: "guardian", callId: "s-g" }] };
    const first = await archiveFolder({ dir, realDir: dir, source: "paseo", agentId: "a1", workspaceId: null, projectPath: null, reportCallId: "r1", activity }, deps);
    const final = store.entryDir(first!.id);
    renameSync(final, `${final}.old-0123456789ab`); // the first rename of the next archive, then death
    const fresh = new RunStore(store.root);
    expect((await fresh.list()).map((m) => m.id)).toEqual([first!.id]);
    expect(existsSync(join(final, "timeline.json"))).toBe(true);
    expect(statSync(join(final, "timeline.json")).mode & 0o777).toBe(0o600);
    expect((await fresh.get(first!.id))!.meta.timelineDigest).not.toBeNull();
  });
});
