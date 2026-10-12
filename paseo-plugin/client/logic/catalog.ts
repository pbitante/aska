import { NAME_PATTERN, type Diagnostic, type Kind, type Listing, type ReadScope, type WriteScope } from "../../shared/schemas";
import { plural } from "../../shared/guards";

export type Tone = "ok" | "warning" | "error" | "muted";
export interface CardStatus {
  tone: Tone;
  label: string;
}
export type ScopeFilter = "all" | "project" | "user" | "plugin";
export interface Option {
  value: string;
  label: string;
  detail?: string;
}
export interface OpenTarget {
  kind: Kind;
  name: string;
  canonical: string;
  scope: ReadScope;
  creating: boolean;
}
export interface Card {
  key: string;
  kind: Kind;
  name: string;
  canonical: string;
  scope: ReadScope;
  scopeLabel: string;
  description: string;
  status: CardStatus;
  readOnly: boolean;
}
export type PersonaRow = Listing["personas"][number];
type Row = Listing["units"][number] | PersonaRow | Listing["panels"][number];

function countStatus(errors: number, warnings: number): CardStatus {
  if (errors > 0) return { tone: "error", label: `✗ ${plural(errors, "error")}` };
  if (warnings > 0) return { tone: "warning", label: `⚠ ${plural(warnings, "warning")}` };
  return { tone: "ok", label: "✓ valid" };
}

export function summarizeDiagnostics(ds: readonly Diagnostic[]): CardStatus {
  return countStatus(ds.filter((d) => d.level === "error").length, ds.filter((d) => d.level === "warning").length);
}

export function scopeLabel(scope: ReadScope, plugin: string | null): string {
  return scope === "plugin" ? (plugin ?? "plugin") : scope;
}

function rowsOf(listing: Listing, kind: Kind): readonly Row[] {
  return kind === "unit" ? listing.units : kind === "persona" ? listing.personas : listing.panels;
}

export function cardsFor(listing: Listing, kind: Kind, filter: ScopeFilter): Card[] {
  const everything: readonly Row[] = [...listing.units, ...listing.personas, ...listing.panels];
  return rowsOf(listing, kind)
    .filter((r) => filter === "all" || r.scope === filter)
    .map((r) => {
      const shadower = r.shadowedBy ? everything.find((x) => x.path === r.shadowedBy) : undefined;
      const status: CardStatus =
        r.errorCount > 0
          ? countStatus(r.errorCount, 0)
          : r.shadowedBy
            ? { tone: "muted", label: `shadowed by ${shadower ? scopeLabel(shadower.scope, shadower.plugin) : "another file"}` }
            : countStatus(0, r.warningCount ?? 0);
      return {
        key: `${kind}:${r.path}`,
        kind,
        name: r.name,
        canonical: r.canonical,
        scope: r.scope,
        scopeLabel: scopeLabel(r.scope, r.plugin),
        description: r.description ?? "",
        status,
        readOnly: r.scope === "plugin",
      };
    });
}

export function scopeFilters(hasWorkspace: boolean): { value: ScopeFilter; label: string }[] {
  return [
    { value: "all", label: "All" },
    ...(hasWorkspace ? [{ value: "project" as const, label: "Project" }] : []),
    { value: "user", label: "User" },
    { value: "plugin", label: "aska" },
  ];
}

export function newScopes(hasWorkspace: boolean): { value: WriteScope; label: string }[] {
  return hasWorkspace
    ? [{ value: "project", label: "Project" }, { value: "user", label: "User" }]
    : [{ value: "user", label: "User" }];
}

export function nameProblem(name: string, kind: Kind, scope: WriteScope, listing: Listing): string | null {
  if (!NAME_PATTERN.test(name)) return "Use lowercase letters and digits, joined by single hyphens (kebab-case).";
  const taken = rowsOf(listing, kind).some((r) => r.scope === scope && r.name === name);
  return taken ? `A ${scope} ${kind} named "${name}" already exists.` : null;
}

export function unitOptions(listing: Listing): Option[] {
  return listing.units
    .filter((u) => u.shadowedBy === null)
    .map((u) => ({ value: u.canonical, label: u.canonical, detail: u.description ?? "" }));
}

export function personaOptions(listing: Listing): Option[] {
  return listing.personas
    .filter((p) => p.shadowedBy === null)
    .map((p) => ({
      value: p.canonical,
      label: p.canonical,
      detail: p.units ? `primary: ${p.units.primary.map((u) => u.canonical).join(", ") || "none"}` : (p.description ?? ""),
    }));
}

export function personaRowFor(listing: Listing, canonical: string, scope: ReadScope): PersonaRow | undefined {
  return listing.personas.find((p) => p.canonical === canonical && p.scope === scope);
}

export function showName(t: OpenTarget): string {
  return t.scope === "plugin" ? t.canonical : t.name;
}

export function writeScopeOf(t: OpenTarget): WriteScope {
  if (t.scope === "plugin") throw new Error(`${t.canonical} is read-only`);
  return t.scope;
}

export function targetKey(t: OpenTarget): string {
  return `${t.kind}:${t.scope}:${t.canonical}:${t.creating ? "new" : "file"}`;
}

export function hasStale(ds: readonly Diagnostic[]): boolean {
  return ds.some((d) => d.code === "E_STALE");
}

const RAW_FIX_CODES: readonly string[] = ["E_FRONTMATTER", "E_FIELD_TYPE"];

// aska refuses to patch a file whose frontmatter is broken; only the raw editor can repair it.
export function rawFixHint(ds: readonly Diagnostic[]): string | null {
  return ds.some((d) => RAW_FIX_CODES.includes(d.code))
    ? "This file's frontmatter needs fixing before the form can save it. Use Edit raw."
    : null;
}
