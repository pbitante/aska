import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RUN_DIR_NAME,
  RUN_ID,
  comparisonSchema,
  digest,
  judgmentSchema,
  panelResultSchema,
  runIdFor,
  runMetaSchema,
  runReportRpc,
} from "../../shared/runs";

const fixturesDir = join(__dirname, "../fixtures/runs");
const fixture = (run: string, file: string) => JSON.parse(readFileSync(join(fixturesDir, run, file), "utf8")) as unknown;

describe("run contracts", () => {
  it("parses real compare output and panel results", () => {
    for (const run of ["malformed-pair", "plan-trio", "code-five"]) {
      expect(comparisonSchema.safeParse(fixture(run, "comparison.json")).success, run).toBe(true);
      expect(panelResultSchema.safeParse(fixture(run, "panel-result.json")).success, run).toBe(true);
    }
  });

  it("keeps a free-text panel name", () => {
    const r = panelResultSchema.parse({ question: "q", panel: "ad-hoc (guardian, accelerator)", panelists: [] });
    expect(r.panel).toBe("ad-hoc (guardian, accelerator)");
  });

  it("needs exactly one of dir or id for run.report", () => {
    expect(runReportRpc.input.safeParse({ dir: "/tmp/aska-panel-Ab12Cd" }).success).toBe(true);
    expect(runReportRpc.input.safeParse({ id: "20261009T201512Z-Ab12Cd" }).success).toBe(true);
    expect(runReportRpc.input.safeParse({}).success).toBe(false);
    expect(runReportRpc.input.safeParse({ dir: "/tmp/x", id: "20261009T201512Z-Ab12Cd" }).success).toBe(false);
    expect(runReportRpc.input.safeParse({ id: "../etc" }).success).toBe(false);
  });

  it("validates run metadata", () => {
    const meta = {
      schemaVersion: 1, id: "20261009T201512Z-Ab12Cd", source: "paseo", tmpDir: "/tmp/aska-panel-Ab12Cd",
      agentId: "a", workspaceId: "w", projectPath: "/repo", question: "q", panel: null,
      panelists: [{ persona: "aska:guardian", status: "ok", verdict: "proceed" }],
      startedAt: "2026-10-09T20:15:12.000Z", comparedAt: null, archivedAt: "2026-10-09T20:16:00.000Z",
      digest: "0123456789abcdef", reportCallId: null, skipped: [],
    };
    expect(runMetaSchema.safeParse(meta).success).toBe(true);
    expect(runMetaSchema.safeParse({ ...meta, schemaVersion: 2 }).success).toBe(false);
  });

  it("parses every fixture judgment", () => {
    for (const run of ["malformed-pair", "plan-trio", "code-five"]) {
      const dir = join(fixturesDir, run, "judgments");
      for (const file of readdirSync(dir)) {
        expect(judgmentSchema.safeParse(fixture(run, join("judgments", file))).success, `${run}/judgments/${file}`).toBe(true);
      }
    }
  });
});

describe("names and ids", () => {
  it("matches run folder names and ids", () => {
    expect(RUN_DIR_NAME.test("aska-panel-Ab12Cd")).toBe(true);
    expect(RUN_DIR_NAME.test("aska-panel-Ab12C")).toBe(false);
    expect(RUN_ID.test("20261009T201512Z-Ab12Cd")).toBe(true);
    expect(RUN_ID.test("2026-10-09-Ab12Cd")).toBe(false);
  });

  it("builds an id from the start time and the folder's last six characters", () => {
    expect(runIdFor(new Date("2026-10-09T20:15:12.345Z"), "aska-panel-Ab12Cd")).toBe("20261009T201512Z-Ab12Cd");
    expect(runIdFor(new Date("2026-01-02T03:04:05.000Z"), "20261009T201512Z-Zz99Yy")).toBe("20260102T030405Z-Zz99Yy");
  });
});

describe("digest", () => {
  it("starts with the standard 32-bit FNV-1a value and is 16 hex chars", () => {
    expect(digest("").slice(0, 8)).toBe("811c9dc5");
    expect(digest("a").slice(0, 8)).toBe("e40c292c");
    expect(digest("foobar").slice(0, 8)).toBe("bf9cf968");
    expect(digest("anything")).toMatch(/^[0-9a-f]{16}$/);
  });
  it("is stable and tells texts apart", () => {
    expect(digest("same")).toBe(digest("same"));
    expect(digest("a")).not.toBe(digest("b"));
  });
});
