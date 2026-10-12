import { describe, expect, it } from "vitest";
import { spawnCapture } from "../../server/runner";

describe("spawnCapture", () => {
  it("captures stdout, stderr and the exit code", async () => {
    const r = await spawnCapture(process.execPath, ["-e", "process.stdout.write('out');process.stderr.write('err');process.exit(3)"], 5000);
    expect(r).toEqual({ code: 3, stdout: "out", stderr: "err", timedOut: false });
  });

  it("kills a process that runs past the timeout", async () => {
    const r = await spawnCapture(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], 200);
    expect(r.timedOut).toBe(true);
  });

  it("reports a command that can't start", async () => {
    const r = await spawnCapture("/nonexistent/aska-editor-binary", [], 1000);
    expect(r.code).toBeNull();
    expect(r.spawnError).toMatch(/ENOENT/);
  });

  it("passes extra environment variables", async () => {
    const r = await spawnCapture(process.execPath, ["-e", "process.stdout.write(process.env.ASKA_EDITOR_T ?? '')"], 5000, { ASKA_EDITOR_T: "yes" });
    expect(r.stdout).toBe("yes");
  });
});
