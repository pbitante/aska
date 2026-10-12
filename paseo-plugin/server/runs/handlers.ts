import { lstat, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import type { RpcInput } from "@getpaseo/plugin";
import {
  comparisonSchema,
  panelResultSchema,
  timelineSchema,
  type Comparison,
  type PanelResult,
  type RunReport,
  type runReportRpc,
  type runsDeleteRpc,
  type runsListRpc,
  type runStatusRpc,
  type Timeline,
} from "../../shared/runs";
import { unexpected } from "../aska";
import type { WorkspaceLookup } from "../cwd";
import type { ArchiveDeps, AutoImport } from "./archive";
import { readRegular, readRegularJson } from "./files";
import { lexicalRunDir, realRunDir, type RunPaths } from "./paths";
import type { StoredRun } from "./store";
import { errorText, isObj } from "../../shared/guards";

export interface RunHandlerDeps {
  paths: RunPaths;
  archive: ArchiveDeps;
  autoImport: AutoImport;
  workspaceDir: (workspaceId: string, paseo: WorkspaceLookup) => Promise<string | null>;
}
interface Ctx {
  paseo: WorkspaceLookup;
}
type Judgments = RunReport["judgments"];

const readResult = (dir: string, log: (m: string) => void) =>
  readRegularJson<PanelResult>(join(dir, "panel-result.json"), (v) => panelResultSchema.safeParse(v), log);

function judgmentsOf(result: PanelResult): Judgments {
  return result.panelists.filter((p) => p.judgment !== undefined).map((p) => ({ persona: p.persona, judgment: p.judgment }));
}

// A judgment file that isn't JSON is skipped and logged with its path and the error's name, never
// its content, as readRegularJson does.
async function judgmentFiles(dir: string, log: (m: string) => void): Promise<Judgments> {
  const judgmentsDir = join(dir, "judgments");
  try {
    if (!(await lstat(judgmentsDir)).isDirectory()) return [];
  } catch {
    return [];
  }
  let names: string[];
  try {
    names = (await readdir(judgmentsDir)).filter((n) => n.endsWith(".json")).sort();
  } catch {
    return [];
  }
  const out: Judgments = [];
  for (const name of names) {
    const path = join(judgmentsDir, name);
    const text = await readRegular(path);
    if (text === null) continue;
    try {
      const judgment: unknown = JSON.parse(text);
      out.push({ persona: isObj(judgment) && typeof judgment.persona === "string" ? judgment.persona : basename(name, ".json"), judgment });
    } catch (e) {
      log(`aska-editor: ${path} is malformed: ${e instanceof Error ? e.name : String(e)}`);
    }
  }
  return out;
}

async function fromArchive(run: StoredRun, log: (m: string) => void): Promise<RunReport> {
  const result = await readResult(run.dir, log);
  return {
    source: "archive",
    dir: run.meta.tmpDir ?? run.dir,
    brief: await readRegular(join(run.dir, "brief.md")),
    result,
    comparison: await readRegularJson<Comparison>(join(run.dir, "comparison.json"), (v) => comparisonSchema.safeParse(v), log),
    compareError: null,
    judgments: result ? judgmentsOf(result) : await judgmentFiles(run.dir, log),
    meta: run.meta,
    timeline: await readRegularJson<Timeline>(join(run.dir, "timeline.json"), (v) => timelineSchema.safeParse(v), log),
  };
}

export function createRunHandlers(deps: RunHandlerDeps) {
  const { store } = deps.archive;
  const allowed = (dir: string): string => {
    const lexical = lexicalRunDir(dir, deps.paths);
    if (!lexical) throw new Error("Not a panel run folder");
    return lexical;
  };
  // The panel polls its report every few seconds. A broken file's line is logged when the file
  // turns up broken, not on every poll: each run remembers the lines its last report logged, so a
  // file that is fixed and then breaks again is logged again.
  const lastLogged = new Map<string, Set<string>>();

  const reportOf = async (input: RpcInput<typeof runReportRpc>, ctx: Ctx, logOnce: (message: string) => void): Promise<RunReport> => {
    if (input.id !== undefined) {
      const run = await store.get(input.id);
      if (!run) throw new Error(`No archived run ${input.id}`);
      return fromArchive(run, logOnce);
    }
    const lexical = allowed(input.dir!);
    const archived = await store.findByTmpDir(lexical);
    const realDir = await realRunDir(lexical, deps.paths);
    if (!realDir) {
      if (archived) return fromArchive(archived, logOnce);
      throw new Error("This run's folder is gone and it was never archived");
    }
    const result = await readResult(realDir, logOnce);
    let comparison: Comparison | null = null;
    let compareError: string | null = null;
    if (result) {
      const cwd = input.workspaceId ? await deps.workspaceDir(input.workspaceId, ctx.paseo) : (archived?.meta.projectPath ?? null);
      try {
        const parsed = comparisonSchema.safeParse(await deps.archive.compare(join(realDir, "panel-result.json"), cwd));
        if (parsed.success) comparison = parsed.data;
        else compareError = unexpected("aska's compare output didn't match what the editor expects", parsed.error.message.slice(0, 1000), deps.archive.log).message;
      } catch (e) {
        compareError = unexpected("aska's compare failed", errorText(e), deps.archive.log).message;
      }
      if (comparison === null && archived?.meta.comparedAt) {
        comparison = await readRegularJson<Comparison>(join(archived.dir, "comparison.json"), (v) => comparisonSchema.safeParse(v), logOnce);
      }
    }
    return {
      source: "live",
      dir: lexical,
      brief: await readRegular(join(realDir, "brief.md")),
      result,
      comparison,
      compareError,
      judgments: result ? judgmentsOf(result) : await judgmentFiles(realDir, logOnce),
      meta: archived?.meta ?? null,
      timeline: null,
    };
  };

  return {
    async report(input: RpcInput<typeof runReportRpc>, ctx: Ctx): Promise<RunReport> {
      const key = input.id ?? input.dir ?? "";
      const before = lastLogged.get(key);
      const now = new Set<string>();
      const logOnce = (message: string) => {
        if (!before?.has(message) && !now.has(message)) deps.archive.log(message);
        now.add(message);
      };
      try {
        return await reportOf(input, ctx, logOnce);
      } finally {
        if (now.size > 0) lastLogged.set(key, now);
        else lastLogged.delete(key);
      }
    },

    async status({ dir }: RpcInput<typeof runStatusRpc>) {
      const run = await store.findByTmpDir(allowed(dir));
      return { archivedId: run?.meta.id ?? null, reportCallId: run?.meta.reportCallId ?? null };
    },

    async list({ workspaceId }: RpcInput<typeof runsListRpc>, ctx: Ctx) {
      try {
        await deps.autoImport();
      } catch (e) {
        deps.archive.log(`aska-editor: auto-import before runs.list failed: ${errorText(e)}`);
      }
      const runs = await store.list();
      if (!workspaceId) return { runs };
      const dir = await deps.workspaceDir(workspaceId, ctx.paseo);
      return { runs: runs.filter((m) => m.workspaceId === workspaceId || (dir !== null && m.projectPath === dir)) };
    },

    async remove({ id }: RpcInput<typeof runsDeleteRpc>) {
      return { deleted: await store.delete(id) };
    },

    importTmp: () => deps.autoImport({ force: true }),
  };
}
