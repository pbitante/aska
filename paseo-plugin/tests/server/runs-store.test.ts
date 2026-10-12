import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { chmod, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultRunPaths, lexicalRunDir, realRunDir, type RunPaths } from "../../server/runs/paths";
import { RunStore } from "../../server/runs/store";
import type { RunMeta } from "../../shared/runs";

const roots: string[] = [];
function sandbox(): RunPaths & { base: string } {
  const base = mkdtempSync(join(tmpdir(), "aska-editor-runs-"));
  roots.push(base);
  const paths = { base, tmpRoot: join(base, "tmp"), askaRunsRoot: join(base, "home/.claude/aska/runs"), storeRoot: join(base, "store") };
  for (const d of [paths.tmpRoot, paths.askaRunsRoot, paths.storeRoot]) mkdirSync(d, { recursive: true });
  return paths;
}
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

const meta = (id: string, over: Partial<RunMeta> = {}): RunMeta => ({
  schemaVersion: 1, id, source: "paseo", tmpDir: null, agentId: null, workspaceId: null, projectPath: null,
  question: "q", panel: null, panelists: [], startedAt: "2026-10-09T10:00:00.000Z", comparedAt: null,
  archivedAt: "2026-10-09T10:00:00.000Z", digest: "0000000000000000", reportCallId: null, skipped: [], ...over,
});
function writeEntry(store: RunStore, m: RunMeta) {
  mkdirSync(store.entryDir(m.id), { recursive: true });
  writeFileSync(join(store.entryDir(m.id), "meta.json"), JSON.stringify(m));
}

describe("defaultRunPaths", () => {
  it("uses XDG_DATA_HOME when set", () => {
    expect(defaultRunPaths({ XDG_DATA_HOME: "/data" }, "/home/u", "/tmp")).toEqual({
      tmpRoot: "/tmp", askaRunsRoot: "/home/u/.claude/aska/runs", storeRoot: "/data/aska-editor/runs",
    });
    expect(defaultRunPaths({}, "/home/u", "/tmp").storeRoot).toBe("/home/u/.local/share/aska-editor/runs");
  });
});

describe("lexicalRunDir", () => {
  const p = { tmpRoot: "/tmp", askaRunsRoot: "/home/u/.claude/aska/runs", storeRoot: "/s" };
  it("accepts run folders directly under the temp dir or aska's store", () => {
    expect(lexicalRunDir("/tmp/aska-panel-Ab12Cd", p)).toBe("/tmp/aska-panel-Ab12Cd");
    expect(lexicalRunDir("/tmp/aska-panel-Ab12Cd/", p)).toBe("/tmp/aska-panel-Ab12Cd");
    expect(lexicalRunDir("/home/u/.claude/aska/runs/20261009T201512Z-Ab12Cd", p)).toBe("/home/u/.claude/aska/runs/20261009T201512Z-Ab12Cd");
  });
  it("refuses everything else", () => {
    for (const bad of ["/tmp/aska-panel-Ab12Cd/../../etc", "/etc/aska-panel-Ab12Cd", "/tmp/x/aska-panel-Ab12Cd", "/tmp/other", "aska-panel-Ab12Cd", "/home/u/.claude/aska/runs/aska-panel-Ab12Cd"]) {
      expect(lexicalRunDir(bad, p), bad).toBeNull();
    }
  });
});

describe("realRunDir", () => {
  it("accepts a real folder and refuses a symlink that escapes", async () => {
    const p = sandbox();
    mkdirSync(join(p.tmpRoot, "aska-panel-Ab12Cd"));
    mkdirSync(join(p.base, "secret"));
    symlinkSync(join(p.base, "secret"), join(p.tmpRoot, "aska-panel-Zz99Yy"));
    expect(await realRunDir(join(p.tmpRoot, "aska-panel-Ab12Cd"), p)).toMatch(/aska-panel-Ab12Cd$/);
    expect(await realRunDir(join(p.tmpRoot, "aska-panel-Zz99Yy"), p)).toBeNull();
    expect(await realRunDir(join(p.tmpRoot, "aska-panel-Gone00"), p)).toBeNull();
  });

  it("refuses a folder owned by a different uid, when a uid is given", async () => {
    const p = sandbox();
    const dir = join(p.tmpRoot, "aska-panel-Ab12Cd");
    mkdirSync(dir);
    const realUid = (await stat(dir)).uid;
    expect(await realRunDir(dir, p, realUid)).toMatch(/aska-panel-Ab12Cd$/);
    expect(await realRunDir(dir, p, realUid + 1)).toBeNull();
    expect(await realRunDir(dir, p, undefined)).toMatch(/aska-panel-Ab12Cd$/);
  });
});

