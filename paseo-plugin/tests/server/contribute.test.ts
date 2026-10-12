import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import contribute from "../../index.server";

const saved = { HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, XDG_DATA_HOME: process.env.XDG_DATA_HOME };
const roots: string[] = [];
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

function fakeServer() {
  const on = new Map<string, (event: unknown, ctx: unknown) => unknown>();
  const server = {
    registerSettings: () => ({ read: async () => ({ status: "ready", revision: "r1", values: { askaCliPath: "" } }) }),
    handle: () => {},
    on: (name: string, fn: (event: unknown, ctx: unknown) => unknown) => void on.set(name, fn),
  };
  return { server: server as never, on };
}

describe("index.server contribute", () => {
  it("returns a cleanup that releases the sub-agent activity subscription", async () => {
    // Keep the startup auto-import inside a throwaway home and temp dir.
    const base = mkdtempSync(join(tmpdir(), "aska-editor-contribute-"));
    roots.push(base);
    Object.assign(process.env, { HOME: base, TMPDIR: base, XDG_DATA_HOME: join(base, "data") });
    const f = fakeServer();
    const cleanup = contribute(f.server);
    let released = 0;
    const paseo = { observeEvents: () => ({ ready: Promise.resolve({}), subscribe: () => () => {}, release: async () => void released++ }) };
    await f.on.get("agent.turn_started")!({}, { paseo });
    await cleanup();
    expect(released).toBe(1);
  });
});
