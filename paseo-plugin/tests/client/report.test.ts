import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cellView,
  countsLine,
  fmtElapsed,
  followUpLines,
  gridRows,
  isStaleCall,
  isSuperseded,
  metaPills,
  panelistSections,
  questionFromBrief,
  shortPersona,
  verdictPill,
  verdictPills,
} from "../../client/logic/report";
import { comparisonSchema, panelResultSchema, type Comparison, type PanelResult, type RunMeta } from "../../shared/runs";

const load = (run: string): { c: Comparison; r: PanelResult; brief: string } => {
  const dir = join(__dirname, "../fixtures/runs", run);
  return {
    c: comparisonSchema.parse(JSON.parse(readFileSync(join(dir, "comparison.json"), "utf8"))),
    r: panelResultSchema.parse(JSON.parse(readFileSync(join(dir, "panel-result.json"), "utf8"))),
    brief: readFileSync(join(dir, "brief.md"), "utf8"),
  };
};
const trio = load("plan-trio");
const five = load("code-five");
const pair = load("malformed-pair");

describe("verdicts", () => {
  it("labels and tones each panelist", () => {
    expect(verdictPills(trio.c)).toEqual([
      { persona: "aska:planner", label: "with conditions", tone: "warning" },
      { persona: "aska:guardian", label: "with conditions", tone: "warning" },
      { persona: "aska:accelerator", label: "with conditions", tone: "warning" },
    ]);
    expect(verdictPills(pair.c).map((p) => [p.label, p.tone])).toEqual([["malformed", "error"], ["malformed", "error"]]);
    expect(verdictPill("x", "ok", "proceed")).toEqual({ persona: "x", label: "proceed", tone: "ok" });
    expect(verdictPill("x", "ok", "stop").tone).toBe("error");
    expect(verdictPill("x", "ok", "something-new")).toEqual({ persona: "x", label: "something-new", tone: "muted" });
    expect(verdictPill("x", "timeout", null)).toEqual({ persona: "x", label: "timeout", tone: "error" });
  });
  it("builds pills from archived metadata", () => {
    const meta = { panelists: [{ persona: "aska:guardian", status: "ok", verdict: "proceed" }, { persona: "aska:tester", status: "malformed", verdict: null }] } as RunMeta;
    expect(metaPills(meta).map((p) => p.label)).toEqual(["proceed", "malformed"]);
  });
});

