import { existsSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { locateAska } from "../../server/locate";
import { claudePluginList } from "../../server/runner";
import type { AskaStatus } from "../../shared/schemas";

// These tests run the real aska CLI, so they only run with ASKA_IT=1, and then a CLI that can't be
// used fails the run instead of skipping it. ASKA_CLI_PATH points at a persona.mjs. Unset, the
// aska in this monorepo's panel/ folder is used, and outside the monorepo, the aska plugin installed
// in Claude Code, found the same way the daemon finds it.
const sibling = fileURLToPath(new URL("../../../panel/skills/operator/scripts/persona.mjs", import.meta.url));
const required = process.env.ASKA_IT === "1";
export const status: AskaStatus = required
  ? await locateAska({
      settingPath: process.env.ASKA_CLI_PATH ?? (existsSync(sibling) ? sibling : ""),
      home: homedir(),
      pluginList: claudePluginList,
      readManifest: (root) => readFile(join(root, ".claude-plugin", "plugin.json"), "utf8").catch(() => undefined),
      exists: (p) => access(p).then(() => true, () => false),
    })
  : { ok: false, reason: "set ASKA_IT=1 to run it" };
if (!status.ok && required) throw new Error(`ASKA_IT=1 but the aska CLI isn't usable: ${status.reason}. Install aska ≥ 0.3.0 in Claude Code, or point ASKA_CLI_PATH at its persona.mjs.`);
