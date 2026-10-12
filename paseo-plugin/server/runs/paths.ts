import { realpath, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { RUN_DIR_NAME, RUN_ID } from "../../shared/runs";

export interface RunPaths {
  tmpRoot: string;
  askaRunsRoot: string;
  storeRoot: string;
}

export function defaultRunPaths(env: Record<string, string | undefined>, home: string, tmp: string): RunPaths {
  const data = env.XDG_DATA_HOME && env.XDG_DATA_HOME.trim() !== "" ? env.XDG_DATA_HOME : join(home, ".local", "share");
  return { tmpRoot: tmp, askaRunsRoot: join(home, ".claude", "aska", "runs"), storeRoot: join(data, "aska-editor", "runs") };
}

// A run folder as written: a direct child of the temp dir named aska-panel-XXXXXX, or of aska's
// runs store named like a run id. Returns the normalised path, or null.
export function lexicalRunDir(dir: string, paths: RunPaths): string | null {
  if (!dir.startsWith("/")) return null;
  const p = resolve(dir);
  const name = basename(p);
  const parent = dirname(p);
  if (parent === resolve(paths.tmpRoot) && RUN_DIR_NAME.test(name)) return p;
  if (parent === resolve(paths.askaRunsRoot) && RUN_ID.test(name)) return p;
  return null;
}

async function real(p: string): Promise<string | null> {
  try {
    return await realpath(p);
  } catch {
    return null;
  }
}

// The folder's real path, if it exists, still sits directly under one of the two roots once
// symlinks are resolved, and (when the process can tell) is owned by this process's own user. A
// symlinked run folder pointing elsewhere, or one planted by another local user in a shared temp
// dir, is refused.
export async function realRunDir(dir: string, paths: RunPaths, uid = process.getuid?.()): Promise<string | null> {
  const lexical = lexicalRunDir(dir, paths);
  if (!lexical) return null;
  const target = await real(lexical);
  if (!target) return null;
  const roots = (await Promise.all([real(paths.tmpRoot), real(paths.askaRunsRoot)])).filter((r): r is string => r !== null);
  if (!roots.includes(dirname(target)) || basename(target) !== basename(lexical)) return null;
  if (uid !== undefined && (await stat(target)).uid !== uid) return null;
  return target;
}
