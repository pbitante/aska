import { err, warn, type Diagnostic } from '../diagnostics';
import { effectiveThreshold, type Clash, type EffUnit, type StaleOverride } from '../model/effective';
import { TIERS, type CapabilityKind, type FileRef, type Loc, type OverrideEntry, type PanelModel, type PersonaDoc, type Section, type Tier, type UnitDoc, type UnitEntry } from '../model/types';
import { sectionKey } from '../parse/sections';

export interface Acc {
  name: string;
  description?: string;
  model?: PanelModel;
  units: Record<Tier, EffUnit[]>;
  stance?: Section;
  tieBreaking?: Section;
  extraSections: Section[];
  judgmentSections: { name: string; ask: string }[];
  capabilities: { kind: CapabilityKind; name: string; when: string }[];
  tools: string[];
}

export interface ResolvedRef {
  canonical: string;
  unit: UnitDoc;
}

export interface Layer {
  file: FileRef;
  doc: PersonaDoc;
  refs: Map<string, ResolvedRef>;
  overrides: Map<string, OverrideEntry>;
}

export interface LayerResult {
  acc: Acc;
  clashes: Clash[];
  stale: StaleOverride[];
  diagnostics: Diagnostic[];
}

type Setting = 'threshold' | 'addQuestions' | 'addRedFlags' | 'note';
const SETTINGS: readonly Setting[] = ['threshold', 'addQuestions', 'addRedFlags', 'note'];
const LEGAL: Record<Tier, readonly Setting[]> = {
  primary: ['threshold', 'addQuestions', 'addRedFlags'],
  secondary: ['threshold'],
  deprioritized: ['note'],
};
const LABEL: Record<Setting, string> = { threshold: 'threshold', addQuestions: 'add_questions', addRedFlags: 'add_red_flags', note: 'note' };

export function emptyAcc(): Acc {
  return { name: '', units: { primary: [], secondary: [], deprioritized: [] }, extraSections: [], judgmentSections: [], capabilities: [], tools: [] };
}

const cloneUnit = (u: EffUnit): EffUnit => ({ ...u, addQuestions: [...u.addQuestions], addRedFlags: [...u.addRedFlags] });

function cloneAcc(a: Acc): Acc {
  return {
    ...a,
    units: { primary: a.units.primary.map(cloneUnit), secondary: a.units.secondary.map(cloneUnit), deprioritized: a.units.deprioritized.map(cloneUnit) },
    extraSections: [...a.extraSections],
    judgmentSections: a.judgmentSections.map((s) => ({ ...s })),
    capabilities: a.capabilities.map((c) => ({ ...c })),
    tools: [...a.tools],
  };
}

const union = (a: readonly string[], b: readonly string[]): string[] => {
  const out = [...a];
  for (const x of b) if (!out.includes(x)) out.push(x);
  return out;
};

const excerpt = (text: string): string => {
  const first = text.split('\n')[0]!.trim();
  return first.length > 60 ? `${first.slice(0, 57)}...` : first;
};

const settingsOf = (e: UnitEntry): Setting[] => SETTINGS.filter((s) => e[s] !== undefined);

function dropIllegal(u: EffUnit, tier: Tier): string[] {
  const dropped: string[] = [];
  if (!LEGAL[tier].includes('threshold') && u.thresholdSet !== undefined) {
    dropped.push(`inherited threshold ${u.thresholdSet}`);
    u.thresholdSet = undefined;
  }
  if (!LEGAL[tier].includes('addQuestions') && u.addQuestions.length > 0) {
    dropped.push('inherited add_questions');
    u.addQuestions = [];
  }
  if (!LEGAL[tier].includes('addRedFlags') && u.addRedFlags.length > 0) {
    dropped.push('inherited add_red_flags');
    u.addRedFlags = [];
  }
  if (!LEGAL[tier].includes('note') && u.note !== undefined) {
    dropped.push('inherited note');
    u.note = undefined;
  }
  return dropped;
}

