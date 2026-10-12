import { describe, expect, it } from "vitest";
import { AskaLocator, compareVersions, locateAska, type LocateDeps } from "../../server/locate";
import type { AskaStatus } from "../../shared/schemas";

const ROOT = "/plugins/aska/0.3.0";
const CLI = `${ROOT}/skills/operator/scripts/persona.mjs`;
const OLD = "/plugins/aska/0.2.0";

function deps(over: Partial<LocateDeps> = {}): LocateDeps {
  return {
    settingPath: "",
    home: "/home/u",
    pluginList: async () => JSON.stringify([{ id: "aska@aska", enabled: true, installPath: ROOT }]),
    readManifest: async (root) =>
      root === ROOT ? JSON.stringify({ name: "aska", version: "0.3.0" }) : root === OLD ? JSON.stringify({ version: "0.2.0" }) : undefined,
    exists: async (p) => p === CLI || p === `${OLD}/skills/operator/scripts/persona.mjs`,
    ...over,
  };
}

describe("locateAska", () => {
  it("finds the enabled aska plugin and its version", async () => {
    expect(await locateAska(deps())).toEqual({ ok: true, version: "0.3.0", cliPath: CLI });
  });

  it("reports aska missing from claude plugin list", async () => {
    const s = await locateAska(deps({ pluginList: async () => "[]" }));
    expect(s.ok).toBe(false);
    expect(s.reason).toMatch(/isn't installed/);
  });

  it("reports a disabled aska", async () => {
    const s = await locateAska(deps({ pluginList: async () => JSON.stringify([{ id: "aska@m", enabled: false, installPath: ROOT }]) }));
    expect(s).toMatchObject({ ok: false });
    expect(s.reason).toMatch(/disabled/);
  });

  it("refuses an aska older than 0.3.0", async () => {
    const s = await locateAska(deps({ pluginList: async () => JSON.stringify([{ id: "aska@m", enabled: true, installPath: OLD }]) }));
    expect(s).toMatchObject({ ok: false, version: "0.2.0" });
    expect(s.reason).toMatch(/0\.2\.0.*0\.3\.0/);
  });

  it("prefers the newest of several enabled installs", async () => {
    const list = JSON.stringify([
      { id: "aska@old", enabled: true, installPath: OLD },
      { id: "aska@new", enabled: true, installPath: ROOT },
    ]);
    expect(await locateAska(deps({ pluginList: async () => list }))).toEqual({ ok: true, version: "0.3.0", cliPath: CLI });
  });

  it("finds aska from the aska marketplace while the old claude-personas install is disabled", async () => {
    const list = JSON.stringify([
      { id: "aska@claude-personas", enabled: false, installPath: OLD },
      { id: "aska@aska", enabled: true, installPath: ROOT },
    ]);
    expect(await locateAska(deps({ pluginList: async () => list }))).toEqual({ ok: true, version: "0.3.0", cliPath: CLI });
  });

  it("prefers the newer of aska@claude-personas and aska@aska when both are enabled", async () => {
    const list = JSON.stringify([
      { id: "aska@aska", enabled: true, installPath: ROOT },
      { id: "aska@claude-personas", enabled: true, installPath: OLD },
    ]);
    expect(await locateAska(deps({ pluginList: async () => list }))).toEqual({ ok: true, version: "0.3.0", cliPath: CLI });
  });

  it("explains a failing or garbled claude plugin list", async () => {
    const failed = await locateAska(deps({ pluginList: async () => { throw new Error("spawn claude ENOENT"); } }));
    expect(failed.reason).toMatch(/claude plugin list.*ENOENT/);
    const garbled = await locateAska(deps({ pluginList: async () => "Welcome!" }));
    expect(garbled.reason).toMatch(/isn't JSON/);
  });

  it("uses the askaCliPath setting first, expanding ~", async () => {
    const cli = "/home/u/dev/aska/skills/operator/scripts/persona.mjs";
    const s = await locateAska(deps({
      settingPath: "~/dev/aska/skills/operator/scripts/persona.mjs",
      pluginList: async () => { throw new Error("must not run"); },
      exists: async (p) => p === cli,
      readManifest: async (root) => (root === "/home/u/dev/aska" ? JSON.stringify({ version: "0.3.1" }) : undefined),
    }));
    expect(s).toEqual({ ok: true, version: "0.3.1", cliPath: cli });
  });

  it("reports a setting that points nowhere", async () => {
    const s = await locateAska(deps({ settingPath: "/nope/persona.mjs" }));
    expect(s.ok).toBe(false);
    expect(s.reason).toMatch(/not found at \/nope\/persona\.mjs/);
  });

  it("reports an unreadable version", async () => {
    const s = await locateAska(deps({ readManifest: async () => "{" }));
    expect(s.ok).toBe(false);
    expect(s.reason).toMatch(/version/);
  });
});

describe("compareVersions", () => {
  it("compares numerically and ignores pre-release tags", () => {
    expect(compareVersions("0.10.0", "0.3.0")).toBeGreaterThan(0);
    expect(compareVersions("0.3.0", "0.3.0")).toBe(0);
    expect(compareVersions("0.2.9", "0.3.0")).toBeLessThan(0);
    expect(compareVersions("0.3.0-beta.1", "0.3.0")).toBe(0);
    expect(compareVersions("1", "0.9.9")).toBeGreaterThan(0);
  });
});

describe("AskaLocator", () => {
  it("caches a found aska per settings revision, never a failure, and can be cleared", async () => {
    let revision = "r1";
    let result: AskaStatus = { ok: true, version: "0.3.0", cliPath: CLI };
    let runs = 0;
    const locator = new AskaLocator(async () => ({ revision, settingPath: "" }), async () => { runs++; return result; });
    await locator.get();
    await locator.get();
    expect(runs).toBe(1);
    revision = "r2";
    await locator.get();
    expect(runs).toBe(2);
    locator.invalidate();
    await locator.get();
    expect(runs).toBe(3);
    result = { ok: false, reason: "gone" };
    locator.invalidate();
    await locator.get();
    await locator.get();
    expect(runs).toBe(5);
  });
});
