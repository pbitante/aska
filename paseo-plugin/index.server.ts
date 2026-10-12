import { existsSync } from "node:fs";
import { access, mkdir, readFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { callAska } from "./server/aska";
import { ActivityCollector } from "./server/activity/collector";
import { chooseCwd, type WorkspaceLookup } from "./server/cwd";
import { createHandlers } from "./server/handlers";
import { AskaLocator, locateAska } from "./server/locate";
import { claudePluginList, nodeRunner } from "./server/runner";
import { archiveFromTimeline, createAutoImport, importTmp, type ArchiveDeps } from "./server/runs/archive";
import { createRunHandlers } from "./server/runs/handlers";
import { defaultRunPaths } from "./server/runs/paths";
import { RunStore } from "./server/runs/store";
import { runActivityRpc } from "./shared/activity";
import { askaStatusRpc, catalogListRpc, fileDeleteRpc, filePatchRpc, fileSaveRpc, fileShowRpc } from "./shared/rpc";
import { runReportRpc, runsDeleteRpc, runsImportRpc, runsListRpc, runStatusRpc } from "./shared/runs";
import { askaSettings } from "./shared/settings";
import { errorText } from "./shared/guards";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(askaSettings);
  const locator = new AskaLocator(
    async () => {
      const s = await settings.read();
      return { revision: s.revision, settingPath: s.status === "ready" ? s.values.askaCliPath : "" };
    },
    (settingPath) =>
      locateAska({
        settingPath,
        home: homedir(),
        pluginList: claudePluginList,
        readManifest: (root) => readFile(join(root, ".claude-plugin", "plugin.json"), "utf8").catch(() => undefined),
        exists: (path) => access(path).then(() => true, () => false),
      }),
  );
  const ensureDir = async (path: string) => {
    await mkdir(path, { recursive: true });
  };
  const workspaceDir = async (id: string, paseo: WorkspaceLookup) => (await paseo.workspaces.ref(id).refresh())?.workspaceDirectory ?? null;

  const handlers = createHandlers({
    status: () => locator.get(),
    invalidate: () => locator.invalidate(),
    exists: existsSync,
    cwd: (workspaceId, paseo) => chooseCwd(workspaceId, { tmpDir: tmpdir(), ensureDir, workspaceDirectory: (id) => workspaceDir(id, paseo) }),
    call: (opts) => callAska({ runner: nodeRunner, tmpDir: tmpdir() }, opts),
  });

  const paths = defaultRunPaths(process.env, homedir(), tmpdir());
  const archive: ArchiveDeps = {
    store: new RunStore(paths.storeRoot, (message) => console.error(message)),
    compare: async (resultFile, cwd) => {
      const status = await locator.get();
      if (!status.ok || !status.cliPath) throw new Error(`aska ≥ 0.3.0 not found: ${status.reason ?? "unknown reason"}`);
      const dir =
        cwd !== null && existsSync(cwd) ? cwd : await chooseCwd(undefined, { tmpDir: tmpdir(), ensureDir, workspaceDirectory: async () => null });
      return callAska({ runner: nodeRunner, tmpDir: tmpdir() }, { cliPath: status.cliPath, cwd: dir, args: ["compare", "--file", resultFile, "--json"] });
    },
    now: () => new Date(),
    log: (message) => console.error(message),
  };
  const autoImport = createAutoImport(() => importTmp(paths, archive));
  const runs = createRunHandlers({ paths, archive, autoImport, workspaceDir });
  const activity = new ActivityCollector({ now: Date.now, log: (message) => console.error(message) });
  void autoImport().catch((e) => console.error(`aska-editor: auto-import at startup failed: ${errorText(e)}`));

  server.handle(askaStatusRpc, () => handlers.status());
  server.handle(catalogListRpc, handlers.list);
  server.handle(fileShowRpc, handlers.show);
  server.handle(filePatchRpc, handlers.patch);
  server.handle(fileSaveRpc, handlers.save);
  server.handle(fileDeleteRpc, handlers.remove);
  server.handle(runReportRpc, runs.report);
  server.handle(runStatusRpc, (input) => runs.status(input));
  server.handle(runsListRpc, runs.list);
  server.handle(runsDeleteRpc, (input) => runs.remove(input));
  server.handle(runsImportRpc, () => runs.importTmp());
  server.handle(runActivityRpc, async (input, { paseo }) => {
    await activity.ensure(paseo);
    return activity.read(input.agentId, input.since);
  });
  server.on("agent.turn_started", async (_event, { paseo }) => {
    await activity.ensure(paseo);
  });
  server.on("agent.archived", (event) => {
    activity.drop(event.agent.id);
  });
  server.on("agent.turn_ended", async (event, { paseo }) => {
    await activity.ensure(paseo);
    try {
      await archiveFromTimeline({ agent: event.agent, timeline: event.timeline }, { ...archive, paths, activityOf: (id) => activity.read(id) });
    } catch (e) {
      console.error(`aska-editor: archiving after a turn failed: ${errorText(e)}`);
    }
  });
  return () => activity.dispose();
}