describe("RunStore", () => {
  it("lists valid entries newest first and skips broken ones", async () => {
    const p = sandbox();
    const store = new RunStore(p.storeRoot);
    writeEntry(store, meta("20261009T100000Z-Aaaaaa", { startedAt: "2026-10-09T10:00:00.000Z" }));
    writeEntry(store, meta("20261009T120000Z-Bbbbbb", { startedAt: "2026-10-09T12:00:00.000Z" }));
    mkdirSync(join(p.storeRoot, "20261009T130000Z-Cccccc"));
    writeFileSync(join(p.storeRoot, "20261009T130000Z-Cccccc", "meta.json"), "{ broken");
    mkdirSync(join(p.storeRoot, "not-an-id"));
    expect((await store.list()).map((m) => m.id)).toEqual(["20261009T120000Z-Bbbbbb", "20261009T100000Z-Aaaaaa"]);
  });

  it("finds by temp folder, gets by id, and deletes", async () => {
    const p = sandbox();
    const store = new RunStore(p.storeRoot);
    writeEntry(store, meta("20261009T100000Z-Ab12Cd", { tmpDir: "/tmp/aska-panel-Ab12Cd" }));
    expect((await store.findByTmpDir("/tmp/aska-panel-Ab12Cd"))?.meta.id).toBe("20261009T100000Z-Ab12Cd");
    expect(await store.findByTmpDir("/tmp/aska-panel-Zz99Yy")).toBeNull();
    expect(await store.get("../escape")).toBeNull();
    expect(await store.delete("20261009T100000Z-Ab12Cd")).toBe(true);
    expect(await store.delete("20261009T100000Z-Ab12Cd")).toBe(false);
    expect(await store.list()).toEqual([]);
  });

  it("refuses to build a path from a bad id", () => {
    expect(() => new RunStore("/s").entryDir("../x")).toThrow(/bad run id/);
  });

  it("answers findByTmpDir from an index built once, and keeps it current on remember and delete", async () => {
    const p = sandbox();
    const store = new RunStore(p.storeRoot);
    writeEntry(store, meta("20261009T100000Z-Ab12Cd", { tmpDir: "/tmp/aska-panel-Ab12Cd" }));
    writeEntry(store, meta("20261009T110000Z-Ef34Gh", { tmpDir: "/tmp/aska-panel-Ef34Gh" }));
    const list = vi.spyOn(store, "list");
    expect((await store.findByTmpDir("/tmp/aska-panel-Ab12Cd"))?.meta.id).toBe("20261009T100000Z-Ab12Cd");
    expect((await store.findByTmpDir("/tmp/aska-panel-Ef34Gh"))?.meta.id).toBe("20261009T110000Z-Ef34Gh");
    expect(await store.findByTmpDir("/tmp/aska-panel-Zz99Yy")).toBeNull();
    expect(list).toHaveBeenCalledTimes(1);

    const added = meta("20261009T120000Z-Ij56Kl", { tmpDir: "/tmp/aska-panel-Ij56Kl" });
    writeEntry(store, added);
    store.remember(added);
    expect((await store.findByTmpDir("/tmp/aska-panel-Ij56Kl"))?.meta.id).toBe(added.id);

    expect(await store.delete("20261009T100000Z-Ab12Cd")).toBe(true);
    expect(await store.findByTmpDir("/tmp/aska-panel-Ab12Cd")).toBeNull();
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("drops an index row whose entry vanished or now belongs to another folder", async () => {
    const p = sandbox();
    const store = new RunStore(p.storeRoot);
    const m = meta("20261009T100000Z-Ab12Cd", { tmpDir: "/tmp/aska-panel-Ab12Cd" });
    writeEntry(store, m);
    expect(await store.findByTmpDir("/tmp/aska-panel-Ab12Cd")).not.toBeNull();
    writeEntry(store, { ...m, tmpDir: "/tmp/aska-panel-Other1" });
    expect(await store.findByTmpDir("/tmp/aska-panel-Ab12Cd")).toBeNull();
    rmSync(store.entryDir(m.id), { recursive: true });
    expect(await store.findByTmpDir("/tmp/aska-panel-Other1")).toBeNull();
  });

  it("sweeps stale partials and orphaned olds on list, and leaves fresh ones", async () => {
    const p = sandbox();
    const store = new RunStore(p.storeRoot);
    writeEntry(store, meta("20261009T100000Z-Ab12Cd"));
    const stale = join(p.storeRoot, "20261009T100000Z-Ab12Cd.partial-aaaaaaaaaaaa");
    const fresh = join(p.storeRoot, "20261009T110000Z-Ef34Gh.partial-bbbbbbbbbbbb");
    const orphanedOld = join(p.storeRoot, "20261009T100000Z-Ab12Cd.old-cccccccccccc");
    for (const d of [stale, fresh, orphanedOld]) mkdirSync(d);
    const eleven = (Date.now() - 11 * 60 * 1000) / 1000;
    utimesSync(stale, eleven, eleven);
    await store.list();
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
    expect(existsSync(orphanedOld)).toBe(false);
  });

  it("tightens a pre-existing group/other-readable store root to owner-only on list", async () => {
    const p = sandbox();
    await chmod(p.storeRoot, 0o755);
    expect(((await stat(p.storeRoot)).mode & 0o777).toString(8)).toBe("755");
    const store = new RunStore(p.storeRoot);
    await store.list();
    expect(((await stat(p.storeRoot)).mode & 0o777).toString(8)).toBe("700");
  });

  it("keeps the newest entry on a duplicate tmpDir when indexing by tmpDir", async () => {
    const p = sandbox();
    const store = new RunStore(p.storeRoot);
    writeEntry(store, meta("20261009T100000Z-Aaaaaa", { tmpDir: "/tmp/aska-panel-Dup000", startedAt: "2026-10-09T10:00:00.000Z" }));
    writeEntry(store, meta("20261009T120000Z-Bbbbbb", { tmpDir: "/tmp/aska-panel-Dup000", startedAt: "2026-10-09T12:00:00.000Z" }));
    expect((await store.findByTmpDir("/tmp/aska-panel-Dup000"))?.meta.id).toBe("20261009T120000Z-Bbbbbb");
  });

  it("recovers an entry from its single .old sibling, and refuses when that is ambiguous", async () => {
    const p = sandbox();
    const store = new RunStore(p.storeRoot);
    const m = meta("20261009T100000Z-Ab12Cd", { tmpDir: "/tmp/aska-panel-Ab12Cd" });
    writeEntry(store, m);
    expect(await store.findByTmpDir("/tmp/aska-panel-Ab12Cd")).not.toBeNull();
    renameSync(store.entryDir(m.id), `${store.entryDir(m.id)}.old-aaaaaaaaaaaa`);
    expect(await store.recover(m.id)).toBe(true);
    expect((await store.findByTmpDir("/tmp/aska-panel-Ab12Cd"))?.meta.id).toBe(m.id);
    expect(readdirSync(p.storeRoot)).toEqual([m.id]);
    expect(await store.recover(m.id)).toBe(false); // the entry exists

    renameSync(store.entryDir(m.id), `${store.entryDir(m.id)}.old-aaaaaaaaaaaa`);
    mkdirSync(`${store.entryDir(m.id)}.old-bbbbbbbbbbbb`);
    expect(await store.recover(m.id)).toBe(false);
    expect(existsSync(store.entryDir(m.id))).toBe(false);
  });

  it("restores a lone <id>.old-* via sweep even with no source folder to recompute its id from, modelling a real crash", async () => {
    const p = sandbox();
    const store = new RunStore(p.storeRoot);
    const m = meta("20261009T100000Z-Ab12Cd", { tmpDir: "/tmp/aska-panel-Ab12Cd" });
    writeEntry(store, m);
    // A daemon that died between the two renames and whose source folder is now gone: nothing
    // but this .old-* names the run any more.
    renameSync(store.entryDir(m.id), `${store.entryDir(m.id)}.old-aaaaaaaaaaaa`);

    // A fresh store models a restart: sweep must recover it without any in-memory state.
    const fresh = new RunStore(store.root);
    expect((await fresh.list()).map((r) => r.id)).toEqual([m.id]);
    expect(readdirSync(p.storeRoot)).toEqual([m.id]);
  });

  it("leaves an id's lone .old-* alone while it is marked mid-swap, then recovers it once unmarked", async () => {
    const p = sandbox();
    const store = new RunStore(p.storeRoot);
    const m = meta("20261009T100000Z-Ab12Cd", { tmpDir: "/tmp/aska-panel-Ab12Cd" });
    writeEntry(store, m);
    renameSync(store.entryDir(m.id), `${store.entryDir(m.id)}.old-aaaaaaaaaaaa`);

    store.beginSwap(m.id);
    await store.sweep();
    expect(existsSync(store.entryDir(m.id))).toBe(false);
    expect(existsSync(`${store.entryDir(m.id)}.old-aaaaaaaaaaaa`)).toBe(true);

    store.endSwap(m.id);
    await store.sweep();
    expect(existsSync(store.entryDir(m.id))).toBe(true);
    expect(readdirSync(p.storeRoot)).toEqual([m.id]);
  });
});

describe("RunStore unreadable and newer entries", () => {
  it("logs a present but unreadable meta.json once, and stays quiet about a missing one", async () => {
    const p = sandbox();
    const logs: string[] = [];
    const store = new RunStore(p.storeRoot, (m) => logs.push(m));
    const id = "20261009T100000Z-Bad000";
    mkdirSync(store.entryDir(id), { recursive: true });
    expect(await store.get(id)).toBeNull();
    expect(await store.entryState(id)).toBe("broken");
    writeFileSync(join(store.entryDir(id), "meta.json"), "{ not json");
    expect(await store.get(id)).toBeNull();
    expect(await store.get(id)).toBeNull();
    expect(logs).toEqual([`aska-editor: ${join(store.entryDir(id), "meta.json")} is unreadable: SyntaxError`]);
    expect(await store.get("20261009T100000Z-None00")).toBeNull();
    expect(await store.entryState("20261009T100000Z-None00")).toBe("missing");
  });

  it("leaves an entry written by a newer version alone, and says so", async () => {
    const p = sandbox();
    const logs: string[] = [];
    const store = new RunStore(p.storeRoot, (m) => logs.push(m));
    const id = "20261009T100000Z-New000";
    writeEntry(store, { ...meta(id), schemaVersion: 2 as never });
    expect(await store.get(id)).toBeNull();
    expect(await store.entryState(id)).toBe("newer");
    expect(logs).toEqual([`aska-editor: ${id} was archived by a newer aska-editor; left alone`]);
    expect(await store.list()).toEqual([]);
  });

  it("moves an unreadable entry aside instead of deleting it", async () => {
    const p = sandbox();
    const store = new RunStore(p.storeRoot);
    const id = "20261009T100000Z-Bad000";
    mkdirSync(store.entryDir(id), { recursive: true });
    writeFileSync(join(store.entryDir(id), "timeline.json"), "{}");
    const kept = await store.quarantine(id);
    expect(existsSync(store.entryDir(id))).toBe(false);
    expect(existsSync(join(kept, "timeline.json"))).toBe(true);
    await store.sweep();
    expect(existsSync(kept)).toBe(true);
  });
});

describe("RunStore deletions", () => {
  it("remembers a deleted run's folder and content, across restarts", async () => {
    const p = sandbox();
    const store = new RunStore(p.storeRoot);
    const id = "20261009T100000Z-Del000";
    writeEntry(store, meta(id, { tmpDir: "/tmp/aska-panel-Del000", digest: "d1" }));
    expect(await store.delete(id)).toBe(true);
    expect(await store.isDeleted("/tmp/aska-panel-Del000", "d1")).toBe(true);
    expect(await store.isDeleted("/tmp/aska-panel-Del000", "d2")).toBe(false);
    expect(await store.isDeleted("/tmp/aska-panel-Other0", "d1")).toBe(false);
    const again = new RunStore(p.storeRoot);
    expect(await again.isDeleted("/tmp/aska-panel-Del000", "d1")).toBe(true);
    expect((await stat(join(p.storeRoot, "deleted.json"))).mode & 0o777).toBe(0o600);
  });
});
