import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { archiveFolder, createAutoImport, importTmp, type ArchiveDeps } from "../../server/runs/archive";
import { createRunHandlers } from "../../server/runs/handlers";
import type { RunPaths } from "../../server/runs/paths";
import { RunStore } from "../../server/runs/store";
import type { WorkspaceLookup } from "../../server/cwd";

const FIXTURES = join(__dirname, "../fixtures/runs");
const comparison = (run: string) => JSON.parse(readFileSync(join(FIXTURES, run, "comparison.json"), "utf8"));
const paseo: WorkspaceLookup = { workspaces: { ref: () => ({ refresh: async () => null }) } };
const ctx = { paseo };
const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

function setup(compareImpl?: ArchiveDeps["compare"]) {
  const base = mkdtempSync(join(tmpdir(), "aska-editor-rpc-"));
  roots.push(base);
  const paths: RunPaths = { tmpRoot: join(base, "tmp"), askaRunsRoot: join(base, "aska"), storeRoot: join(base, "store") };
  mkdirSync(paths.tmpRoot, { recursive: true });
  const calls: { file: string; cwd: string | null }[] = [];
  const logged: string[] = [];
  const archive: ArchiveDeps = {
    store: new RunStore(paths.storeRoot),
    compare: compareImpl ?? (async (file, cwd) => (calls.push({ file, cwd }), comparison("plan-trio"))),
    now: () => new Date("2026-10-09T20:00:00.000Z"),
    log: (m) => logged.push(m),
  };
  let autoImportCalls = 0;
  const baseAutoImport = createAutoImport(() => importTmp(paths, archive));
  const autoImport: typeof baseAutoImport = (opts) => {
    autoImportCalls++;
    return baseAutoImport(opts);
  };
  const h = createRunHandlers({ paths, archive, autoImport, workspaceDir: async (id) => (id === "w1" ? "/repo" : null) });
  const run = (name: string, fixture = "plan-trio") => {
    const dir = join(paths.tmpRoot, name);
    cpSync(join(FIXTURES, fixture), dir, { recursive: true });
    return dir;
  };
  return { paths, archive, h, calls, run, logged, autoImportCalls: () => autoImportCalls };
}

