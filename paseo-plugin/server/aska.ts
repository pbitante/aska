import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Runner } from "./runner";

const CLI_TIMEOUT_MS = 15_000;
const TAIL = 2000;

export class AskaError extends Error {}

export interface CallOptions {
  cliPath: string;
  cwd: string;
  args: string[];
  body?: string;
}
export interface CallDeps {
  runner: Runner;
  tmpDir: string;
  log?: (message: string) => void;
}

// One "unexpected error" shape for everything that isn't a normal CLI answer. It is logged so
// it shows up in `paseo plugin logs aska-editor`.
export function unexpected(what: string, tail = "", log: (message: string) => void = console.error): AskaError {
  const e = new AskaError(`Unexpected error: ${what}${tail ? `\n${tail}` : ""}`);
  log(e.message);
  return e;
}

export async function callAska(deps: CallDeps, opts: CallOptions): Promise<unknown> {
  const timeoutMs = CLI_TIMEOUT_MS;
  let dir: string | undefined;
  try {
    const args = [opts.cliPath, ...opts.args];
    if (opts.body !== undefined) {
      dir = await mkdtemp(join(deps.tmpDir, "aska-editor-"));
      const file = join(dir, "body");
      await writeFile(file, opts.body, "utf8");
      args.push("--file", file);
    }
    args.push("--cwd", opts.cwd);
    const r = await deps.runner({ args, timeoutMs });
    const tail = (r.stderr.trim() || r.stdout.trim()).slice(-TAIL);
    if (r.timedOut) throw unexpected(`aska timed out after ${timeoutMs / 1000}s`, tail, deps.log);
    if (r.spawnError) throw unexpected(`couldn't start aska: ${r.spawnError}`, tail, deps.log);
    if (r.code !== 0 && r.code !== 1) throw unexpected(`aska exited with code ${r.code}`, tail, deps.log);
    try {
      return JSON.parse(r.stdout) as unknown;
    } catch {
      throw unexpected("aska printed output that isn't JSON", tail, deps.log);
    }
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}
