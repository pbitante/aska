import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { archiveFolder, archiveFromTimeline, importTmp, MAX_FILE_BYTES, type ArchiveDeps } from "../../server/runs/archive";
import type { RunPaths } from "../../server/runs/paths";
import { RunStore } from "../../server/runs/store";
import { RUN_ID } from "../../shared/runs";

const FIXTURES = join(__dirname, "../fixtures/runs");
const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

function setup(compareImpl?: ArchiveDeps["compare"]) {
  const base = mkdtempSync(join(tmpdir(), "aska-editor-archive-"));
  roots.push(base);
  const paths: RunPaths = { tmpRoot: join(base, "tmp"), askaRunsRoot: join(base, "aska"), storeRoot: join(base, "store") };
  for (const d of [paths.tmpRoot, paths.askaRunsRoot]) mkdirSync(d, { recursive: true });
  const logged: string[] = [];
  const compared: { file: string; cwd: string | null }[] = [];
  let clock = Date.parse("2026-10-09T20:00:00.000Z");
  const deps: ArchiveDeps = {
    store: new RunStore(paths.storeRoot),
    compare:
      compareImpl ??
      (async (file, cwd) => {
        compared.push({ file, cwd });
        return JSON.parse(readFileSync(join(FIXTURES, "plan-trio/comparison.json"), "utf8"));
      }),
    now: () => new Date((clock += 1000)),
    log: (m) => logged.push(m),
  };
  const run = (name: string, fixture = "plan-trio") => {
    const dir = join(paths.tmpRoot, name);
    cpSync(join(FIXTURES, fixture), dir, { recursive: true });
    return dir;
  };
  const source = (dir: string, over = {}) => ({ dir, realDir: dir, source: "paseo" as const, agentId: "a1", workspaceId: "w1", projectPath: "/repo", reportCallId: "r1", ...over });
  return { paths, deps, logged, compared, run, source };
}