describe("run.report", () => {
  it("serves a live run with a fresh comparison computed in the workspace", async () => {
    const { h, run, calls } = setup();
    const dir = run("aska-panel-Ab12Cd");
    const r = await h.report({ workspaceId: "w1", dir }, ctx);
    expect(r).toMatchObject({ source: "live", dir, meta: null });
    expect(r.comparison?.panel).toBe("aska:plan");
    expect(r.result?.panelists).toHaveLength(3);
    expect(r.judgments.map((j) => j.persona)).toEqual(["aska:planner", "aska:guardian", "aska:accelerator"]);
    expect(r.brief).toContain("**Question:**");
    expect(calls).toEqual([{ file: join(dir, "panel-result.json"), cwd: "/repo" }]);
  });

  it("before a result exists, returns the brief and the judgment files", async () => {
    const { h, run } = setup();
    const dir = run("aska-panel-Ab12Cd");
    rmSync(join(dir, "panel-result.json"));
    const r = await h.report({ dir }, ctx);
    expect(r.result).toBeNull();
    expect(r.comparison).toBeNull();
    expect(r.judgments.map((j) => j.persona).sort()).toEqual(["aska:accelerator", "aska:guardian", "aska:planner"]);
  });

  it("logs a broken judgment file once, with its path and the parse error but no content, and skips it", async () => {
    const { h, run, logged } = setup();
    const dir = run("aska-panel-Ab12Cd");
    rmSync(join(dir, "panel-result.json"));
    const broken = join(dir, "judgments", "zz-broken.json");
    writeFileSync(broken, '{"persona": "SECRET-CONTENT", ');
    const r = await h.report({ dir }, ctx);
    await h.report({ dir }, ctx);
    expect(r.judgments.map((j) => j.persona).sort()).toEqual(["aska:accelerator", "aska:guardian", "aska:planner"]);
    expect(logged).toEqual([`aska-editor: ${broken} is malformed: SyntaxError`]);
  });

  it("serves the archive by id, and when the temp folder is gone", async () => {
    const { h, run, archive } = setup();
    const dir = run("aska-panel-Ab12Cd");
    const out = await archiveFolder({ dir, realDir: dir, source: "paseo", agentId: "a1", workspaceId: "w1", projectPath: "/repo", reportCallId: "r1" }, archive);
    expect((await h.report({ id: out!.id }, ctx)).source).toBe("archive");
    rmSync(dir, { recursive: true });
    const r = await h.report({ dir }, ctx);
    expect(r).toMatchObject({ source: "archive", dir });
    expect(r.comparison?.panel).toBe("aska:plan");
    expect(r.meta?.id).toBe(out!.id);
  });

  it("refuses paths outside the allow-list and explains a vanished, unarchived run", async () => {
    const { h, paths } = setup();
    await expect(h.report({ dir: "/etc/passwd" }, ctx)).rejects.toThrow(/Not a panel run folder/);
    await expect(h.report({ dir: join(paths.tmpRoot, "aska-panel-Ab12Cd", "..", "..") }, ctx)).rejects.toThrow(/Not a panel run folder/);
    await expect(h.report({ dir: join(paths.tmpRoot, "aska-panel-Gone00") }, ctx)).rejects.toThrow(/gone and it was never archived/);
    await expect(h.report({ id: "20261009T201512Z-Nope00" }, ctx)).rejects.toThrow(/No archived run/);
  });

  it("sets compareError and leaves comparison null when compare output breaks the contract and nothing is archived", async () => {
    const { h, run } = setup(async () => ({ nope: true }));
    const r = await h.report({ dir: run("aska-panel-Ab12Cd") }, ctx);
    expect(r.comparison).toBeNull();
    expect(r.result).not.toBeNull();
    expect(r.compareError).toMatch(/^Unexpected error: aska's compare output/);
  });

  it("falls back to the frozen comparison when compare fails but an archive entry has one", async () => {
    const { h, run, archive } = setup();
    const dir = run("aska-panel-Ab12Cd");
    await archiveFolder({ dir, realDir: dir, source: "paseo", agentId: "a1", workspaceId: "w1", projectPath: "/repo", reportCallId: "r1" }, archive);
    archive.compare = async () => {
      throw new Error("aska unreachable");
    };
    const r = await h.report({ dir, workspaceId: "w1" }, ctx);
    expect(r.comparison?.panel).toBe("aska:plan");
    expect(r.compareError).toMatch(/aska unreachable/);
  });

  it("never follows a symlink on the live path", async () => {
    const { h, run, paths } = setup();
    const dir = run("aska-panel-Ab12Cd");
    const secret = join(paths.tmpRoot, "..", "secret.txt");
    writeFileSync(secret, "TOP SECRET");
    for (const f of ["brief.md", "comparison.json"]) {
      rmSync(join(dir, f), { force: true });
      symlinkSync(secret, join(dir, f));
    }
    const r = await h.report({ dir }, ctx);
    expect(r.brief).toBeNull();
    expect(JSON.stringify(r)).not.toContain("TOP SECRET");
  });

  it("treats a symlinked panel-result.json as absent and skips symlinked judgments", async () => {
    const { h, run, paths, calls } = setup();
    const dir = run("aska-panel-Ab12Cd");
    const elsewhere = join(paths.tmpRoot, "..", "elsewhere.json");
    cpSync(join(dir, "panel-result.json"), elsewhere);
    rmSync(join(dir, "panel-result.json"));
    symlinkSync(elsewhere, join(dir, "panel-result.json"));
    const judgments = join(dir, "judgments");
    const planted = join(paths.tmpRoot, "..", "planted.json");
    writeFileSync(planted, JSON.stringify({ persona: "planted" }));
    symlinkSync(planted, join(judgments, "zz-planted.json"));
    const r = await h.report({ dir }, ctx);
    expect(r.result).toBeNull();
    expect(calls).toHaveLength(0);
    expect(r.judgments.map((j) => j.persona)).not.toContain("planted");
    expect(r.judgments.length).toBeGreaterThan(0);
  });

  it("logs a malformed panel-result.json with its path and the parse error, and treats it as missing", async () => {
    const { h, run, logged } = setup();
    const dir = run("aska-panel-Ab12Cd");
    writeFileSync(join(dir, "panel-result.json"), JSON.stringify({ panel: 42 }));
    const r = await h.report({ dir }, ctx);
    expect(r.result).toBeNull();
    expect(logged.some((l) => l.startsWith("aska-editor: ") && l.includes(join(dir, "panel-result.json")) && l.includes("malformed"))).toBe(true);
  });

  it("logs each malformed file once however often the panel polls its report", async () => {
    const { h, run, logged } = setup();
    const dir = run("aska-panel-Ab12Cd");
    writeFileSync(join(dir, "panel-result.json"), JSON.stringify({ panel: 42 }));
    await h.report({ dir }, ctx);
    await h.report({ dir }, ctx);
    expect(logged.filter((l) => l.includes("malformed"))).toHaveLength(1);
  });

  it("logs a file again when it breaks again after being fixed", async () => {
    const { h, run, logged } = setup();
    const dir = run("aska-panel-Ab12Cd");
    const file = join(dir, "panel-result.json");
    const good = readFileSync(file, "utf8");
    writeFileSync(file, JSON.stringify({ panel: 42 }));
    await h.report({ dir }, ctx);
    writeFileSync(file, good);
    await h.report({ dir }, ctx);
    writeFileSync(file, JSON.stringify({ panel: 42 }));
    await h.report({ dir }, ctx);
    expect(logged.filter((l) => l.includes("malformed"))).toHaveLength(2);
  });

  it("never puts a malformed file's content into the log", async () => {
    const { h, run, logged } = setup();
    const dir = run("aska-panel-Ab12Cd");
    writeFileSync(join(dir, "panel-result.json"), '{"token": sk-secret-leak}');
    await h.report({ dir }, ctx);
    expect(logged.some((l) => l.includes("malformed"))).toBe(true);
    expect(logged.some((l) => l.includes("sk-secret-leak"))).toBe(false);
  });

  it("logs a malformed frozen comparison.json but doesn't log an absent one", async () => {
    const { h, run, archive, logged } = setup();
    const dir = run("aska-panel-Ab12Cd");
    const out = await archiveFolder({ dir, realDir: dir, source: "paseo", agentId: "a1", workspaceId: null, projectPath: null, reportCallId: "r1" }, archive);
    writeFileSync(join(archive.store.entryDir(out!.id), "comparison.json"), "{ not json");
    const r = await h.report({ id: out!.id }, ctx);
    expect(r.comparison).toBeNull();
    expect(logged.filter((l) => l.includes("comparison.json") && l.includes("malformed"))).toHaveLength(1);
    rmSync(join(archive.store.entryDir(out!.id), "comparison.json"));
    logged.length = 0;
    await h.report({ id: out!.id }, ctx);
    expect(logged.filter((l) => l.includes("malformed"))).toEqual([]);
  });
});

describe("run.status, runs.list, runs.delete, runs.importTmp", () => {
  it("reports the archived id and latest report call for a folder", async () => {
    const { h, run, archive } = setup();
    const dir = run("aska-panel-Ab12Cd");
    expect(await h.status({ dir })).toEqual({ archivedId: null, reportCallId: null });
    const out = await archiveFolder({ dir, realDir: dir, source: "paseo", agentId: "a1", workspaceId: "w1", projectPath: "/repo", reportCallId: "r7" }, archive);
    expect(await h.status({ dir })).toEqual({ archivedId: out!.id, reportCallId: "r7" });
    await expect(h.status({ dir: "/etc" })).rejects.toThrow(/Not a panel run folder/);
  });

  it("lists all runs, or a workspace's runs by id or directory, and deletes", async () => {
    const { h, run, archive } = setup();
    const a = run("aska-panel-Aaaaaa");
    const b = run("aska-panel-Bbbbbb");
    const c = run("aska-panel-Cccccc");
    await archiveFolder({ dir: a, realDir: a, source: "paseo", agentId: "x", workspaceId: "w1", projectPath: "/elsewhere", reportCallId: "r" }, archive);
    await archiveFolder({ dir: b, realDir: b, source: "paseo", agentId: "x", workspaceId: "w2", projectPath: "/repo", reportCallId: "r" }, archive);
    await archiveFolder({ dir: c, realDir: c, source: "import", agentId: null, workspaceId: null, projectPath: null, reportCallId: null }, archive);
    expect((await h.list({}, ctx)).runs).toHaveLength(3);
    expect((await h.list({ workspaceId: "w1" }, ctx)).runs.map((m) => m.tmpDir).sort()).toEqual([a, b].sort());
    const id = (await h.list({}, ctx)).runs[0]!.id;
    expect(await h.remove({ id })).toEqual({ deleted: true });
    expect((await h.list({}, ctx)).runs).toHaveLength(2);
  });

  it("imports temp runs", async () => {
    const { h, run } = setup();
    run("aska-panel-Ab12Cd");
    expect(await h.importTmp()).toEqual({ imported: 1, skipped: 0, alreadyArchived: 0 });
  });

  it("runs.list triggers autoImport before listing", async () => {
    const { h, autoImportCalls } = setup();
    await h.list({}, ctx);
    expect(autoImportCalls()).toBe(1);
    await h.list({}, ctx);
    expect(autoImportCalls()).toBe(2);
  });

  it("still lists when autoImport rejects, after logging it", async () => {
    const { paths, archive, run, logged } = setup();
    const dir = run("aska-panel-Ab12Cd");
    await archiveFolder({ dir, realDir: dir, source: "paseo", agentId: "a1", workspaceId: "w1", projectPath: "/repo", reportCallId: "r1" }, archive);
    const h2 = createRunHandlers({
      paths,
      archive,
      autoImport: async () => {
        throw new Error("aska-editor-test: autoImport boom");
      },
      workspaceDir: async () => null,
    });
    const result = await h2.list({}, ctx);
    expect(result.runs).toHaveLength(1);
    expect(logged.some((l) => l.includes("auto-import before runs.list failed") && l.includes("aska-editor-test: autoImport boom"))).toBe(true);
  });
});

describe("run.report timeline", () => {
  const activity = { complete: true, watchingSince: "2026-10-09T18:00:00.000Z", events: [{ at: "2026-10-09T19:00:00.000Z", kind: "panelist-start" as const, panelist: "guardian", callId: "s-g" }] };
  const archived = async (s: ReturnType<typeof setup>) => {
    const dir = s.run("aska-panel-Ab12Cd");
    const out = await archiveFolder({ dir, realDir: dir, source: "paseo", agentId: "a1", workspaceId: null, projectPath: null, reportCallId: "r1", activity }, s.archive);
    return { dir, id: out!.id, file: join(s.archive.store.entryDir(out!.id), "timeline.json") };
  };

  it("serves an archived run's timeline, and null for a live run", async () => {
    const s = setup();
    const { dir, id } = await archived(s);
    const r = await s.h.report({ id }, ctx);
    expect(r.timeline?.events.map((e) => e.kind)).toEqual(expect.arrayContaining(["panelist-start", "judgment", "outcome"]));
    expect((await s.h.report({ dir }, ctx)).timeline).toBeNull();
  });

  it("is null without logging when timeline.json is missing or a symlink", async () => {
    const s = setup();
    const { id, file } = await archived(s);
    rmSync(file);
    expect((await s.h.report({ id }, ctx)).timeline).toBeNull();
    symlinkSync("/etc/hostname", file);
    expect((await s.h.report({ id }, ctx)).timeline).toBeNull();
    expect(s.logged.filter((m) => m.includes("timeline.json"))).toEqual([]);
  });

  it("is null and logged, without the file's content, when timeline.json is malformed", async () => {
    const s = setup();
    const { id, file } = await archived(s);
    writeFileSync(file, JSON.stringify({ schemaVersion: 1, secret: "TOP SECRET" }));
    expect((await s.h.report({ id }, ctx)).timeline).toBeNull();
    const line = s.logged.find((m) => m.includes("timeline.json is malformed"));
    expect(line).toBeDefined();
    expect(line).not.toContain("TOP SECRET");
  });
});
