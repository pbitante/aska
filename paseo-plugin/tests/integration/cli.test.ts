import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { callAska } from "../../server/aska";
import { chooseCwd, type WorkspaceLookup } from "../../server/cwd";
import { createHandlers } from "../../server/handlers";
import { nodeRunner } from "../../server/runner";
import { status } from "./aska-cli";

if (!status.ok) console.warn(`Skipping the aska CLI integration test: ${status.reason}.`);

const project = mkdtempSync(join(tmpdir(), "aska-editor-it-"));
mkdirSync(join(project, ".claude"));
const personasDir = join(project, ".claude", "personas");
afterAll(() => rmSync(project, { recursive: true, force: true }));

const handlers = createHandlers({
  status: async () => status,
  invalidate: () => {},
  exists: existsSync,
  cwd: (workspaceId, paseo) =>
    chooseCwd(workspaceId, {
      tmpDir: tmpdir(),
      ensureDir: async (p) => {
        await mkdir(p, { recursive: true });
      },
      workspaceDirectory: async (id) => (await paseo.workspaces.ref(id).refresh())?.workspaceDirectory ?? null,
    }),
  call: (opts) => callAska({ runner: nodeRunner, tmpDir: tmpdir() }, opts),
});
const paseo: WorkspaceLookup = { workspaces: { ref: () => ({ refresh: async () => ({ workspaceDirectory: project }) }) } };
const ctx = { paseo };
const ws = { workspaceId: "it" };
const codes = (ds: readonly { code: string }[]) => ds.map((d) => d.code);

describe.skipIf(!status.ok)(`real aska CLI (${status.ok ? `aska ${status.version}` : `skipped: ${status.reason}`})`, () => {
  it("creates a unit, two personas and a panel in the project scope", async () => {
    const unit = await handlers.patch({
      ...ws,
      kind: "unit",
      name: "zzit-unit",
      scope: "project",
      expectHash: "none",
      patch: {
        set: { description: "Does the integration test pass?", applies_when: "Always.", threshold: "high" },
        sections: { "Looks for": "Passing tests.", Questions: "- Did it pass?", "Red flags": "- It failed", "Good looks like": "Green." },
      },
    }, ctx);
    expect(unit.written, JSON.stringify(unit.diagnostics)).toBe(true);
    for (const name of ["zzit-alpha", "zzit-beta"]) {
      const persona = await handlers.patch({
        ...ws,
        kind: "persona",
        name,
        scope: "project",
        expectHash: "none",
        patch: { set: { description: `${name} reviews.`, "units.primary": [{ ref: "zzit-unit" }] }, sections: { Stance: "Careful.", "Tie-breaking": "The unit wins." } },
      }, ctx);
      expect(persona.written, JSON.stringify(persona.diagnostics)).toBe(true);
    }
    const panel = await handlers.patch({
      ...ws,
      kind: "panel",
      name: "zzit-panel",
      scope: "project",
      expectHash: "none",
      patch: { set: { description: "Two reviewers.", personas: ["zzit-alpha", "zzit-beta"] } },
    }, ctx);
    expect(panel.written, JSON.stringify(panel.diagnostics)).toBe(true);
    expect(existsSync(join(personasDir, "zzit-panel.panel.md"))).toBe(true);

    const listing = await handlers.list(ws, ctx);
    expect(listing.units.some((u) => u.canonical === "zzit-unit" && u.scope === "project")).toBe(true);
  });

  it("never overwrites on creation", async () => {
    const again = await handlers.patch({ ...ws, kind: "unit", name: "zzit-unit", scope: "project", expectHash: "none", patch: { set: { description: "Clobber." } } }, ctx);
    expect(again.written).toBe(false);
    expect(codes(again.diagnostics)).toContain("E_STALE");
  });

  it("patches with the shown hash, then refuses the old hash with E_STALE", async () => {
    const shown = await handlers.show({ ...ws, kind: "persona", name: "zzit-alpha", scope: "project" }, ctx);
    expect(shown.hash).toMatch(/^[0-9a-f]{64}$/);
    const ok = await handlers.patch({ ...ws, kind: "persona", name: "zzit-alpha", scope: "project", expectHash: shown.hash!, patch: { set: { description: "Changed." } } }, ctx);
    expect(ok.written, JSON.stringify(ok.diagnostics)).toBe(true);
    expect(ok.hash).not.toBe(shown.hash);
    const stale = await handlers.patch({ ...ws, kind: "persona", name: "zzit-alpha", scope: "project", expectHash: shown.hash!, patch: { set: { description: "Again." } } }, ctx);
    expect(stale.written).toBe(false);
    expect(codes(stale.diagnostics)).toContain("E_STALE");
  });

  it("saves raw markdown, and refuses a raw save that breaks a reference", async () => {
    const shown = await handlers.show({ ...ws, kind: "unit", name: "zzit-unit", scope: "project" }, ctx);
    const markdown = shown.raw!.replace("Does the integration test pass?", "Does it still pass?");
    const saved = await handlers.save({ ...ws, kind: "unit", name: "zzit-unit", scope: "project", markdown, expectHash: shown.hash! }, ctx);
    expect(saved.written, JSON.stringify(saved.diagnostics)).toBe(true);
    expect(readFileSync(join(personasDir, "zzit-unit.unit.md"), "utf8")).toContain("Does it still pass?");

    const beta = await handlers.show({ ...ws, kind: "persona", name: "zzit-beta", scope: "project" }, ctx);
    const broken = beta.raw!.replace("zzit-unit", "zzit-no-such-unit");
    const refused = await handlers.save({ ...ws, kind: "persona", name: "zzit-beta", scope: "project", markdown: broken, expectHash: beta.hash! }, ctx);
    expect(refused.written).toBe(false);
    expect(readFileSync(join(personasDir, "zzit-beta.persona.md"), "utf8")).toBe(beta.raw);
  });

  it("customizes a persona by patching extends on creation", async () => {
    const created = await handlers.patch(
      { ...ws, kind: "persona", name: "zzit-gamma", scope: "project", expectHash: "none", patch: { set: { extends: "zzit-beta" } } },
      ctx,
    );
    expect(created.written, JSON.stringify(created.diagnostics)).toBe(true);

    const shown = await handlers.show({ ...ws, kind: "persona", name: "zzit-gamma", scope: "project" }, ctx);
    expect(shown.fields?.extends).toBe("zzit-beta");

    const listing = await handlers.list(ws, ctx);
    const row = listing.personas.find((p) => p.name === "zzit-gamma" && p.scope === "project");
    expect(row?.extends).toBe("zzit-beta");
  });

  it("shows an unknown name as diagnostics, not an error", async () => {
    const missing = await handlers.show({ ...ws, kind: "unit", name: "zzit-missing" }, ctx);
    expect(missing.hash).toBeUndefined();
    expect(codes(missing.diagnostics)).toContain("E_UNKNOWN_REF");
  });

  it("refuses to delete a persona a panel seats, then deletes it with force", async () => {
    const refused = await handlers.remove({ ...ws, kind: "persona", name: "zzit-alpha", scope: "project", force: false }, ctx);
    expect(refused.deleted).toBe(false);
    expect(refused.dependents.map((d) => d.name)).toContain("zzit-panel");
    expect(existsSync(join(personasDir, "zzit-alpha.persona.md"))).toBe(true);
    const forced = await handlers.remove({ ...ws, kind: "persona", name: "zzit-alpha", scope: "project", force: true }, ctx);
    expect(forced.deleted).toBe(true);
    expect(existsSync(join(personasDir, "zzit-alpha.persona.md"))).toBe(false);
  });
});
