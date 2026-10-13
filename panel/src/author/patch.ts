import { isMap, isScalar, isSeq, parseDocument, type Document } from 'yaml';
import { err, warn, type Diagnostic } from '../diagnostics';
import { PANEL_MODELS, SEVERITIES, TIERS, isPanelModel, type FileKind, type Tier } from '../model/types';
import { REF } from '../parse/fields';
import { normalizeSource, splitFrontmatter } from '../parse/frontmatter';
import { sectionKey } from '../parse/sections';
import { hasHeadingLine, replaceSection } from './body';

interface Patch {
  set?: Record<string, unknown>;
  unset?: string[];
  sections?: Record<string, string>;
}

const OWNED: Record<FileKind, { fields: readonly string[]; sections: readonly string[] }> = {
  unit: { fields: ['description', 'applies_when', 'threshold'], sections: ['Looks for', 'Questions', 'Red flags', 'Good looks like'] },
  panel: { fields: ['description', 'personas'], sections: [''] },
  persona: { fields: ['description', 'model', 'units.primary', 'units.secondary', 'units.deprioritized'], sections: ['Stance', 'Tie-breaking'] },
};
// Settings the forms don't edit but must not drop while an entry stays in a tier that allows them.
const KEPT: Record<Tier, readonly string[]> = { primary: ['add_questions', 'add_red_flags'], secondary: [], deprioritized: [] };

export function templateFor(kind: FileKind, name: string, extendsRef?: string): string {
  if (kind === 'persona' && extendsRef) return `---\nname: ${name}\nextends: ${extendsRef}\n---\n`;
  if (kind === 'unit') return `---\nname: ${name}\ndescription: ""\nthreshold: medium\n---\n\n## Looks for\n\n## Questions\n\n## Red flags\n\n## Good looks like\n`;
  if (kind === 'panel') return `---\nname: ${name}\ndescription: ""\npersonas: []\n---\n`;
  return `---\nname: ${name}\ndescription: ""\nunits:\n  primary: []\n---\n\n## Stance\n\n## Tie-breaking\n`;
}

type Entry = { ref: string; threshold?: string; note?: string };
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function checkValue(kind: FileKind, path: string, v: unknown): string | undefined {
  if (path === 'description' || path === 'applies_when') return typeof v === 'string' ? undefined : `"${path}" must be a string`;
  if (path === 'extends') return typeof v === 'string' && REF.test(v) ? undefined : '"extends" must be a valid persona reference';
  if (path === 'threshold') return typeof v === 'string' && (SEVERITIES as readonly string[]).includes(v) ? undefined : `"threshold" must be one of ${SEVERITIES.join(', ')}`;
  if (path === 'personas') return Array.isArray(v) && v.every((x) => typeof x === 'string' && REF.test(x)) ? undefined : '"personas" must be a list of persona names';
  if (path === 'model') return isPanelModel(v) ? undefined : `"model" must be one of ${PANEL_MODELS.join(', ')}`;
  if (path.startsWith('units.')) {
    if (!Array.isArray(v)) return `"${path}" must be a list of { ref, threshold?, note? }`;
    for (const e of v) {
      if (!isObj(e) || typeof e.ref !== 'string' || !REF.test(e.ref)) return `every entry in "${path}" needs a valid "ref"`;
      const extra = Object.keys(e).filter((k) => k !== 'ref' && k !== 'threshold' && k !== 'note');
      if (extra.length > 0) return `"${extra[0]}" can't be set through patch; use save to edit it`;
      if (e.threshold !== undefined && !(SEVERITIES as readonly string[]).includes(String(e.threshold))) return `bad threshold on ${e.ref}`;
      if (e.note !== undefined && typeof e.note !== 'string') return `the note on ${e.ref} must be a string`;
    }
    return undefined;
  }
  return `"${path}" can't be patched on a ${kind}; use save to edit it`;
}

function validatePatch(kind: FileKind, patch: unknown, creating: boolean): string | undefined {
  if (!isObj(patch)) return 'the patch must be a JSON object';
  const extraKeys = Object.keys(patch).filter((k) => k !== 'set' && k !== 'unset' && k !== 'sections');
  if (extraKeys.length > 0) return `unknown patch key "${extraKeys[0]}"; use set, unset and sections`;
  const owned = OWNED[kind];
  if (patch.set !== undefined) {
    if (!isObj(patch.set)) return '"set" must be an object of path: value';
    for (const [p, v] of Object.entries(patch.set)) {
      if (p === 'extends' && kind === 'persona') {
        if (!creating) return '"extends" can only be set when creating a persona; use save to change it';
      } else if (!owned.fields.includes(p)) {
        return `"${p}" can't be patched on a ${kind}; use save to edit it`;
      }
      const bad = checkValue(kind, p, v);
      if (bad) return bad;
    }
  }
  if (patch.unset !== undefined) {
    if (!Array.isArray(patch.unset) || !patch.unset.every((p) => typeof p === 'string')) return '"unset" must be a list of paths';
    for (const p of patch.unset as string[]) if (!owned.fields.includes(p)) return `"${p}" can't be patched on a ${kind}; use save to edit it`;
  }
  if (patch.sections !== undefined) {
    if (!isObj(patch.sections)) return '"sections" must be an object of heading: text';
    for (const [h, t] of Object.entries(patch.sections)) {
      if (!owned.sections.some((o) => sectionKey(o) === sectionKey(h))) return `section "${h}" can't be patched on a ${kind}; use save to edit it`;
      if (typeof t !== 'string') return `section "${h}" must be text`;
      if (hasHeadingLine(t)) return `section "${h}" can't contain a "## " heading line; use save to edit headings`;
    }
  }
  return undefined;
}

