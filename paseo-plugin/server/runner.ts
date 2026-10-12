import { spawn } from "node:child_process";

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnError?: string;
}
export interface RunRequest {
  args: string[];
  timeoutMs: number;
}
export type Runner = (req: RunRequest) => Promise<RunResult>;

export function spawnCapture(command: string, args: string[], timeoutMs: number, extraEnv: Record<string, string> = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const finish = (result: RunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const child = spawn(command, args, { env: { ...process.env, ...extraEnv }, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    child.on("error", (e) => finish({ code: null, stdout, stderr, timedOut, spawnError: e.message }));
    child.on("close", (code) => finish({ code, stdout, stderr, timedOut }));
  });
}

// The plugin subprocess may be Paseo's Electron binary, and `node` may not be on the daemon's
// PATH. ELECTRON_RUN_AS_NODE makes process.execPath plain Node either way.
export const nodeRunner: Runner = ({ args, timeoutMs }) => spawnCapture(process.execPath, args, timeoutMs, { ELECTRON_RUN_AS_NODE: "1" });

export async function claudePluginList(): Promise<string> {
  const r = await spawnCapture("claude", ["plugin", "list", "--json"], 15_000);
  if (r.spawnError) throw new Error(r.spawnError);
  if (r.timedOut) throw new Error("timed out after 15s");
  if (r.code !== 0) throw new Error(`exit ${r.code}: ${(r.stderr || r.stdout).trim().slice(-500)}`);
  return r.stdout;
}