describe("archiveFolder", () => {
  it("copies the run, freezes the comparison and writes meta", async () => {
    const { deps, run, source, compared } = setup();
    const dir = run("aska-panel-Ab12Cd");
    const out = await archiveFolder(source(dir), deps);
    expect(out?.changed).toBe(true);
    expect(out?.id).toMatch(RUN_ID);
    expect(out?.id.endsWith("-Ab12Cd")).toBe(true);
    const entry = deps.store.entryDir(out!.id);
    expect(existsSync(join(entry, "brief.md"))).toBe(true);
    expect(existsSync(join(entry, "judgments/guardian.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(entry, "comparison.json"), "utf8")).panel).toBe("aska:plan");
    const meta = (await deps.store.get(out!.id))!.meta;
    expect(meta).toMatchObject({ source: "paseo", tmpDir: dir, agentId: "a1", workspaceId: "w1", projectPath: "/repo", panel: "aska:plan", reportCallId: "r1", skipped: [] });
    expect(meta.panelists.map((p) => [p.persona, p.verdict])).toEqual([
      ["aska:planner", "proceed-with-conditions"],
      ["aska:guardian", "proceed-with-conditions"],
      ["aska:accelerator", "proceed-with-conditions"],
    ]);
    expect(meta.comparedAt).not.toBeNull();
    expect(compared[0]!.cwd).toBe("/repo");
    expect(compared[0]!.file).toMatch(new RegExp(`^${entry}\\.partial-[0-9a-f]+/panel-result\\.json$`));
  });

  it("does nothing when neither the result nor the report call changed", async () => {
    const { deps, run, source } = setup();
    const dir = run("aska-panel-Ab12Cd");
    const first = await archiveFolder(source(dir), deps);
    const archivedAt = (await deps.store.get(first!.id))!.meta.archivedAt;
    expect(await archiveFolder(source(dir), deps)).toEqual({ id: first!.id, changed: false });
    expect((await deps.store.get(first!.id))!.meta.archivedAt).toBe(archivedAt);
  });

  it("refreshes the same entry when the result or the report call changes", async () => {
    const { deps, run, source } = setup();
    const dir = run("aska-panel-Ab12Cd");
    const first = await archiveFolder(source(dir), deps);
    expect(await archiveFolder(source(dir, { reportCallId: "r2" }), deps)).toEqual({ id: first!.id, changed: true });
    const result = JSON.parse(readFileSync(join(dir, "panel-result.json"), "utf8"));
    writeFileSync(join(dir, "panel-result.json"), JSON.stringify({ ...result, question: "Changed?" }));
    expect(await archiveFolder(source(dir, { reportCallId: "r2" }), deps)).toEqual({ id: first!.id, changed: true });
    expect((await deps.store.get(first!.id))!.meta.question).toBe("Changed?");
    expect((await deps.store.list())).toHaveLength(1);
  });

  it("skips files over 5 MB and symlinks, and lists them", async () => {
    const { deps, run, source } = setup();
    const dir = run("aska-panel-Ab12Cd");
    writeFileSync(join(dir, "huge.diff"), Buffer.alloc(MAX_FILE_BYTES + 1));
    symlinkSync("/etc/hostname", join(dir, "link.txt"));
    const out = await archiveFolder(source(dir), deps);
    const meta = (await deps.store.get(out!.id))!.meta;
    expect(meta.skipped).toEqual(expect.arrayContaining(["huge.diff (5 MB)", "link.txt (symlink)"]));
    expect(existsSync(join(deps.store.entryDir(out!.id), "huge.diff"))).toBe(false);
  });

  it("archives without a comparison when compare fails", async () => {
    const { deps, run, source, logged } = setup(async () => {
      throw new Error("Unexpected error: aska exited with code 2");
    });
    const out = await archiveFolder(source(run("aska-panel-Ab12Cd")), deps);
    const meta = (await deps.store.get(out!.id))!.meta;
    expect(meta.comparedAt).toBeNull();
    expect(meta.panelists[0]?.verdict).toBeNull();
    expect(existsSync(join(deps.store.entryDir(out!.id), "comparison.json"))).toBe(false);
    expect(logged.some((m) => m.includes("compare failed"))).toBe(true);
  });

  it("retries a comparedAt: null entry on the next call until compare succeeds", async () => {
    const { deps, run, source } = setup(async () => ({ nope: true }));
    const dir = run("aska-panel-Ab12Cd");
    const first = await archiveFolder(source(dir), deps);
    expect(first?.changed).toBe(true);
    let meta = (await deps.store.get(first!.id))!.meta;
    expect(meta.comparedAt).toBeNull();
    expect(existsSync(join(deps.store.entryDir(first!.id), "comparison.json"))).toBe(false);

    deps.compare = async () => JSON.parse(readFileSync(join(FIXTURES, "plan-trio/comparison.json"), "utf8"));
    const second = await archiveFolder(source(dir), deps);
    expect(second).toEqual({ id: first!.id, changed: true });
    meta = (await deps.store.get(first!.id))!.meta;
    expect(meta.comparedAt).not.toBeNull();
    expect(JSON.parse(readFileSync(join(deps.store.entryDir(first!.id), "comparison.json"), "utf8")).panel).toBe("aska:plan");
  });

  it("keeps the previous frozen comparison when a later refresh's compare fails", async () => {
    const { deps, run, source } = setup();
    const dir = run("aska-panel-Ab12Cd");
    const first = await archiveFolder(source(dir), deps);
    const firstMeta = (await deps.store.get(first!.id))!.meta;
    expect(firstMeta.comparedAt).not.toBeNull();
    const prevComparison = readFileSync(join(deps.store.entryDir(first!.id), "comparison.json"), "utf8");

    deps.compare = async () => {
      throw new Error("transient failure");
    };
    const result = JSON.parse(readFileSync(join(dir, "panel-result.json"), "utf8"));
    writeFileSync(join(dir, "panel-result.json"), JSON.stringify({ ...result, question: "Changed?" }));
    const second = await archiveFolder(source(dir), deps);
    expect(second).toEqual({ id: first!.id, changed: true });
    const secondMeta = (await deps.store.get(first!.id))!.meta;
    expect(secondMeta.comparedAt).toBe(firstMeta.comparedAt);
    expect(readFileSync(join(deps.store.entryDir(first!.id), "comparison.json"), "utf8")).toBe(prevComparison);
  });

  it("ignores a meta.json already present in the run folder and writes its own", async () => {
    const { deps, run, source } = setup();
    const dir = run("aska-panel-Ab12Cd");
    writeFileSync(join(dir, "meta.json"), JSON.stringify({ schemaVersion: 1, id: "not-ours" }));
    const out = await archiveFolder(source(dir), deps);
    const meta = (await deps.store.get(out!.id))!.meta;
    expect(meta.schemaVersion).toBe(1);
    expect(meta.id).toBe(out!.id);
  });

  it("returns null for a folder without a panel result", async () => {
    const { deps, paths, source } = setup();
    const dir = join(paths.tmpRoot, "aska-panel-Empty0");
    mkdirSync(dir);
    expect(await archiveFolder(source(dir), deps)).toBeNull();
  });

  it("writes the entry owner-only: directories 0700, files 0600", async () => {
    const { deps, run, source } = setup();
    const out = await archiveFolder(source(run("aska-panel-Ab12Cd")), deps);
    const entry = deps.store.entryDir(out!.id);
    const walk = (p: string): string[] => [p, ...(statSync(p).isDirectory() ? readdirSync(p).flatMap((n) => walk(join(p, n))) : [])];
    const paths = walk(entry);
    expect(paths.some((p) => p.endsWith("meta.json"))).toBe(true);
    expect(paths.some((p) => p.endsWith("comparison.json"))).toBe(true);
    for (const p of paths) {
      const s = statSync(p);
      expect([p, (s.mode & 0o777).toString(8)]).toEqual([p, s.isDirectory() ? "700" : "600"]);
    }
  });

  it("serialises two concurrent archives of one folder", async () => {
    let active = 0;
    let peak = 0;
    const { deps, run, source, paths } = setup(async () => {
      peak = Math.max(peak, ++active);
      await new Promise((r) => setTimeout(r, 20));
      active--;
      return JSON.parse(readFileSync(join(FIXTURES, "plan-trio/comparison.json"), "utf8"));
    });
    const dir = run("aska-panel-Ab12Cd");
    const [a, b] = await Promise.all([archiveFolder(source(dir, { reportCallId: "r1" }), deps), archiveFolder(source(dir, { reportCallId: "r2" }), deps)]);
    expect(peak).toBe(1);
    expect(a!.id).toBe(b!.id);
    expect([a!.changed, b!.changed]).toEqual([true, true]);
    expect(readdirSync(paths.storeRoot)).toEqual([a!.id]);
    expect((await deps.store.get(a!.id))!.meta.reportCallId).toBe("r2");
  });

  it("keeps serving later archives of a folder after one fails", async () => {
    let calls = 0;
    const { deps, run, source } = setup(async () => {
      if (++calls === 1) throw new Error("boom");
      return JSON.parse(readFileSync(join(FIXTURES, "plan-trio/comparison.json"), "utf8"));
    });
    const dir = run("aska-panel-Ab12Cd");
    const [a, b] = await Promise.all([archiveFolder(source(dir), deps), archiveFolder(source(dir), deps)]);
    expect(a?.changed).toBe(true);
    expect(b?.changed).toBe(true); // the first left comparedAt null, so the second retries
    expect((await deps.store.get(b!.id))!.meta.comparedAt).not.toBeNull();
  });
});

describe("archiveFolder with an entry it can't read", () => {
  it("keeps an entry whose meta.json is unreadable aside, instead of deleting it, and archives afresh", async () => {
    const { deps, run, source, logged } = setup();
    const dir = run("aska-panel-Ab12Cd");
    const first = await archiveFolder(source(dir), deps);
    const entry = deps.store.entryDir(first!.id);
    writeFileSync(join(entry, "meta.json"), "{ broken");
    writeFileSync(join(dir, "panel-result.json"), readFileSync(join(dir, "panel-result.json"), "utf8") + "\n");
    const second = await archiveFolder(source(dir), deps);
    expect(second).toMatchObject({ id: first!.id, changed: true });
    const kept = readdirSync(deps.store.root).filter((n) => n.startsWith(`${first!.id}.unreadable-`));
    expect(kept).toHaveLength(1);
    expect(existsSync(join(deps.store.root, kept[0]!, "timeline.json")) || existsSync(join(deps.store.root, kept[0]!, "brief.md"))).toBe(true);
    expect(logged.some((l) => l.includes(`kept it as ${join(deps.store.root, kept[0]!)}`))).toBe(true);
  });

  it("leaves an entry written by a newer version untouched", async () => {
    const { deps, run, source, logged } = setup();
    const dir = run("aska-panel-Ab12Cd");
    const first = await archiveFolder(source(dir), deps);
    const metaFile = join(deps.store.entryDir(first!.id), "meta.json");
    const newer = JSON.stringify({ ...JSON.parse(readFileSync(metaFile, "utf8")), schemaVersion: 2 });
    writeFileSync(metaFile, newer);
    writeFileSync(join(dir, "panel-result.json"), readFileSync(join(dir, "panel-result.json"), "utf8") + "\n");
    expect(await archiveFolder(source(dir), deps)).toBeNull();
    expect(readFileSync(metaFile, "utf8")).toBe(newer);
    expect(logged.some((l) => l.includes("newer aska-editor"))).toBe(true);
  });
});

describe("a deleted run", () => {
  it("stays deleted through imports and turn ends while its panel result is unchanged", async () => {
    const { deps, paths, run, source } = setup();
    const dir = run("aska-panel-Ab12Cd");
    const first = await importTmp(paths, deps);
    expect(first.imported).toBe(1);
    const [entry] = await deps.store.list();
    expect(await deps.store.delete(entry!.id)).toBe(true);
    expect(await importTmp(paths, deps)).toEqual({ imported: 0, skipped: 0, alreadyArchived: 0 });
    expect(await archiveFolder(source(dir), deps)).toBeNull();
    expect(await deps.store.list()).toEqual([]);
  });

  it("is archived again when its panel runs again in the same folder", async () => {
    const { deps, run, source } = setup();
    const dir = run("aska-panel-Ab12Cd");
    const first = await archiveFolder(source(dir), deps);
    await deps.store.delete(first!.id);
    writeFileSync(join(dir, "panel-result.json"), readFileSync(join(dir, "panel-result.json"), "utf8") + "\n");
    expect(await archiveFolder(source(dir), deps)).toMatchObject({ changed: true });
  });
});

describe("archiveFromTimeline", () => {
  it("archives the last compare per folder, and skips a run-shaped path outside the allow-list that names nothing, quietly", async () => {
    const { deps, paths, run, logged } = setup();
    const dir = run("aska-panel-Ab12Cd");
    const compareCall = (callId: string, d: string) => ({
      type: "tool_call", callId, name: "Bash", status: "completed", error: null,
      detail: { type: "shell", command: `node /p/persona.mjs compare --file ${d}/panel-result.json --json`, output: "{}" },
    });
    const outcomes = await archiveFromTimeline(
      { agent: { id: "a1", workspaceId: "w1", cwd: "/repo" }, timeline: [compareCall("r1", dir), compareCall("r2", dir), compareCall("r3", "/tmp/aska-panel-Zz99Yy")] },
      { ...deps, paths },
    );
    expect(outcomes).toHaveLength(1);
    expect((await deps.store.get(outcomes[0]!.id))!.meta).toMatchObject({ reportCallId: "r2", agentId: "a1", projectPath: "/repo" });
    expect(logged).toEqual([]);
  });

  it("logs a real run folder in another temp directory, so a TMPDIR mismatch is visible", async () => {
    const { deps, paths, logged } = setup();
    const other = join(paths.tmpRoot, "..", "other-tmp");
    mkdirSync(other);
    const dir = join(other, "aska-panel-Ot44Er");
    cpSync(join(FIXTURES, "plan-trio"), dir, { recursive: true });
    const compareCall = {
      type: "tool_call", callId: "r1", name: "Bash", status: "completed", error: null,
      detail: { type: "shell", command: `node /p/persona.mjs compare --file ${dir}/panel-result.json --json`, output: "{}" },
    };
    const outcomes = await archiveFromTimeline({ agent: { id: "a1", workspaceId: "w1", cwd: "/repo" }, timeline: [compareCall] }, { ...deps, paths });
    expect(outcomes).toEqual([]);
    expect(logged).toEqual([`aska-editor: ${dir} is not an archivable run folder`]);
  });

  it("logs only a refused folder that exists, not a run-shaped path that names nothing", async () => {
    const { deps, paths, run, logged } = setup();
    const elsewhere = run("aska-panel-Ab12Cd");
    const planted = join(paths.tmpRoot, "aska-panel-Pl4nt0");
    symlinkSync(elsewhere, planted);
    const compareCall = (callId: string, d: string) => ({
      type: "tool_call", callId, name: "Bash", status: "completed", error: null,
      detail: { type: "shell", command: `node /p/persona.mjs compare --file ${d}/panel-result.json --json`, output: "{}" },
    });
    await archiveFromTimeline(
      { agent: { id: "a1", workspaceId: "w1", cwd: "/repo" }, timeline: [compareCall("r1", join(paths.tmpRoot, "aska-panel-Gone00")), compareCall("r2", planted)] },
      { ...deps, paths },
    );
    expect(logged).toEqual([`aska-editor: ${planted} is not an archivable run folder`]);
  });
});

describe("importTmp", () => {
  it("imports finished runs once and counts the rest as skipped", async () => {
    const { deps, paths, run } = setup();
    run("aska-panel-Ab12Cd");
    run("aska-panel-Cd34Ef", "malformed-pair");
    mkdirSync(join(paths.tmpRoot, "aska-panel-NoRes0"));
    mkdirSync(join(paths.tmpRoot, "unrelated"));
    expect(await importTmp(paths, deps)).toEqual({ imported: 2, skipped: 1, alreadyArchived: 0 });
    expect(await importTmp(paths, deps)).toEqual({ imported: 0, skipped: 1, alreadyArchived: 2 });
    const metas = await deps.store.list();
    expect(metas.every((m) => m.source === "import" && m.agentId === null && m.projectPath === null && m.reportCallId === null)).toBe(true);
  });

  it("also imports kept runs from aska's own run store", async () => {
    const { deps, paths } = setup();
    const askaDir = join(paths.askaRunsRoot, "20261011T201003Z-19HsD1");
    cpSync(join(FIXTURES, "plan-trio"), askaDir, { recursive: true });
    expect(await importTmp(paths, deps)).toEqual({ imported: 1, skipped: 0, alreadyArchived: 0 });
    expect(await importTmp(paths, deps)).toEqual({ imported: 0, skipped: 0, alreadyArchived: 1 });
    const metas = await deps.store.list();
    expect(metas).toHaveLength(1);
    expect(metas[0]).toMatchObject({ source: "import", tmpDir: askaDir });
  });

  it("is fine without an askaRunsRoot", async () => {
    const { deps, paths, run } = setup();
    run("aska-panel-Ab12Cd");
    rmSync(paths.askaRunsRoot, { recursive: true, force: true });
    expect(await importTmp(paths, deps)).toEqual({ imported: 1, skipped: 0, alreadyArchived: 0 });
  });
});
