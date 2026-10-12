import { SEVERITIES, TIERS, type Kind, type Patch, type Severity, type Tier, type UnitBrief, type UnitsByTier } from "../../shared/schemas";
import { isObj, plural } from "../../shared/guards";

export interface TierEntry {
  ref: string;
  threshold?: Severity;
  note?: string;
}
export type Tiers = Record<Tier, TierEntry[]>;
export type ListOrText = { mode: "list"; items: string[] } | { mode: "text"; text: string };
export interface UnitForm {
  kind: "unit";
  description: string;
  appliesWhen: string;
  threshold: Severity;
  looksFor: string;
  questions: ListOrText;
  redFlags: ListOrText;
  goodLooksLike: string;
}
export interface PanelForm {
  kind: "panel";
  description: string;
  personas: string[];
  notes: string;
}
export interface PersonaForm {
  kind: "persona";
  description: string;
  extends: string | null;
  tiers: Tiers;
  stance: string;
  tieBreaking: string;
}
export type FormState = UnitForm | PanelForm | PersonaForm;
export interface Shown {
  fields: Record<string, unknown>;
  sections: Record<string, string>;
}

function isSeverity(v: unknown): v is Severity {
  return typeof v === "string" && (SEVERITIES as readonly string[]).includes(v);
}

// A body counts as a list only if every non-blank line is a "- " or "* " bullet.
export function parseBullets(body: string): string[] | null {
  const items: string[] = [];
  for (const line of body.split("\n")) {
    if (line.trim() === "") continue;
    const m = /^[-*] (.*)$/.exec(line);
    if (!m) return null;
    items.push(m[1]!.trim());
  }
  return items;
}

export function formatBullets(items: readonly string[]): string {
  return items.map((i) => i.trim()).filter((i) => i !== "").map((i) => `- ${i}`).join("\n");
}

// A tier entry is written either as a bare `- ref` or as `- ref:` with nested settings.
export function tierEntriesOf(value: unknown): TierEntry[] {
  if (!Array.isArray(value)) return [];
  const out: TierEntry[] = [];
  for (const e of value) {
    if (typeof e === "string") {
      out.push({ ref: e });
      continue;
    }
    if (!isObj(e)) continue;
    const [ref] = Object.keys(e);
    if (ref === undefined) continue;
    const settings = isObj(e[ref]) ? (e[ref] as Record<string, unknown>) : {};
    out.push({
      ref,
      ...(isSeverity(settings.threshold) ? { threshold: settings.threshold } : {}),
      ...(typeof settings.note === "string" ? { note: settings.note } : {}),
    });
  }
  return out;
}

const listOrText = (body: string): ListOrText => {
  const items = parseBullets(body);
  return items ? { mode: "list", items } : { mode: "text", text: body };
};
const bodyOf = (v: ListOrText): string => (v.mode === "list" ? formatBullets(v.items) : v.text.trim());

export function formFromShow(kind: Kind, shown: Shown): FormState {
  const f = shown.fields;
  const str = (key: string): string => (typeof f[key] === "string" ? (f[key] as string).trim() : "");
  const sec = (heading: string): string => (shown.sections[heading] ?? "").trim();
  if (kind === "unit") {
    return {
      kind,
      description: str("description"),
      appliesWhen: str("applies_when"),
      threshold: isSeverity(f.threshold) ? f.threshold : "medium",
      looksFor: sec("Looks for"),
      questions: listOrText(sec("Questions")),
      redFlags: listOrText(sec("Red flags")),
      goodLooksLike: sec("Good looks like"),
    };
  }
  if (kind === "panel") {
    const personas = Array.isArray(f.personas) ? f.personas.filter((p): p is string => typeof p === "string") : [];
    return { kind, description: str("description"), personas, notes: sec("") };
  }
  const units = isObj(f.units) ? f.units : {};
  return {
    kind,
    description: str("description"),
    extends: typeof f.extends === "string" ? f.extends : null,
    tiers: { primary: tierEntriesOf(units.primary), secondary: tierEntriesOf(units.secondary), deprioritized: tierEntriesOf(units.deprioritized) },
    stance: sec("Stance"),
    tieBreaking: sec("Tie-breaking"),
  };
}

export function emptyForm(kind: Kind): FormState {
  return formFromShow(kind, { fields: {}, sections: {} });
}

const cleanEntries = (tier: Tier, entries: readonly TierEntry[]): TierEntry[] =>
  entries
    .filter((e) => e.ref.trim() !== "")
    .map((e) => ({
      ref: e.ref.trim(),
      ...(e.threshold ? { threshold: e.threshold } : {}),
      ...(tier === "deprioritized" && e.note && e.note.trim() !== "" ? { note: e.note.trim() } : {}),
    }));

