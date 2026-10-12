import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AskaError, callAska, type CallDeps } from "../../server/aska";
import type { RunResult, Runner } from "../../server/runner";

const tmp = mkdtempSync(join(tmpdir(), "aska-editor-test-"));
const base = { cliPath: "/cli/persona.mjs", cwd: "/work", args: ["list", "--json"] };

interface Seen { args?: string[]; file?: string; body?: string }
function fake(result: Partial<RunResult>, seen: Seen = {}): Runner {
  return async ({ args }) => {
    seen.args = args;
    const i = args.indexOf("--file");
    if (i >= 0) {
      seen.file = args[i + 1];
      seen.body = readFileSync(args[i + 1]!, "utf8");
    }
    return { code: 0, stdout: "{}", stderr: "", timedOut: false, ...result };
  };
}
const deps = (runner: Runner, logged: string[] = []): CallDeps => ({ runner, tmpDir: tmp, log: (m) => logged.push(m) });

describe("callAska", () => {
  it("runs the CLI with its args and --cwd", async () => {
    const seen: Seen = {};
    await callAska(deps(fake({ stdout: '{"units":[]}' }, seen)), base);
    expect(seen.args).toEqual(["/cli/persona.mjs", "list", "--json", "--cwd", "/work"]);
  });

  it("writes a body to a temp file, passes it with --file, and deletes it afterwards", async () => {
    const seen: Seen = {};
    await callAska(deps(fake({}, seen)), { ...base, args: ["patch", "unit", "a", "--json"], body: '{"set":{}}' });
    expect(seen.body).toBe('{"set":{}}');
    expect(seen.file!.startsWith(tmp)).toBe(true);
    expect(seen.args!.slice(-4)).toEqual(["--file", seen.file, "--cwd", "/work"]);
    expect(existsSync(seen.file!)).toBe(false);
  });

  it("deletes the temp file when the CLI fails too", async () => {
    const seen: Seen = {};
    await expect(callAska(deps(fake({ code: 2, stdout: "usage" }, seen)), { ...base, body: "x" })).rejects.toThrow(AskaError);
    expect(existsSync(seen.file!)).toBe(false);
  });

  it("returns parsed JSON on exit 0 and exit 1", async () => {
    expect(await callAska(deps(fake({ code: 0, stdout: '{"a":1}' })), base)).toEqual({ a: 1 });
    expect(await callAska(deps(fake({ code: 1, stdout: '{"written":false}' })), base)).toEqual({ written: false });
  });

  it("throws and logs an unexpected error on exit 2, with the output tail", async () => {
    const logged: string[] = [];
    const err = await callAska(deps(fake({ code: 2, stdout: "unknown flag --nope" }), logged), base).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AskaError);
    expect((err as Error).message).toMatch(/^Unexpected error: aska exited with code 2/);
    expect((err as Error).message).toContain("unknown flag --nope");
    expect(logged).toEqual([(err as Error).message]);
  });

  it("keeps only the last 2000 characters of a long stderr", async () => {
    const err = (await callAska(deps(fake({ code: 2, stderr: `${"x".repeat(5000)}END` })), base).catch((e: unknown) => e)) as Error;
    expect(err.message.endsWith("END")).toBe(true);
    expect(err.message.length).toBeLessThan(2100);
  });

  it("throws on a timeout, a spawn failure, and output that isn't JSON", async () => {
    await expect(callAska(deps(fake({ code: null, timedOut: true })), base)).rejects.toThrow(/timed out after 15s/);
    await expect(callAska(deps(fake({ code: null, spawnError: "spawn ENOENT" })), base)).rejects.toThrow(/couldn't start aska: spawn ENOENT/);
    await expect(callAska(deps(fake({ code: 0, stdout: "not json" })), base)).rejects.toThrow(/isn't JSON/);
  });
});
