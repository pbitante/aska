import { dirname, join, resolve } from "node:path";
import type { AskaStatus } from "../shared/schemas";
import { errorText, isObj } from "../shared/guards";

const MIN_VERSION = "0.3.0";
const CLI_RELATIVE: readonly string[] = ["skills", "operator", "scripts", "persona.mjs"];

export interface LocateDeps {
  settingPath: string;
  home: string;
  pluginList: () => Promise<string>;
  readManifest: (pluginRoot: string) => Promise<string | undefined>;
  exists: (path: string) => Promise<boolean>;
}

export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.split("-")[0]!.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

const expandHome = (p: string, home: string): string =>
  p === "~" ? home : p.startsWith("~/") ? join(home, p.slice(2)) : resolve(p);

// persona.mjs sits at <root>/skills/operator/scripts/persona.mjs.
const rootOfCli = (cliPath: string): string => resolve(dirname(cliPath), "..", "..", "..");

async function fromRoot(root: string, cliPath: string, deps: LocateDeps): Promise<AskaStatus> {
  if (!(await deps.exists(cliPath))) return { ok: false, reason: `aska's CLI was not found at ${cliPath}` };
  let version: string | undefined;
  try {
    const manifest: unknown = JSON.parse((await deps.readManifest(root)) ?? "");
    if (isObj(manifest) && typeof manifest.version === "string") version = manifest.version;
  } catch {
    version = undefined;
  }
  if (!version) return { ok: false, cliPath, reason: `can't read aska's version from ${join(root, ".claude-plugin", "plugin.json")}` };
  if (compareVersions(version, MIN_VERSION) < 0) {
    return { ok: false, version, cliPath, reason: `aska ${version} found; ${MIN_VERSION} or newer is needed` };
  }
  return { ok: true, version, cliPath };
}

export async function locateAska(deps: LocateDeps): Promise<AskaStatus> {
  const setting = deps.settingPath.trim();
  if (setting !== "") {
    const cliPath = expandHome(setting, deps.home);
    return fromRoot(rootOfCli(cliPath), cliPath, deps);
  }
  let raw: string;
  try {
    raw = await deps.pluginList();
  } catch (e) {
    return { ok: false, reason: `couldn't run "claude plugin list --json": ${errorText(e)}` };
  }
  let entries: unknown;
  try {
    entries = JSON.parse(raw);
  } catch {
    return { ok: false, reason: `"claude plugin list --json" printed something that isn't JSON` };
  }
  const askas = (Array.isArray(entries) ? entries : []).filter(isObj).filter((e) => typeof e.id === "string" && e.id.startsWith("aska@"));
  if (askas.length === 0) return { ok: false, reason: "the aska plugin isn't installed in Claude Code" };
  const enabled = askas.filter((e): e is Record<string, unknown> & { installPath: string } => e.enabled === true && typeof e.installPath === "string");
  if (enabled.length === 0) return { ok: false, reason: "the aska plugin is installed but disabled" };
  const results = await Promise.all(enabled.map((e) => fromRoot(e.installPath, join(e.installPath, ...CLI_RELATIVE), deps)));
  const found = results.filter((r) => r.ok).sort((a, b) => compareVersions(b.version!, a.version!));
  return found[0] ?? results[0]!;
}

// Caches only a found aska, keyed by the settings revision, so a changed setting or a fresh
// install is picked up on the next call.
export class AskaLocator {
  private cache: { revision: string; status: AskaStatus } | undefined;

  constructor(
    private readonly source: () => Promise<{ revision: string; settingPath: string }>,
    private readonly locate: (settingPath: string) => Promise<AskaStatus>,
  ) {}

  async get(): Promise<AskaStatus> {
    const { revision, settingPath } = await this.source();
    if (this.cache?.revision === revision) return this.cache.status;
    const status = await this.locate(settingPath);
    this.cache = status.ok ? { revision, status } : undefined;
    return status;
  }

  invalidate(): void {
    this.cache = undefined;
  }
}