// Only what changed since the last show goes into the patch, so untouched sections and tiers are
// never rewritten. Creation diffs against emptyForm(kind), which matches the CLI's template.
export function buildPatch(initial: FormState, current: FormState): Patch {
  if (initial.kind !== current.kind) throw new Error("form kinds differ");
  const set: Record<string, unknown> = {};
  const unset: string[] = [];
  const sections: Record<string, string> = {};
  const field = (path: string, before: string, after: string, optional: boolean) => {
    if (before.trim() === after.trim()) return;
    if (optional && after.trim() === "") unset.push(path);
    else set[path] = after.trim();
  };
  const section = (heading: string, before: string, after: string) => {
    if (before.trim() !== after.trim()) sections[heading] = after.trim();
  };

  if (initial.kind === "unit" && current.kind === "unit") {
    field("description", initial.description, current.description, false);
    field("applies_when", initial.appliesWhen, current.appliesWhen, true);
    if (initial.threshold !== current.threshold) set.threshold = current.threshold;
    section("Looks for", initial.looksFor, current.looksFor);
    section("Questions", bodyOf(initial.questions), bodyOf(current.questions));
    section("Red flags", bodyOf(initial.redFlags), bodyOf(current.redFlags));
    section("Good looks like", initial.goodLooksLike, current.goodLooksLike);
  } else if (initial.kind === "panel" && current.kind === "panel") {
    field("description", initial.description, current.description, false);
    if (JSON.stringify(initial.personas) !== JSON.stringify(current.personas)) set.personas = [...current.personas];
    section("", initial.notes, current.notes);
  } else if (initial.kind === "persona" && current.kind === "persona") {
    field("description", initial.description, current.description, false);
    for (const tier of TIERS) {
      const before = cleanEntries(tier, initial.tiers[tier]);
      const after = cleanEntries(tier, current.tiers[tier]);
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      const keepEmpty = tier === "primary" && current.extends === null;
      if (after.length === 0 && !keepEmpty) unset.push(`units.${tier}`);
      else set[`units.${tier}`] = after;
    }
    section("Stance", initial.stance, current.stance);
    section("Tie-breaking", initial.tieBreaking, current.tieBreaking);
  }

  const patch: Patch = {};
  if (Object.keys(set).length > 0) patch.set = set;
  if (unset.length > 0) patch.unset = unset;
  if (Object.keys(sections).length > 0) patch.sections = sections;
  return patch;
}

export function isEmptyPatch(p: Patch): boolean {
  return !p.set && !p.unset && !p.sections;
}

// aska rejects (exit 2) a patched section body containing a "## " heading line outside a code fence.
export function sectionHeadingProblem(patch: Patch): string | null {
  for (const [heading, body] of Object.entries(patch.sections ?? {})) {
    let fenced = false;
    for (const line of body.split("\n")) {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
      else if (!fenced && /^## /.test(line)) {
        return `${heading === "" ? "Notes" : heading} can't contain a "## " heading line. Use Edit raw to add sections.`;
      }
    }
  }
  return null;
}

const KNOWN_FIELDS: Record<Kind, readonly string[]> = {
  unit: ["name", "description", "applies_when", "threshold"],
  panel: ["name", "description", "personas"],
  persona: ["name", "description", "units", "extends"],
};
const KNOWN_SECTIONS: Record<Kind, readonly string[]> = {
  unit: ["Looks for", "Questions", "Red flags", "Good looks like"],
  panel: [""],
  persona: ["Stance", "Tie-breaking"],
};

// Read-only chips for everything outside the core forms; each one links to Edit raw.
export function advancedChips(kind: Kind, fields: Record<string, unknown>, sections: Record<string, string>): string[] {
  const chips: string[] = [];
  if (kind === "persona" && typeof fields.extends === "string") chips.push(`extends ${fields.extends}`);
  for (const key of Object.keys(fields)) {
    if (KNOWN_FIELDS[kind].includes(key)) continue;
    const v = fields[key];
    if (key === "overrides") chips.push(plural(Array.isArray(v) ? v.length : isObj(v) ? Object.keys(v).length : 1, "override"));
    else chips.push(key);
  }
  if (kind === "persona" && isObj(fields.units)) {
    const units = fields.units;
    for (const key of Object.keys(units)) if (!(TIERS as readonly string[]).includes(key)) chips.push(`units.${key}`);
    const extra = TIERS.flatMap((t) => (Array.isArray(units[t]) ? (units[t] as unknown[]) : [])).filter(
      (e) => isObj(e) && Object.values(e).some((s) => isObj(s) && Object.keys(s).some((k) => k !== "threshold" && k !== "note")),
    ).length;
    if (extra > 0) chips.push(`${plural(extra, "unit")} with extra settings`);
  }
  const other = Object.keys(sections).filter((h) => !KNOWN_SECTIONS[kind].includes(h)).length;
  if (other > 0) chips.push(plural(other, "other section"));
  return chips;
}

export function sameRef(a: string, b: string): boolean {
  return a === b || (!a.includes(":") && b.endsWith(`:${a}`)) || (!b.includes(":") && a.endsWith(`:${b}`));
}

// Resolved units (from the catalog) that this file doesn't name itself: what a child inherits.
export function inheritedUnits(resolved: UnitsByTier | null, tiers: Tiers): Record<Tier, UnitBrief[]> {
  const own = TIERS.flatMap((t) => tiers[t].map((e) => e.ref)).filter((r) => r !== "");
  const pick = (tier: Tier): UnitBrief[] => (resolved?.[tier] ?? []).filter((u) => !own.some((r) => sameRef(r, u.canonical)));
  return { primary: pick("primary"), secondary: pick("secondary"), deprioritized: pick("deprioritized") };
}

const NO_INHERITED: Record<Tier, UnitBrief[]> = { primary: [], secondary: [], deprioritized: [] };

// Only a child inherits. Subtract the loaded file's own entries (not the live form), so removing
// an entry in the form never makes it reappear as "inherited".
export function inheritedFor(current: FormState | null, loaded: FormState | null, resolved: UnitsByTier | null): Record<Tier, UnitBrief[]> | null {
  if (current?.kind !== "persona") return null;
  if (current.extends === null || loaded?.kind !== "persona") return NO_INHERITED;
  return inheritedUnits(resolved, loaded.tiers);
}
