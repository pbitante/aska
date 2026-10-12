import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { briefMaterials, briefRoot, collectEvidence, evidenceRefs, GIT_REFS } from "../../client/logic/flow/evidence";

const dir = (run: string) => join(__dirname, "../fixtures/runs", run);
const brief = (run: string) => readFileSync(join(dir(run), "brief.md"), "utf8");
const judgmentFiles = (run: string) =>
  readdirSync(join(dir(run), "judgments"))
    .sort()
    .map((f) => {
      const judgment = JSON.parse(readFileSync(join(dir(run), "judgments", f), "utf8")) as { persona?: string };
      return { persona: judgment.persona ?? f.replace(/\.json$/, ""), judgment };
    });

describe("evidenceRefs", () => {
  it("pulls paths out of prose and strips line ranges", () => {
    expect(evidenceRefs("src/author/check.ts:52-74 computes `baseline`; see tests/cli/author.test.ts and Plan lines 1716-1740.", null, null)).toEqual([
      "src/author/check.ts",
      "tests/cli/author.test.ts",
    ]);
  });
  it("makes paths relative to the repository root and the run folder", () => {
    expect(evidenceRefs("/home/u/repo/src/a.ts:3 and /tmp/aska-panel-Ab12Cd/commits.txt", "/home/u/repo", "/tmp/aska-panel-Ab12Cd")).toEqual(["src/a.ts", "commits.txt"]);
  });
  it("collapses every git path into one item", () => {
    expect(evidenceRefs(".git/refs/heads/x, /r/.worktrees/w/.git and refs/heads/main", "/r", null)).toEqual([GIT_REFS]);
  });
  it("ignores URLs, bare words and the repository root itself", () => {
    expect(evidenceRefs("https://example.com/a/b, the `baseline` value, /r", "/r", null)).toEqual([]);
  });
});

describe("briefRoot and briefMaterials", () => {
  it("reads the repository root from either brief style", () => {
    expect(briefRoot(brief("plan-trio"))).toBe("/home/u/project/tidepool");
    expect(briefRoot(brief("code-five"))).toBe("/home/u/project/aska");
    expect(briefRoot("no root here")).toBeNull();
    expect(briefRoot(null)).toBeNull();
  });
  it("lists the Materials, relative to the root and the run folder", () => {
    const materials = briefMaterials(brief("code-five"), "/home/u/project/aska", "/tmp/aska-panel-7dXmn9");
    expect(materials.slice(0, 3)).toEqual(["commit.txt", "change.diff", "commits.txt"]);
    expect(materials).toContain("docs/specs/2026-10-09-aska-cli-authoring-design.md");
  });
});

describe("collectEvidence", () => {
  it("puts the cited Materials first, then ranks by how many panelists cite an item (code-five)", () => {
    const set = collectEvidence(judgmentFiles("code-five"), brief("code-five"), "/tmp/aska-panel-7dXmn9");
    expect(set.items.slice(0, 3).map((i) => i.id)).toEqual(["commit.txt", "commits.txt", "commits-before-squash.txt"]);
    expect(set.items.slice(3, 6).map((i) => [i.id, i.citedBy])).toEqual([
      ["src/author/files.ts", ["guardian", "maintainer", "red-team", "tester"]],
      ["tests/cli/author.test.ts", ["guardian", "maintainer", "red-team", "tester"]],
      ["src/author/check.ts", ["guardian", "maintainer", "red-team", "tester"]],
    ]);
    expect(set.items).toHaveLength(39);
    expect(set.items[3]!.label).toBe("files.ts");
    expect(set.items.every((i) => !/:\d/.test(i.id))).toBe(true);
  });
  it("collapses git paths and keeps every file (plan-trio)", () => {
    const set = collectEvidence(judgmentFiles("plan-trio"), brief("plan-trio"), "/tmp/aska-panel-6au0hY");
    expect(set.items[0]).toMatchObject({ id: GIT_REFS, label: GIT_REFS, citedBy: ["accelerator", "guardian", "planner"] });
    expect(set.items).toHaveLength(12);
    expect(set.byPanelist.guardian).toContain(GIT_REFS);
  });
  it("puts the brief's Materials first, in brief order", () => {
    const b = "**Materials** (repository root: /r):\n- /r/b.md\n- /r/a.md\n\n**Panel notes:** none";
    const judgments = [{ persona: "aska:x", judgment: { findings: [{ unit: "u", severity: "low", claim: "c", evidence: "z.ts a.md b.md" }] } }];
    const set = collectEvidence(judgments, b, null);
    expect(set.items.map((i) => i.id)).toEqual(["b.md", "a.md", "z.ts"]);
    expect(set.byPanelist).toEqual({ x: ["b.md", "a.md", "z.ts"] });
  });
  it("keeps every file, with no cap and no overflow count", () => {
    const evidence = Array.from({ length: 40 }, (_, i) => `f${i}.ts`).join(" ");
    const set = collectEvidence([{ persona: "p", judgment: { findings: [{ unit: "u", severity: "low", claim: "c", evidence }] } }], null, null);
    expect(set.items).toHaveLength(40);
    expect(set.byPanelist.p).toHaveLength(40);
    expect("more" in set).toBe(false);
  });
  it("skips judgments that don't parse", () => {
    expect(collectEvidence([{ persona: "p", judgment: "garbage" }], null, null)).toEqual({ items: [], byPanelist: {} });
  });
});
