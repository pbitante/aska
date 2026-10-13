import { err, hasErrors, warn, type Diagnostic } from '../diagnostics';
import { readIfExists } from '../fs';
import { inputId, type ClashReport, type Resolution } from '../model/effective';
import type { FileRef, Loc, OverrideEntry, PersonaDoc, Shadow, UnitDoc, UnitEntry } from '../model/types';
import { parsePersona } from '../parse/persona';
import { sectionKey } from '../parse/sections';
import { parseUnit } from '../parse/unit';
import type { Lookup, Registry } from '../scopes/registry';
import { overrideLine, quoteKey } from './format';
import { applyLayer, emptyAcc, type ResolvedRef } from './merge';

const SECTION_OR_JUDGMENT_KEY = /^(section|judgment):(.*)$/;

const UNIT_FIELDS = ['tier', 'threshold', 'note', 'excluded'];

function splitUnitKey(key: string): { unitRef: string; field: string } | undefined {
  if (/^(section|judgment|capability):/.test(key)) return undefined;
  const i = key.lastIndexOf('.');
  if (i <= 0) return undefined;
  const field = key.slice(i + 1);
  return UNIT_FIELDS.includes(field) ? { unitRef: key.slice(0, i), field } : undefined;
}

export function resolvePersona(reg: Registry, ref: string): Resolution {
  const ds: Diagnostic[] = [];
  const report: ClashReport = { clashes: [], stale: [], shadows: [] };
  const shadows = new Map<string, Shadow>();
  const chain: { file: FileRef; doc: PersonaDoc }[] = [];
  const noteShadow = (s?: Shadow) => {
    if (s) shadows.set(`${s.kind}:${s.name}:${s.used.path}`, s);
  };
  const done = (): Resolution => {
    // A same-name `extends` can make the top-level lookup see a less specific persona file as
    // "shadowed" even though the chain goes on to use it as the parent. Leave those out: they
    // are used, not shadowed.
    const chainPaths = new Set(chain.map((c) => c.file.path));
    const visibleShadows = [...shadows.values()]
      .map((s) => (s.kind === 'persona' ? { ...s, shadowed: s.shadowed.filter((f) => !chainPaths.has(f.path)) } : s))
      .filter((s) => s.shadowed.length > 0);
    return { report: { ...report, shadows: visibleShadows }, diagnostics: ds };
  };

  // 1. Follow the extends chain from the requested persona up to its root.
  const top = reg.lookup('persona', ref);
  if (!top.file) {
    ds.push(top.diagnostic!);
    return done();
  }
  noteShadow(top.shadow);
  const seen = new Set<string>();
  let current: FileRef | undefined = top.file;
  while (current) {
    if (seen.has(current.path)) {
      const path = [...chain.map((c) => c.file.canonical), current.canonical].join(' → ');
      ds.push(err('E_CYCLE', `extends cycle: ${path}`, { file: current.path, line: 1 },
        'Break the cycle. To extend a plugin persona that has the same name, use its namespaced form (plugin:name)'));
      return done();
    }
    seen.add(current.path);
    const raw = readIfExists(current.path);
    if (raw === undefined) {
      ds.push(err('E_READ', `could not read ${current.path}`, { file: current.path, line: 1 }, 'Check that the file still exists and is readable'));
      return done();
    }
    const parsed = parsePersona(current.path, raw);
    ds.push(...parsed.diagnostics);
    if (!parsed.persona) return done();
    chain.push({ file: current, doc: parsed.persona });
    const ext = parsed.persona.extends;
    if (ext === undefined) break;
    const at = parsed.persona.extendsLoc;
    const next: Lookup = ext === current.name && !ext.includes(':')
      ? reg.lookup('persona', ext, at, current.scope)
      : reg.lookup('persona', ext, at);
    if (!next.file) {
      ds.push(next.diagnostic!);
      return done();
    }
    noteShadow(next.shadow);
    current = next.file;
  }

  // 2. Fold the layers from the root down.
  const inputs = new Map<string, FileRef>(chain.map((c) => [c.file.path, c.file]));
  const unitCache = new Map<string, UnitDoc | null>();
  const loadUnit = (f: FileRef): UnitDoc | undefined => {
    if (!unitCache.has(f.path)) {
      const raw = readIfExists(f.path);
      if (raw === undefined) {
        ds.push(err('E_READ', `could not read ${f.path}`, { file: f.path, line: 1 }, 'Check that the file still exists and is readable'));
        unitCache.set(f.path, null);
      } else {
        const p = parseUnit(f.path, raw);
        ds.push(...p.diagnostics);
        unitCache.set(f.path, p.unit ?? null);
      }
    }
    inputs.set(f.path, f);
    return unitCache.get(f.path) ?? undefined;
  };

  let acc = emptyAcc();
  for (const { file, doc } of [...chain].reverse()) {
    const refs = new Map<string, ResolvedRef>();
    const resolveRef = (unitRef: string, at: Loc): ResolvedRef | undefined => {
      const known = refs.get(unitRef);
      if (known) return known;
      const l = reg.lookup('unit', unitRef, at);
      if (!l.file) {
        ds.push(l.diagnostic!);
        return undefined;
      }
      noteShadow(l.shadow);
      const unit = loadUnit(l.file);
      if (!unit) return undefined;
      const r = { canonical: l.file.canonical, unit };
      refs.set(unitRef, r);
      return r;
    };

    const byCanonical = new Map<string, UnitEntry>();
    const dedupedUnits: UnitEntry[] = [];
    for (const e of doc.units) {
      const r = resolveRef(e.ref, e.loc);
      if (!r) continue;
      const prev = byCanonical.get(r.canonical);
      if (prev) {
        ds.push(err('E_DUPLICATE_UNIT', `${e.ref} and ${prev.ref} are the same unit (${r.canonical}); a unit may appear only once per file`, e.loc, 'Keep one entry'));
      } else {
        byCanonical.set(r.canonical, e);
        dedupedUnits.push(e);
      }
    }
    for (const r of doc.primaryOrder?.refs ?? []) resolveRef(r, doc.primaryOrder!.loc);

    const overrides = new Map<string, OverrideEntry>();
    for (const o of doc.overrides) {
      let id = o.key;
      let hint: string | undefined;
      const split = splitUnitKey(o.key);
      if (split) {
        const l = reg.lookup('unit', split.unitRef, o.loc);
        if (l.file) {
          id = `${l.file.canonical}.${split.field}`;
          if (id !== o.key) ds.push(warn('W_OVERRIDE_KEY_NONCANONICAL', `overrides key "${o.key}" is better written "${id}"`, o.loc, `Rename the key to ${quoteKey(id)}`));
        } else {
          hint = l.diagnostic?.fix;
        }
      } else {
        const m = SECTION_OR_JUDGMENT_KEY.exec(o.key);
        if (m) {
          id = `${m[1]!}:${sectionKey(m[2]!)}`;
          if (id !== o.key) ds.push(warn('W_OVERRIDE_KEY_NONCANONICAL', `overrides key "${o.key}" is better written "${id}"`, o.loc, `Rename the key to ${quoteKey(id)}`));
        }
      }
      const prev = overrides.get(id);
      if (prev) {
        ds.push(warn('W_OVERRIDE_DUPLICATE', `overrides "${o.key}" duplicates "${prev.key}" (both resolve to "${id}"); the first entry wins`, o.loc,
          `Remove the duplicate "${o.key}" entry, or merge it into "${prev.key}"`));
        continue;
      }
      overrides.set(id, hint ? { ...o, hint } : o);
    }

    const res = applyLayer(acc, { file, doc: { ...doc, units: dedupedUnits }, refs, overrides });
    acc = res.acc;
    report.clashes.push(...res.clashes);
    report.stale.push(...res.stale);
    ds.push(...res.diagnostics);
  }

  // 3. Warnings that need the whole result.
  for (const c of report.clashes) {
    if (c.decision !== 'unreviewed') continue;
    // A clash declared by a plugin layer can't be fixed by the user — overrides only reach the
    // layer that declares them, and the plugin path is a versioned cache. Leave it in the full
    // report (formatReport) but don't surface an unfollowable warning for it.
    if (c.layer.scope.kind === 'plugin') continue;
    ds.push(warn('W_UNREVIEWED', `unreviewed clash ${c.id}: child ${c.child}, parent ${c.parent}`, c.loc,
      `Under overrides: in ${c.layer.path}, add ${overrideLine(c.id, 'child')} to keep this, or ${overrideLine(c.id, 'parent')} to flip it`));
  }
  for (const s of report.stale) {
    ds.push(warn('W_STALE_OVERRIDE', `overrides entry "${s.key}" matches no clash in this persona`, s.loc,
      s.hint ? `Remove the entry, or fix the reference: ${s.hint}` : 'Remove the entry'));
  }
  if (acc.units.primary.length > 7) {
    ds.push(warn('W_TOO_MANY_PRIMARY', `${acc.units.primary.length} primary units; if everything is primary, nothing is`, { file: top.file.path, line: 1 }, 'Move some units to secondary'));
  }

  const result = done();
  if (hasErrors(ds) || !acc.stance || !acc.tieBreaking || acc.description === undefined) return result;
  const sortedPaths = [...inputs.keys()].sort();
  return {
    ...result,
    effective: {
      name: acc.name,
      canonical: top.file.canonical,
      description: acc.description,
      model: acc.model ?? null,
      source: top.file.path,
      sourceId: inputId(top.file),
      units: acc.units,
      stance: acc.stance,
      tieBreaking: acc.tieBreaking,
      extraSections: acc.extraSections,
      judgmentSections: acc.judgmentSections,
      capabilities: acc.capabilities,
      tools: acc.tools,
      inputs: sortedPaths,
      inputIds: sortedPaths.map((path) => inputId(inputs.get(path)!)),
      inputScopes: [...new Set([...inputs.values()].map((f) => f.scope.kind))],
    },
  };
}