export function applyLayer(a: Acc, layer: Layer): LayerResult {
  const acc = cloneAcc(a);
  const clashes: Clash[] = [];
  const diagnostics: Diagnostic[] = [];
  const consulted = new Set<string>();

  const clash = (id: string, child: string, parent: string, loc: Loc): Clash => {
    const o = layer.overrides.get(id);
    if (o) consulted.add(id);
    const c: Clash = { id, layer: layer.file, child, parent, decision: o ? o.value : 'unreviewed', dropped: [], loc };
    clashes.push(c);
    return c;
  };
  const find = (canonical: string) => {
    for (const tier of TIERS) {
      const index = acc.units[tier].findIndex((u) => u.canonical === canonical);
      if (index >= 0) return { tier, index, unit: acc.units[tier][index]! };
    }
    return undefined;
  };
  const placed: Record<Tier, EffUnit[]> = { primary: [], secondary: [], deprioritized: [] };

  for (const e of layer.doc.units) {
    const r = layer.refs.get(e.ref);
    if (!r) continue;
    const existing = find(r.canonical);

    if (e.tier === 'exclude') {
      if (!existing) {
        diagnostics.push(warn('W_EXCLUDE_NOOP', `exclude: ${e.ref} is not inherited, so excluding it does nothing`, e.loc, `Remove ${e.ref} from units.exclude`));
        continue;
      }
      const c = clash(`${r.canonical}.excluded`, 'excluded', existing.tier, e.loc);
      if (c.decision !== 'parent') acc.units[existing.tier].splice(existing.index, 1);
      continue;
    }

    if (!existing) {
      placed[e.tier].push({
        canonical: r.canonical,
        unit: r.unit,
        tier: e.tier,
        thresholdSet: e.threshold,
        addQuestions: [...(e.addQuestions ?? [])],
        addRedFlags: [...(e.addRedFlags ?? [])],
        note: e.note,
      });
      continue;
    }

    let u = existing.unit;
    let target: Tier = existing.tier;
    let tierClash: Clash | undefined;
    if (existing.tier !== e.tier) {
      tierClash = clash(`${r.canonical}.tier`, e.tier, existing.tier, e.loc);
      if (tierClash.decision !== 'parent') {
        target = e.tier;
        acc.units[existing.tier].splice(existing.index, 1);
        u = { ...u, tier: target };
        tierClash.dropped.push(...dropIllegal(u, target));
        placed[target].push(u);
      }
    }
    for (const s of settingsOf(e)) {
      if (!LEGAL[target].includes(s)) tierClash?.dropped.push(`${LABEL[s]} from ${layer.file.canonical}`);
    }
    if (e.threshold !== undefined && LEGAL[target].includes('threshold')) {
      const current = effectiveThreshold(u);
      if (e.threshold !== current) {
        const c = clash(`${r.canonical}.threshold`, e.threshold, current, e.loc);
        if (c.decision !== 'parent') u.thresholdSet = e.threshold;
      } else {
        u.thresholdSet = e.threshold;
      }
    }
    if (LEGAL[target].includes('addQuestions')) u.addQuestions = union(u.addQuestions, e.addQuestions ?? []);
    if (LEGAL[target].includes('addRedFlags')) u.addRedFlags = union(u.addRedFlags, e.addRedFlags ?? []);
    if (e.note !== undefined && target === 'deprioritized') {
      if (u.note !== undefined && u.note !== e.note) {
        const c = clash(`${r.canonical}.note`, e.note, u.note, e.loc);
        if (c.decision !== 'parent') u.note = e.note;
      } else {
        u.note = e.note;
      }
    }
  }

  acc.units.primary = [...placed.primary, ...acc.units.primary];
  acc.units.secondary = [...acc.units.secondary, ...placed.secondary];
  acc.units.deprioritized = [...acc.units.deprioritized, ...placed.deprioritized];

  const order = layer.doc.primaryOrder;
  if (order) {
    const wanted: string[] = [];
    const refByCanonical = new Map<string, string>();
    for (const ref of order.refs) {
      const canonical = layer.refs.get(ref)?.canonical;
      if (!canonical) continue;
      if (!acc.units.primary.some((u) => u.canonical === canonical)) {
        diagnostics.push(err('E_PRIMARY_ORDER', `primary_order lists ${ref}, which is not a primary unit of this persona`, order.loc, 'List only units that end up in primary'));
        continue;
      }
      const earlier = refByCanonical.get(canonical);
      if (earlier) {
        diagnostics.push(err('E_PRIMARY_ORDER', `${ref} is the same unit as ${earlier} (${canonical}); list it once`, order.loc, `Remove ${ref} from primary_order and keep ${earlier}`));
        continue;
      }
      refByCanonical.set(canonical, ref);
      wanted.push(canonical);
    }
    const reordered = [
      ...wanted.map((c) => acc.units.primary.find((u) => u.canonical === c)!),
      ...acc.units.primary.filter((u) => !wanted.includes(u.canonical)),
    ];
    const inherited = new Set(a.units.primary.map((u) => u.canonical));
    const before = acc.units.primary.map((u) => u.canonical).filter((c) => inherited.has(c));
    const after = reordered.map((u) => u.canonical).filter((c) => inherited.has(c));
    if (before.join('\n') !== after.join('\n')) {
      const c = clash('primary-order', after.join(', '), before.join(', '), order.loc);
      if (c.decision !== 'parent') acc.units.primary = reordered;
    } else {
      acc.units.primary = reordered;
    }
  }

  const doc = layer.doc;
  const replaceText = (id: string, next: Section, prev: Section | undefined): Section => {
    if (!prev || prev.text === next.text) return next;
    const c = clash(id, excerpt(next.text), excerpt(prev.text), next.loc);
    return c.decision === 'parent' ? prev : next;
  };
  if (doc.stance) acc.stance = replaceText('stance', doc.stance, acc.stance);
  if (doc.tieBreaking) acc.tieBreaking = replaceText('tie-breaking', doc.tieBreaking, acc.tieBreaking);
  for (const s of doc.extraSections) {
    const i = acc.extraSections.findIndex((x) => x.key === s.key);
    if (i < 0) acc.extraSections.push(s);
    else acc.extraSections[i] = replaceText(`section:${s.key}`, s, acc.extraSections[i]);
  }

  for (const j of doc.judgmentSections) {
    const key = sectionKey(j.name);
    const i = acc.judgmentSections.findIndex((x) => sectionKey(x.name) === key);
    if (i < 0) {
      acc.judgmentSections.push({ name: j.name, ask: j.ask });
      continue;
    }
    const prev = acc.judgmentSections[i]!;
    if (prev.ask === j.ask) continue;
    const c = clash(`judgment:${key}`, excerpt(j.ask), excerpt(prev.ask), j.loc);
    if (c.decision !== 'parent') acc.judgmentSections[i] = { name: j.name, ask: j.ask };
  }

  for (const cap of doc.capabilities) {
    const i = acc.capabilities.findIndex((x) => x.kind === cap.kind && x.name === cap.name);
    if (i < 0) {
      acc.capabilities.push({ kind: cap.kind, name: cap.name, when: cap.when });
      continue;
    }
    const prev = acc.capabilities[i]!;
    if (prev.when === cap.when) continue;
    const c = clash(`capability:${cap.kind}:${cap.name}`, cap.when, prev.when, cap.loc);
    if (c.decision !== 'parent') acc.capabilities[i] = { kind: cap.kind, name: cap.name, when: cap.when };
  }

  acc.tools = union(acc.tools, doc.tools);
  acc.name = doc.name;
  if (doc.description !== undefined) acc.description = doc.description;
  if (doc.model !== undefined) acc.model = doc.model;

  const stale: StaleOverride[] = [...layer.overrides]
    .filter(([id]) => !consulted.has(id))
    .map(([id, o]) => ({ layer: layer.file, key: o.key, id, loc: o.loc, hint: o.hint }));

  return { acc, clashes, stale, diagnostics };
}
