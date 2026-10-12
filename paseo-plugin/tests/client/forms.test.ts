import { describe, expect, it } from "vitest";
import {
  advancedChips,
  buildPatch,
  emptyForm,
  formatBullets,
  formFromShow,
  inheritedFor,
  inheritedUnits,
  isEmptyPatch,
  parseBullets,
  sameRef,
  sectionHeadingProblem,
  tierEntriesOf,
  type PanelForm,
  type PersonaForm,
  type UnitForm,
} from "../../client/logic/forms";

const unitShown = {
  fields: { name: "security", description: "Can input hurt?", applies_when: "Handles input.", threshold: "low" },
  sections: {
    "Looks for": "Untrusted input.",
    Questions: "- Which inputs?\n- Who can reach this?",
    "Red flags": "Watch for these:\n- Concatenated queries",
    "Good looks like": "Validated at the boundary.",
  },
};

describe("bullets", () => {
  it("parses a plain bulleted list", () => {
    expect(parseBullets("- a\n- b")).toEqual(["a", "b"]);
    expect(parseBullets("* a\n\n* b")).toEqual(["a", "b"]);
    expect(parseBullets("")).toEqual([]);
  });
  it("refuses anything that isn't only bullets", () => {
    expect(parseBullets("Intro\n- a")).toBeNull();
    expect(parseBullets("- a\n  continued")).toBeNull();
  });
  it("formats items, dropping blanks", () => {
    expect(formatBullets(["a", "  ", " b "])).toBe("- a\n- b");
  });
});

describe("tierEntriesOf", () => {
  it("normalises both written shapes and drops settings the form doesn't own", () => {
    expect(tierEntriesOf(["aska:a", { "aska:b": { threshold: "low" } }, { c: { note: "n", add_questions: ["q"] } }, { d: null }])).toEqual([
      { ref: "aska:a" },
      { ref: "aska:b", threshold: "low" },
      { ref: "c", note: "n" },
      { ref: "d" },
    ]);
    expect(tierEntriesOf(undefined)).toEqual([]);
    expect(tierEntriesOf([{ x: { threshold: "severe" } }])).toEqual([{ ref: "x" }]);
  });
});

describe("formFromShow", () => {
  it("loads a unit; a mixed section becomes text", () => {
    const f = formFromShow("unit", unitShown) as UnitForm;
    expect(f).toMatchObject({ kind: "unit", description: "Can input hurt?", appliesWhen: "Handles input.", threshold: "low" });
    expect(f.questions).toEqual({ mode: "list", items: ["Which inputs?", "Who can reach this?"] });
    expect(f.redFlags).toEqual({ mode: "text", text: "Watch for these:\n- Concatenated queries" });
  });
  it("loads a panel and its notes", () => {
    const f = formFromShow("panel", { fields: { description: "D", personas: ["aska:a", "b"] }, sections: { "": "Notes." } });
    expect(f).toEqual({ kind: "panel", description: "D", personas: ["aska:a", "b"], notes: "Notes." });
  });
  it("loads a child persona", () => {
    const f = formFromShow("persona", { fields: { extends: "aska:guardian", units: { secondary: ["x"] } }, sections: {} }) as PersonaForm;
    expect(f.extends).toBe("aska:guardian");
    expect(f.tiers).toEqual({ primary: [], secondary: [{ ref: "x" }], deprioritized: [] });
  });
  it("has empty forms that match the CLI's creation templates", () => {
    expect(emptyForm("unit")).toMatchObject({ threshold: "medium", questions: { mode: "list", items: [] } });
    expect(emptyForm("persona")).toMatchObject({ extends: null, tiers: { primary: [], secondary: [], deprioritized: [] } });
  });
});

describe("buildPatch: units", () => {
  const initial = formFromShow("unit", unitShown) as UnitForm;
  it("is empty when nothing changed", () => {
    expect(isEmptyPatch(buildPatch(initial, initial))).toBe(true);
  });
  it("sets changed fields, unsets an emptied optional field, and replaces only edited sections", () => {
    const edited: UnitForm = {
      ...initial,
      description: " New description ",
      appliesWhen: "  ",
      questions: { mode: "list", items: ["Which inputs?", "Who can reach this?", "What leaks?"] },
    };
    expect(buildPatch(initial, edited)).toEqual({
      set: { description: "New description" },
      unset: ["applies_when"],
      sections: { Questions: "- Which inputs?\n- Who can reach this?\n- What leaks?" },
    });
  });
  it("never sends an untouched text-mode section", () => {
    const edited: UnitForm = { ...initial, threshold: "high" };
    expect(buildPatch(initial, edited)).toEqual({ set: { threshold: "high" } });
  });
  it("sends everything filled in when creating", () => {
    const created: UnitForm = { ...(emptyForm("unit") as UnitForm), description: "D", looksFor: "L" };
    expect(buildPatch(emptyForm("unit"), created)).toEqual({ set: { description: "D" }, sections: { "Looks for": "L" } });
  });
});

describe("buildPatch: panels", () => {
  it("sends the persona order and notes", () => {
    const initial: PanelForm = { kind: "panel", description: "D", personas: ["a", "b"], notes: "" };
    expect(buildPatch(initial, { ...initial, personas: ["b", "a"], notes: "Hi" })).toEqual({ set: { personas: ["b", "a"] }, sections: { "": "Hi" } });
  });
});

