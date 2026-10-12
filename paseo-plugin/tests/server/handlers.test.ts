import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AskaError, type CallOptions } from "../../server/aska";
import { chooseCwd, NO_PROJECT_DIR, type WorkspaceLookup } from "../../server/cwd";
import { createHandlers } from "../../server/handlers";
import type { AskaStatus } from "../../shared/schemas";

const OK: AskaStatus = { ok: true, version: "0.3.0", cliPath: "/cli/persona.mjs" };
const WRITE = { written: true, path: "/p", hash: "h", diagnostics: [] };
const paseo: WorkspaceLookup = { workspaces: { ref: () => ({ refresh: async () => null }) } };
const ctx = { paseo };

function setup(response: unknown = WRITE, status: AskaStatus = OK, exists = true) {
  const calls: CallOptions[] = [];
  let invalidated = 0;
  const h = createHandlers({
    status: async () => status,
    invalidate: () => { invalidated++; },
    exists: () => exists,
    cwd: async (workspaceId) => (workspaceId ? `/ws/${workspaceId}` : "/tmp/aska-editor-noproject"),
    call: async (opts) => {
      calls.push(opts);
      if (response instanceof Error) throw response;
      return response;
    },
  });
  return { h, calls, invalidated: () => invalidated };
}

describe("handlers build the CLI arguments", () => {
  it("list", async () => {
    const { h, calls } = setup({ units: [], personas: [], panels: [], warnings: [] });
    await h.list({ workspaceId: "w1" }, ctx);
    expect(calls[0]).toEqual({ cliPath: "/cli/persona.mjs", cwd: "/ws/w1", args: ["list", "--json"] });
  });

  it("show, with and without a scope", async () => {
    const { h, calls } = setup({ diagnostics: [] });
    await h.show({ kind: "persona", name: "aska:guardian", scope: "plugin" }, ctx);
    await h.show({ kind: "unit", name: "security" }, ctx);
    expect(calls[0]!.args).toEqual(["show", "persona", "aska:guardian", "--scope", "plugin", "--json"]);
    expect(calls[0]!.cwd).toBe("/tmp/aska-editor-noproject");
    expect(calls[1]!.args).toEqual(["show", "unit", "security", "--json"]);
  });

  it("patch sends the patch as the body", async () => {
    const { h, calls } = setup();
    const patch = { set: { description: "D" }, unset: ["applies_when"] };
    await h.patch({ workspaceId: "w1", kind: "unit", name: "a", scope: "project", patch, expectHash: "none" }, ctx);
    expect(calls[0]!.args).toEqual(["patch", "unit", "a", "--scope", "project", "--expect-hash", "none", "--json"]);
    expect(JSON.parse(calls[0]!.body!)).toEqual(patch);
  });

  it("save sends the markdown as the body", async () => {
    const { h, calls } = setup();
    const hash = "b".repeat(64);
    await h.save({ kind: "panel", name: "duo", scope: "user", markdown: "---\nname: duo\n---\n", expectHash: hash }, ctx);
    expect(calls[0]!.args).toEqual(["save", "panel", "duo", "--scope", "user", "--expect-hash", hash, "--json"]);
    expect(calls[0]!.body).toBe("---\nname: duo\n---\n");
  });

  it("delete, with and without --force", async () => {
    const { h, calls } = setup({ deleted: true, path: "/p", dependents: [], diagnostics: [] });
    await h.remove({ kind: "unit", name: "a", scope: "user", force: false }, ctx);
    await h.remove({ kind: "unit", name: "a", scope: "user", force: true }, ctx);
    expect(calls[0]!.args).toEqual(["delete", "unit", "a", "--scope", "user", "--json"]);
    expect(calls[1]!.args).toEqual(["delete", "unit", "a", "--scope", "user", "--force", "--json"]);
  });
});

describe("handler failures", () => {
  it("refuses to run without a usable aska", async () => {
    const { h, calls } = setup(WRITE, { ok: false, reason: "aska 0.2.0 found; 0.3.0 or newer is needed" });
    await expect(h.list({}, ctx)).rejects.toThrow(/aska ≥ 0\.3\.0 not found: aska 0\.2\.0 found/);
    expect(calls).toHaveLength(0);
  });

  it("passes exit-1 results through as data", async () => {
    const refused = { written: false, path: "/p", hash: null, diagnostics: [{ level: "error", code: "E_STALE", message: "changed", file: "/p", line: 1, fix: "Reload" }] };
    const { h } = setup(refused);
    expect(await h.patch({ kind: "unit", name: "a", scope: "user", patch: {}, expectHash: "none" }, ctx)).toMatchObject({ written: false });
  });

  it("clears the cached aska when its CLI file has gone", async () => {
    const gone = setup(new AskaError("Unexpected error: boom"), OK, false);
    await expect(gone.h.list({}, ctx)).rejects.toThrow(/boom/);
    expect(gone.invalidated()).toBe(1);
    const still = setup(new AskaError("Unexpected error: boom"), OK, true);
    await expect(still.h.list({}, ctx)).rejects.toThrow(/boom/);
    expect(still.invalidated()).toBe(0);
  });

  it("turns output that breaks the contract into one unexpected error", async () => {
    const { h } = setup({ written: "yes" });
    await expect(h.save({ kind: "unit", name: "a", scope: "user", markdown: "x", expectHash: "none" }, ctx)).rejects.toThrow(/^Unexpected error: aska's save output didn't match/);
  });
});

describe("chooseCwd", () => {
  it("uses a plugin-owned empty folder without a workspace", async () => {
    const made: string[] = [];
    const dir = await chooseCwd(undefined, { tmpDir: "/tmp", ensureDir: async (p) => { made.push(p); }, workspaceDirectory: async () => "/never" });
    expect(dir).toBe(join("/tmp", NO_PROJECT_DIR));
    expect(made).toEqual([dir]);
  });

  it("uses the workspace's directory", async () => {
    const dir = await chooseCwd("w1", { tmpDir: "/tmp", ensureDir: async () => {}, workspaceDirectory: async (id) => `/repo/${id}` });
    expect(dir).toBe("/repo/w1");
  });

  it("fails clearly for a workspace with no directory, instead of falling back to the home folder", async () => {
    await expect(chooseCwd("w9", { tmpDir: "/tmp", ensureDir: async () => {}, workspaceDirectory: async () => null })).rejects.toThrow(/Workspace w9 has no directory on this host/);
  });
});