function tierSettings(doc: Document, tier: Tier): Map<string, Record<string, unknown>> {
  const node = doc.getIn(['units', tier]);
  const out = new Map<string, Record<string, unknown>>();
  if (!isSeq(node)) return out;
  for (const item of node.toJSON() as unknown[]) {
    if (typeof item === 'string') out.set(item, {});
    else if (isObj(item)) {
      const [ref, s] = Object.entries(item)[0] ?? [];
      if (ref) out.set(ref, isObj(s) ? s : {});
    }
  }
  return out;
}

function entryValue(e: Entry, kept: Record<string, unknown>): unknown {
  const settings: Record<string, unknown> = {};
  if (e.threshold !== undefined) settings.threshold = e.threshold;
  if (e.note !== undefined) settings.note = e.note;
  Object.assign(settings, kept);
  return Object.keys(settings).length === 0 ? e.ref : { [e.ref]: settings };
}

// A bare `units:` (null) is as-good-as-absent and becomes a fresh map; any other non-mapping
// value (a scalar or a list) is a fault in the existing file, reported at its own line.
function ensureUnitsMap(doc: Document, file: string, lineOf: (path: readonly (string | number)[]) => number): Diagnostic | undefined {
  const node = doc.get('units', true);
  const empty = node === undefined || (isScalar(node) && node.value === null);
  if (empty) {
    doc.setIn(['units'], doc.createNode({}));
    return undefined;
  }
  if (!isMap(node)) {
    return err('E_FIELD_TYPE', 'units must be a mapping of tiers', { file, line: lineOf(['units']) }, `Write units as a mapping of ${TIERS.join(', ')}`);
  }
  return undefined;
}

export function applyPatch(
  kind: FileKind,
  name: string,
  existing: string | undefined,
  patch: unknown,
  path?: string,
): { raw?: string; usage?: string; errors?: Diagnostic[]; warnings: Diagnostic[] } {
  const creating = existing === undefined;
  const bad = validatePatch(kind, patch, creating);
  if (bad) return { usage: bad, warnings: [] };
  const p = patch as Patch;
  const extendsRef = kind === 'persona' && creating && typeof p.set?.extends === 'string' ? p.set.extends : undefined;
  const base = existing ?? templateFor(kind, name, extendsRef);
  const file = path ?? name;
  // A broken existing file (no frontmatter block, invalid YAML, or a non-mapping document) is a
  // fault in the file, not in the patch, so it's reported as an error diagnostic, not a usage error.
  const split = splitFrontmatter(file, base);
  if (!split.fm) return { errors: split.diagnostics, warnings: [] };
  const fm = split.fm;
  const lines = normalizeSource(base).split('\n');
  const doc = parseDocument(lines.slice(1, fm.bodyStartLine - 2).join('\n'));
  let body = fm.body;

  const setEntries = Object.entries(p.set ?? {});
  const unsetPaths = p.unset ?? [];
  if (setEntries.some(([k]) => k.startsWith('units.')) || unsetPaths.some((k) => k.startsWith('units.'))) {
    const unitsFault = ensureUnitsMap(doc, file, fm.lineOf);
    if (unitsFault) return { errors: [unitsFault], warnings: [] };
  }

  const oldPrimary = tierSettings(doc, 'primary');
  for (const [fieldPath, value] of setEntries) {
    if (fieldPath === 'extends') continue;
    const keys = fieldPath.split('.');
    if (keys[0] === 'units') {
      const tier = keys[1] as Tier;
      const before = tierSettings(doc, tier);
      const entries = (value as Entry[]).map((e) => {
        const prev = before.get(e.ref) ?? {};
        const kept = Object.fromEntries(Object.entries(prev).filter(([k]) => KEPT[tier].includes(k)));
        return entryValue(e, kept);
      });
      doc.setIn(keys, doc.createNode(entries));
    } else {
      doc.setIn(keys, doc.createNode(value));
    }
  }
  for (const fieldPath of unsetPaths) doc.deleteIn(fieldPath.split('.'));
  const owned = OWNED[kind];
  for (const [heading, text] of Object.entries(p.sections ?? {})) {
    const canonical = owned.sections.find((o) => sectionKey(o) === sectionKey(heading)) ?? heading;
    body = replaceSection(body, canonical, text);
  }

  const warnings: Diagnostic[] = [];
  const newPrimary = tierSettings(doc, 'primary');
  for (const [ref, s] of oldPrimary) {
    const dropped = KEPT.primary.filter((k) => s[k] !== undefined);
    if (dropped.length > 0 && !newPrimary.has(ref)) {
      warnings.push(warn('W_DROPPED_SETTINGS', `${dropped.join(' and ')} on ${ref} were dropped because it left primary`, undefined,
        `Add ${ref} back to primary to keep them, or re-add them with save`));
    }
  }
  // flowCollectionPadding: false keeps an untouched `[a, b]` as written; the default re-renders it `[ a, b ]`.
  return { raw: `---\n${doc.toString({ lineWidth: 0, flowCollectionPadding: false })}---\n${body}`, warnings };
}