describe("buildPatch: personas", () => {
  const root: PersonaForm = {
    kind: "persona",
    description: "D",
    extends: null,
    tiers: { primary: [{ ref: "a" }, { ref: "b", threshold: "low" }], secondary: [{ ref: "c" }], deprioritized: [{ ref: "d", note: "rarely" }] },
    stance: "S",
    tieBreaking: "T",
  };
  it("leaves untouched tiers out, so the CLI keeps their extra keys", () => {
    const edited: PersonaForm = { ...root, stance: "New stance" };
    expect(buildPatch(root, edited)).toEqual({ sections: { Stance: "New stance" } });
  });
  it("replaces an edited tier, keeping notes only on deprioritized and dropping blank picks", () => {
    const edited: PersonaForm = {
      ...root,
      tiers: {
        ...root.tiers,
        primary: [{ ref: "b", threshold: "low", note: "ignored" }, { ref: "a" }, { ref: "" }],
        deprioritized: [{ ref: "d", note: "never" }],
      },
    };
    expect(buildPatch(root, edited)).toEqual({
      set: { "units.primary": [{ ref: "b", threshold: "low" }, { ref: "a" }], "units.deprioritized": [{ ref: "d", note: "never" }] },
    });
  });
  it("unsets an emptied secondary tier, and sets an emptied root primary to []", () => {
    const edited: PersonaForm = { ...root, tiers: { ...root.tiers, primary: [], secondary: [] } };
    expect(buildPatch(root, edited)).toEqual({ set: { "units.primary": [] }, unset: ["units.secondary"] });
  });
  it("unsets an emptied primary on a child", () => {
    const child: PersonaForm = { ...root, extends: "aska:x" };
    expect(buildPatch(child, { ...child, tiers: { ...child.tiers, primary: [] } })).toEqual({ unset: ["units.primary"] });
  });
});

describe("advancedChips", () => {
  it("names what only the raw editor can change", () => {
    const fields = {
      name: "g",
      extends: "aska:guardian",
      overrides: [{}, {}],
      capabilities: ["x"],
      units: { primary: [{ a: { add_questions: ["q"] } }, "b"], exclude: ["c"] },
    };
    const sections = { Stance: "s", "Tie-breaking": "t", "Judgment notes": "j" };
    expect(advancedChips("persona", fields, sections)).toEqual([
      "extends aska:guardian",
      "2 overrides",
      "capabilities",
      "units.exclude",
      "1 unit with extra settings",
      "1 other section",
    ]);
  });
  it("is empty for a plain unit", () => {
    expect(advancedChips("unit", unitShown.fields, unitShown.sections)).toEqual([]);
  });
});

describe("inherited units", () => {
  it("matches bare and namespaced refs", () => {
    expect(sameRef("x", "aska:x")).toBe(true);
    expect(sameRef("aska:x", "x")).toBe(true);
    expect(sameRef("aska:x", "other:x")).toBe(false);
  });
  it("lists resolved units the file doesn't name itself", () => {
    const brief = (canonical: string) => ({ canonical, description: "", threshold: "medium" });
    const resolved = { primary: [brief("aska:a"), brief("aska:b")], secondary: [brief("aska:c")], deprioritized: [] };
    const tiers = { primary: [{ ref: "a" }], secondary: [], deprioritized: [] };
    expect(inheritedUnits(resolved, tiers)).toEqual({ primary: [brief("aska:b")], secondary: [brief("aska:c")], deprioritized: [] });
    expect(inheritedUnits(null, tiers)).toEqual({ primary: [], secondary: [], deprioritized: [] });
  });
});

describe("inheritedFor", () => {
  const brief = (canonical: string) => ({ canonical, description: "", threshold: "medium" });
  const resolved = { primary: [brief("aska:a"), brief("aska:b")], secondary: [], deprioritized: [] };
  const root: PersonaForm = {
    kind: "persona",
    description: "D",
    extends: null,
    tiers: { primary: [{ ref: "a" }], secondary: [], deprioritized: [] },
    stance: "",
    tieBreaking: "",
  };
  const child: PersonaForm = { ...root, extends: "aska:x", tiers: { primary: [{ ref: "a" }], secondary: [], deprioritized: [] } };

  it("is empty for a root persona even when the catalog resolves units", () => {
    expect(inheritedFor(root, root, resolved)).toEqual({ primary: [], secondary: [], deprioritized: [] });
  });
  it("lists the parent-only units for a child, against the loaded file's own entries", () => {
    expect(inheritedFor(child, child, resolved)).toEqual({ primary: [brief("aska:b")], secondary: [], deprioritized: [] });
  });
  it("doesn't change when the live form removes an own entry the loaded file still has", () => {
    const edited: PersonaForm = { ...child, tiers: { ...child.tiers, primary: [] } };
    expect(inheritedFor(edited, child, resolved)).toEqual({ primary: [brief("aska:b")], secondary: [], deprioritized: [] });
  });
  it("is null for a non-persona form", () => {
    const unit: UnitForm = { ...(emptyForm("unit") as UnitForm) };
    expect(inheritedFor(unit, unit, resolved)).toBeNull();
    expect(inheritedFor(null, null, resolved)).toBeNull();
  });
});

describe("sectionHeadingProblem", () => {
  it("catches a heading line the CLI would reject", () => {
    expect(sectionHeadingProblem({ sections: { Stance: "Fine.\n## Sneaky" } })).toBe('Stance can\'t contain a "## " heading line. Use Edit raw to add sections.');
    expect(sectionHeadingProblem({ sections: { "": "## Notes heading" } })).toMatch(/^Notes can't/);
  });
  it("allows fenced headings, deeper headings, and no sections", () => {
    expect(sectionHeadingProblem({ sections: { Stance: "```\n## in a fence\n```" } })).toBeNull();
    expect(sectionHeadingProblem({ sections: { Stance: "### Sub-point" } })).toBeNull();
    expect(sectionHeadingProblem({ set: { description: "## x" } })).toBeNull();
    expect(sectionHeadingProblem({})).toBeNull();
  });
});