describe("counts and follow-ups", () => {
  it("summarises unit classes, omitting empty ones", () => {
    expect(countsLine(trio.c)).toBe("3 split · 1 single-voice · 4 quiet");
    expect(countsLine(five.c)).toBe("3 split · 2 single-voice · 2 all-flag · 9 quiet");
    expect(countsLine(pair.c)).toBe("no units compared");
  });
  it("numbers follow-ups in compare's order", () => {
    const trioLines = followUpLines(trio.c);
    expect(trioLines.map((l) => l.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(trioLines[0]!.text.startsWith("planner: Check whether")).toBe(true);
    expect(trioLines[0]!.tools).toEqual(["git status", "git log", "git diff"]);
    expect(followUpLines(pair.c)[0]).toEqual({ n: 1, persona: "guardian", text: 'Re-run guardian: 8 violations: persona must be "aska:guardian"', tools: [] });
  });
});

describe("grid", () => {
  it("orders split, then single-voice, then all-flag, and collapses quiet units", () => {
    const g = gridRows(five.c);
    expect(g.rows.map((r) => r.cls)).toEqual(["split", "split", "split", "single-voice", "single-voice", "all-flag", "all-flag"]);
    expect(g.quiet).toHaveLength(9);
    expect(gridRows(trio.c).rows.map((r) => r.cls)).toEqual(["split", "split", "split", "single-voice"]);
  });
  it("renders every cell status", () => {
    const base = { persona: "p", claim: null, why: null };
    expect(cellView({ ...base, tier: "primary", status: "flagged", severity: "high", claim: "c" })).toMatchObject({ label: "P·high", tone: "error", claim: "c" });
    expect(cellView({ ...base, tier: "secondary", status: "flagged", severity: "medium" })).toMatchObject({ label: "S·medium", tone: "warning" });
    expect(cellView({ ...base, tier: "deprioritized", status: "flagged", severity: "low" })).toMatchObject({ label: "D·low", tone: "muted" });
    expect(cellView({ ...base, tier: "primary", status: "cleared", severity: null })).toMatchObject({ label: "cleared", tone: "ok" });
    expect(cellView({ ...base, tier: "primary", status: "not-applicable", severity: null, why: "no UI" })).toMatchObject({ label: "n/a", why: "no UI" });
    expect(cellView({ ...base, tier: "none", status: "not-raised", severity: null })).toMatchObject({ label: "not held", tone: "muted" });
    expect(cellView({ ...base, tier: "secondary", status: "not-raised", severity: null })).toMatchObject({ label: "—" });
  });
});

describe("panelist sections", () => {
  it("uses the comparison's (demoted) status but still shows the judgment", () => {
    const sections = panelistSections(pair.r, pair.r.panelists.map((p) => ({ persona: p.persona, judgment: p.judgment })), pair.c);
    expect(sections[0]).toMatchObject({ persona: "guardian", status: "malformed", reason: '8 violations: persona must be "aska:guardian"', unreadable: false });
    expect(sections[0]!.pill.label).toBe("malformed");
    expect(sections[0]!.findings.length).toBeGreaterThan(0);
  });
  it("shows a timeout with its reason and no judgment, and flags an unreadable judgment", () => {
    const result: PanelResult = {
      question: "q",
      panel: null,
      panelists: [
        { persona: "aska:tester", status: "timeout", reason: "timed out after 10 min" },
        { persona: "aska:guardian", status: "malformed", judgment: "not json at all", violations: ["the judgment must be a JSON object"] },
      ],
    };
    const [timeout, broken] = panelistSections(result, [], null);
    expect(timeout).toMatchObject({ status: "timeout", reason: "timed out after 10 min", findings: [], unreadable: false });
    expect(timeout!.pill).toEqual({ persona: "aska:tester", label: "timeout", tone: "error" });
    expect(broken).toMatchObject({ status: "malformed", violations: ["the judgment must be a JSON object"], unreadable: true });
  });
  it("before a result exists, lists received judgments", () => {
    const sections = panelistSections(null, [{ persona: "aska:guardian", judgment: { verdict: "stop", findings: [] } }], null);
    expect(sections[0]).toMatchObject({ persona: "aska:guardian", status: "received" });
    expect(sections[0]!.pill.label).toBe("received");
  });
});

describe("isSuperseded", () => {
  it("is false while the agent is busy, regardless of the cached call id", () => {
    expect(isSuperseded("old", "new", true)).toBe(false);
    expect(isSuperseded(null, "new", true)).toBe(false);
  });
  it("is false when there's no later report, or it's this one", () => {
    expect(isSuperseded(null, "c1", false)).toBe(false);
    expect(isSuperseded("c1", "c1", false)).toBe(false);
  });
  it("is true once idle and a different report has landed", () => {
    expect(isSuperseded("c2", "c1", false)).toBe(true);
  });
});

describe("isStaleCall", () => {
  it("is stale only when the archive names a different call", () => {
    expect(isStaleCall(null, "c1")).toBe(false);
    expect(isStaleCall("c1", "c1")).toBe(false);
    expect(isStaleCall("c2", "c1")).toBe(true);
  });
  it("is what isSuperseded uses once the agent is idle", () => {
    for (const latest of [null, "c1", "c2"]) expect(isSuperseded(latest, "c1", false)).toBe(isStaleCall(latest, "c1"));
    expect(isSuperseded("c2", "c1", true)).toBe(false);
  });
});

describe("small helpers", () => {
  it("reads the question from a brief", () => {
    expect(questionFromBrief(trio.brief)).toMatch(/^Is tidepool's step 4 offline sync plan ready/);
    expect(questionFromBrief("Question: Ship it?\n")).toBe("Ship it?");
    expect(questionFromBrief("# Brief\nnothing here")).toBeNull();
  });
  it("shortens personas and formats elapsed time", () => {
    expect(shortPersona("aska:guardian")).toBe("guardian");
    expect(shortPersona("guardian")).toBe("guardian");
    expect(fmtElapsed(45_000)).toBe("45s");
    expect(fmtElapsed(72_000)).toBe("1m12s");
    expect(fmtElapsed(3_780_000)).toBe("1h03m");
  });
});
