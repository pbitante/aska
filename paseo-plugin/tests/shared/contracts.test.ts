import { describe, expect, it } from "vitest";
import { runActivityRpc } from "../../shared/activity";
import { catalogListRpc, fileDeleteRpc, filePatchRpc, fileSaveRpc, fileShowRpc } from "../../shared/rpc";

const HASH = "a".repeat(64);

describe("RPC contracts", () => {
  it("rejects a plugin scope on every write", () => {
    const patch = { kind: "unit", name: "a", patch: {}, expectHash: "none" };
    expect(filePatchRpc.input.safeParse({ ...patch, scope: "plugin" }).success).toBe(false);
    expect(filePatchRpc.input.safeParse({ ...patch, scope: "user" }).success).toBe(true);
    expect(fileSaveRpc.input.safeParse({ kind: "unit", name: "a", scope: "plugin", markdown: "x", expectHash: HASH }).success).toBe(false);
    expect(fileDeleteRpc.input.safeParse({ kind: "unit", name: "a", scope: "plugin", force: false }).success).toBe(false);
  });

  it("accepts a plugin scope and a canonical name on show", () => {
    expect(fileShowRpc.input.safeParse({ kind: "persona", name: "aska:guardian", scope: "plugin" }).success).toBe(true);
    expect(fileShowRpc.input.safeParse({ kind: "persona", name: "guardian" }).success).toBe(true);
  });

  it("rejects names that could be read as flags, paths or free text", () => {
    for (const name of ["--force", "../x", "My Persona", "", "a/b"]) {
      expect(fileShowRpc.input.safeParse({ kind: "unit", name }).success, name).toBe(false);
    }
    expect(filePatchRpc.input.safeParse({ kind: "unit", name: "aska:x", scope: "user", patch: {}, expectHash: "none" }).success).toBe(false);
  });

  it("accepts only a sha256 or none as expectHash", () => {
    const base = { kind: "unit", name: "a", scope: "user", patch: {} };
    expect(filePatchRpc.input.safeParse({ ...base, expectHash: HASH }).success).toBe(true);
    expect(filePatchRpc.input.safeParse({ ...base, expectHash: "none" }).success).toBe(true);
    expect(filePatchRpc.input.safeParse({ ...base, expectHash: "stale" }).success).toBe(false);
  });

  it("parses list --json output and keeps fields it doesn't know", () => {
    const out = catalogListRpc.output.parse({
      units: [{ canonical: "aska:security", name: "security", scope: "plugin", plugin: "aska", path: "/x", description: "d", shadowedBy: null, valid: true, errorCount: 0, threshold: "low", appliesWhen: null, extra: 1 }],
      personas: [],
      panels: [],
    });
    expect(out.units[0]).toMatchObject({ extra: 1 });
    expect(out.warnings).toEqual([]);
  });

  it("parses a show result that is only diagnostics (an unknown name)", () => {
    const out = fileShowRpc.output.parse({ diagnostics: [{ level: "error", code: "E_UNKNOWN_REF", message: "m", file: null, line: null, fix: "f" }] });
    expect(out.hash).toBeUndefined();
    expect(out.diagnostics[0]?.code).toBe("E_UNKNOWN_REF");
  });

  it("parses delete output with dependents", () => {
    const out = fileDeleteRpc.output.parse({ deleted: false, path: "/p", dependents: [{ kind: "panel", name: "duo", path: "/d", message: "m" }], diagnostics: [] });
    expect(out.dependents).toHaveLength(1);
  });
});

describe("run.activity", () => {
  it("takes an agent id and an optional non-negative integer cursor", () => {
    expect(runActivityRpc.input.safeParse({ agentId: "a" }).success).toBe(true);
    expect(runActivityRpc.input.safeParse({ agentId: "a", since: 3 }).success).toBe(true);
    expect(runActivityRpc.input.safeParse({ agentId: "" }).success).toBe(false);
    expect(runActivityRpc.input.safeParse({ agentId: "a", since: -1 }).success).toBe(false);
    expect(runActivityRpc.name).toBe("run.activity");
  });
});
