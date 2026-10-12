import { readFileSync } from 'node:fs';
import { effectiveThreshold } from '../model/effective';
import { cmp, type FileRef, type ScopeKind, type Severity, type Tier } from '../model/types';
import { checkPanelFile } from '../panel/panels';
import { splitFrontmatter } from '../parse/frontmatter';
import { parsePanel } from '../parse/panel';
import { parsePersona } from '../parse/persona';
import { parseUnit } from '../parse/unit';
import { resolvePersona } from '../resolve/resolve';
import { scopeRank, type Registry } from '../scopes/registry';

export type ListKind = 'units' | 'personas' | 'panels';

interface RowBase {
  canonical: string;
  name: string;
  scope: ScopeKind;
  plugin: string | null;
  path: string;
  description: string | null;
  shadowedBy: string | null;
  valid: boolean;
  errorCount: number;
}

interface UnitRow extends RowBase {
  threshold: string | null;
  appliesWhen: string | null;
}

interface UnitBrief {
  canonical: string;
  description: string;
  threshold: Severity;
}

type UnitsByTier = Record<Tier, UnitBrief[]>;

interface PersonaRow extends RowBase {
  extends: string | null;
  // The persona's resolved units by tier (extends, exclude, primary_order and threshold
  // overrides applied), or null when it doesn't resolve. Used by the panel skill to propose
  // a lineup.
  units: UnitsByTier | null;
}

interface PanelRow extends RowBase {
  personas: string[];
  // Persona ref → model, from the panel's `models`; empty when it has none or the file doesn't parse.
  models: Record<string, string>;
}

export interface Listing {
  units: UnitRow[];
  personas: PersonaRow[];
  panels: PanelRow[];
}

const order = (a: FileRef, b: FileRef): number =>
  scopeRank(a.scope.kind) - scopeRank(b.scope.kind)
  || cmp(a.scope.plugin ?? '', b.scope.plugin ?? '')
  || cmp(a.name, b.name)
  || cmp(a.canonical, b.canonical);

function str(data: Record<string, unknown> | undefined, key: string): string | null {
  const v = data?.[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function inspect(f: FileRef): { data?: Record<string, unknown>; errorCount: number } {
  let raw: string;
  try {
    raw = readFileSync(f.path, 'utf8');
  } catch {
    return { errorCount: 1 };
  }
  const diagnostics = f.kind === 'unit' ? parseUnit(f.path, raw).diagnostics
    : f.kind === 'panel' ? parsePanel(f.path, raw).diagnostics
    : parsePersona(f.path, raw).diagnostics;
  return {
    data: splitFrontmatter(f.path, raw).fm?.data,
    errorCount: diagnostics.filter((d) => d.level === 'error').length,
  };
}

function base(reg: Registry, f: FileRef, info: { data?: Record<string, unknown>; errorCount: number }): RowBase {
  const winner = reg.lookup(f.kind, f.name).file;
  return {
    canonical: f.canonical,
    name: f.name,
    scope: f.scope.kind,
    plugin: f.scope.kind === 'plugin' ? (f.scope.plugin ?? null) : null,
    path: f.path,
    description: str(info.data, 'description'),
    shadowedBy: winner && winner.path !== f.path ? winner.path : null,
    valid: info.errorCount === 0,
    errorCount: info.errorCount,
  };
}

function unitsOf(reg: Registry, canonical: string): UnitsByTier | null {
  const eff = resolvePersona(reg, canonical).effective;
  if (!eff) return null;
  const brief = (tier: Tier): UnitBrief[] =>
    eff.units[tier].map((u) => ({ canonical: u.canonical, description: u.unit.description, threshold: effectiveThreshold(u) }));
  return { primary: brief('primary'), secondary: brief('secondary'), deprioritized: brief('deprioritized') };
}

export function listRows(reg: Registry): Listing {
  const units = [...reg.all('unit')].sort(order).map((f): UnitRow => {
    const info = inspect(f);
    return { ...base(reg, f, info), threshold: str(info.data, 'threshold'), appliesWhen: str(info.data, 'applies_when') };
  });
  const personaRows = [...reg.all('persona')].sort(order).map((f): PersonaRow => {
    const info = inspect(f);
    const b = base(reg, f, info);
    return { ...b, extends: str(info.data, 'extends'), units: b.shadowedBy ? null : unitsOf(reg, f.canonical) };
  });
  const panels = [...reg.all('panel')].sort(order).map((f): PanelRow => {
    const info = inspect(f);
    // checkPanelFile includes the parse diagnostics, plus resolution errors when the file parses.
    const checked = checkPanelFile(reg, f);
    const errorCount = checked.diagnostics.filter((d) => d.level === 'error').length;
    const listed = info.data?.personas;
    const personas = Array.isArray(listed) ? listed.filter((x): x is string => typeof x === 'string') : [];
    const b = base(reg, f, { ...info, errorCount });
    return {
      canonical: b.canonical,
      name: b.name,
      scope: b.scope,
      plugin: b.plugin,
      path: b.path,
      description: b.description,
      personas,
      models: checked.panel?.models ?? {},
      shadowedBy: b.shadowedBy,
      valid: b.valid,
      errorCount: b.errorCount,
    };
  });
  return { units, personas: personaRows, panels };
}

const scopeLabel = (r: RowBase): string => (r.plugin ? `plugin ${r.plugin}` : r.scope);

function truncate(s: string, max: number): string {
  if (max <= 1) return '';
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

export function formatListing(l: Listing, kinds: readonly ListKind[], width = 80): string {
  const all: RowBase[] = [...l.units, ...l.personas, ...l.panels];
  const labelOfPath = (path: string) => {
    const r = all.find((x) => x.path === path);
    return r ? scopeLabel(r) : path;
  };
  const lines: string[] = [];
  for (const kind of kinds) {
    const rows: RowBase[] = kind === 'units' ? l.units : kind === 'personas' ? l.personas : l.panels;
    lines.push(`${kind}:`);
    if (rows.length === 0) {
      lines.push('  (none)');
      continue;
    }
    let last = '';
    for (const r of rows) {
      const label = scopeLabel(r);
      if (label !== last) {
        lines.push(`  ${label}`);
        last = label;
      }
      const detail = kind === 'units'
        ? ((r as UnitRow).threshold ?? '?')
        : kind === 'personas'
        ? ((r as PersonaRow).extends ? `extends ${(r as PersonaRow).extends}` : 'root')
        : `personas ${(r as PanelRow).personas.join(', ')}`;
      const head = `    ${r.name}  ${detail}`;
      const tail = [
        r.shadowedBy ? `(shadowed by ${labelOfPath(r.shadowedBy)})` : '',
        r.valid ? '' : `(invalid: ${r.errorCount} error${r.errorCount === 1 ? '' : 's'})`,
      ].filter(Boolean).join(' ');
      const room = width - head.length - 3 - (tail ? tail.length + 1 : 0);
      const desc = truncate((r.description ?? '').replace(/\s+/g, ' '), room);
      lines.push([head, desc ? `— ${desc}` : '', tail].filter(Boolean).join(' '));
    }
  }
  return lines.join('\n');
}
