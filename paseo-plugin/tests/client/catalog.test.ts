import { describe, expect, it } from "vitest";
import {
  cardsFor,
  hasStale,
  nameProblem,
  newScopes,
  personaOptions,
  personaRowFor,
  rawFixHint,
  scopeFilters,
  showName,
  summarizeDiagnostics,
  targetKey,
  unitOptions,
  writeScopeOf,
  type OpenTarget,
} from "../../client/logic/catalog";
import type { Listing } from "../../shared/schemas";

const row = { plugin: null, shadowedBy: null, valid: true, errorCount: 0, description: "d" };
const brief = (canonical: string) => ({ canonical, description: `${canonical} desc`, threshold: "medium" });
const listing: Listing = {
  units: [
    { ...row, canonical: "security", name: "security", scope: "project", path: "/p/security.unit.md", threshold: "low", appliesWhen: null },
    { ...row, canonical: "aska:security", name: "security", scope: "plugin", plugin: "aska", path: "/a/security.unit.md", shadowedBy: "/p/security.unit.md", threshold: "low", appliesWhen: null },
    { ...row, canonical: "broken", name: "broken", scope: "user", path: "/u/broken.unit.md", valid: false, errorCount: 2, threshold: null, appliesWhen: null },
  ],
  personas: [
    { ...row, canonical: "aska:guardian", name: "guardian", scope: "plugin", plugin: "aska", path: "/a/guardian.persona.md", shadowedBy: "/u/guardian.persona.md", extends: null, units: null },
    { ...row, canonical: "guardian", name: "guardian", scope: "user", path: "/u/guardian.persona.md", warningCount: 1, extends: "aska:guardian", units: { primary: [brief("aska:data-integrity"), brief("security")], secondary: [], deprioritized: [] } },
  ],
  panels: [],
  warnings: [],
};

describe("cardsFor", () => {
  it("gives each row a status: valid, errors, or shadowed", () => {
    const cards = cardsFor(listing, "unit", "all");
    expect(cards.map((c) => [c.canonical, c.status.label, c.status.tone, c.readOnly])).toEqual([
      ["security", "✓ valid", "ok", false],
      ["aska:security", "shadowed by project", "muted", true],
      ["broken", "✗ 2 errors", "error", false],
    ]);
    expect(cards[1]!.scopeLabel).toBe("aska");
  });

  it("shows warnings when a row reports them", () => {
    const user = cardsFor(listing, "persona", "user");
    expect(user).toHaveLength(1);
    expect(user[0]!.status).toEqual({ tone: "warning", label: "⚠ 1 warning" });
  });

  it("filters by scope; the aska filter means plugin scope", () => {
    expect(cardsFor(listing, "unit", "plugin").map((c) => c.canonical)).toEqual(["aska:security"]);
    expect(cardsFor(listing, "panel", "all")).toEqual([]);
  });
});

describe("scope choices", () => {
  it("offers Project only with a workspace", () => {
    expect(scopeFilters(false).map((f) => f.label)).toEqual(["All", "User", "aska"]);
    expect(scopeFilters(true).map((f) => f.label)).toEqual(["All", "Project", "User", "aska"]);
    expect(newScopes(false).map((s) => s.value)).toEqual(["user"]);
    expect(newScopes(true).map((s) => s.value)).toEqual(["project", "user"]);
  });
});

describe("nameProblem", () => {
  it("wants kebab-case", () => {
    expect(nameProblem("My Persona", "persona", "user", listing)).toMatch(/kebab-case/);
    expect(nameProblem("a--b", "persona", "user", listing)).toMatch(/kebab-case/);
  });
  it("refuses a name that already exists in that scope only", () => {
    expect(nameProblem("guardian", "persona", "user", listing)).toBe('A user persona named "guardian" already exists.');
    expect(nameProblem("guardian", "persona", "project", listing)).toBeNull();
    expect(nameProblem("guardian", "unit", "user", listing)).toBeNull();
    expect(nameProblem("fresh-name", "persona", "user", listing)).toBeNull();
  });
});

describe("pickers", () => {
  it("offers only the units that win resolution", () => {
    expect(unitOptions(listing).map((o) => o.value)).toEqual(["security", "broken"]);
  });
  it("shows each persona's primary units", () => {
    expect(personaOptions(listing)).toEqual([{ value: "guardian", label: "guardian", detail: "primary: aska:data-integrity, security" }]);
  });
  it("finds the catalog row for a persona in a given scope", () => {
    expect(personaRowFor(listing, "guardian", "user")?.extends).toBe("aska:guardian");
    expect(personaRowFor(listing, "guardian", "project")).toBeUndefined();
  });
});

describe("targets and diagnostics", () => {
  const plugin: OpenTarget = { kind: "persona", name: "guardian", canonical: "aska:guardian", scope: "plugin", creating: false };
  const user: OpenTarget = { kind: "persona", name: "guardian", canonical: "guardian", scope: "user", creating: false };
  it("shows plugin files by canonical name and others by name", () => {
    expect(showName(plugin)).toBe("aska:guardian");
    expect(showName(user)).toBe("guardian");
  });
  it("never yields a plugin write scope", () => {
    expect(writeScopeOf(user)).toBe("user");
    expect(() => writeScopeOf(plugin)).toThrow(/read-only/);
  });
  it("keys a new file apart from a saved one", () => {
    expect(targetKey({ ...user, creating: true })).not.toBe(targetKey(user));
  });
  it("summarises and detects E_STALE", () => {
    const ds = [
      { level: "error" as const, code: "E_STALE", message: "m" },
      { level: "warning" as const, code: "W_X", message: "m" },
    ];
    expect(summarizeDiagnostics(ds)).toEqual({ tone: "error", label: "✗ 1 error" });
    expect(summarizeDiagnostics([ds[1]!])).toEqual({ tone: "warning", label: "⚠ 1 warning" });
    expect(summarizeDiagnostics([])).toEqual({ tone: "ok", label: "✓ valid" });
    expect(hasStale(ds)).toBe(true);
    expect(hasStale([ds[1]!])).toBe(false);
  });
});

describe("rawFixHint", () => {
  it("points at Edit raw for a broken file, and only then", () => {
    expect(rawFixHint([{ level: "error", code: "E_FRONTMATTER", message: "m" }])).toMatch(/Edit raw/);
    expect(rawFixHint([{ level: "error", code: "E_FIELD_TYPE", message: "m" }])).toMatch(/Edit raw/);
    expect(rawFixHint([{ level: "error", code: "E_STALE", message: "m" }])).toBeNull();
    expect(rawFixHint([])).toBeNull();
  });
});
