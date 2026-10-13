import { didYouMean, err, hasErrors, warn, type Diagnostic } from '../diagnostics';
import type {
  CapabilityDecl,
  CapabilityKind,
  EntryTier,
  JudgmentSectionDecl,
  Loc,
  OverrideEntry,
  PersonaDoc,
  Section,
  UnitEntry,
} from '../model/types';
import { REF, checkName, hint, isPlainObject, modelField, severityValue, stringField, stringList, warnUnknownFields } from './fields';
import { splitFrontmatter } from './frontmatter';
import { sectionKey, splitSections } from './sections';

const PERSONA_FIELDS = ['name', 'description', 'extends', 'model', 'units', 'judgment', 'capabilities', 'overrides'];
const UNIT_KEYS = ['primary', 'secondary', 'deprioritized', 'exclude', 'primary_order'];
const ALL_SETTINGS = ['threshold', 'add_questions', 'add_red_flags', 'note'];
const TIER_SETTINGS: Record<EntryTier, readonly string[]> = {
  primary: ['threshold', 'add_questions', 'add_red_flags'],
  secondary: ['threshold'],
  deprioritized: ['note'],
  exclude: [],
};
const CORE_JUDGMENT_HEADINGS: readonly string[] = ['verdict', 'conditions', 'missing', 'findings', 'cleared', 'not applicable'];

function parseEntry(
  item: unknown,
  tier: EntryTier,
  file: string,
  path: (string | number)[],
  loc: (p: (string | number)[]) => Loc,
  ds: Diagnostic[],
): UnitEntry | undefined {
  const at = loc(path);
  if (typeof item === 'string') {
    if (!REF.test(item)) {
      ds.push(err('E_FIELD_TYPE', `"${item}" is not a valid unit reference`, at, 'Use a kebab-case name, or plugin:name'));
      return undefined;
    }
    return { ref: item, tier, loc: at };
  }
  if (!isPlainObject(item) || Object.keys(item).length !== 1) {
    ds.push(err('E_FIELD_TYPE', 'a unit entry must be a name, or a single "name: {settings}" mapping', at, 'Use a unit name, or a single "name: {settings}" mapping'));
    return undefined;
  }
  const [ref, settings] = Object.entries(item)[0]!;
  if (!REF.test(ref)) {
    ds.push(err('E_FIELD_TYPE', `"${ref}" is not a valid unit reference`, at, 'Use a kebab-case name, or plugin:name'));
    return undefined;
  }
  const entry: UnitEntry = { ref, tier, loc: at };
  if (settings === null || settings === undefined) return entry;
  if (!isPlainObject(settings)) {
    ds.push(err('E_FIELD_TYPE', `settings for ${ref} must be a mapping`, at, `Write settings for ${ref} as "key: value" pairs`));
    return undefined;
  }
  for (const [k, v] of Object.entries(settings)) {
    const settingAt = loc([...path, ref, k]);
    if (!ALL_SETTINGS.includes(k)) {
      ds.push(err('E_SETTING_UNKNOWN', `unknown setting "${k}" on ${ref}`, settingAt, hint(k, ALL_SETTINGS) ?? `Remove "${k}", or use one of ${ALL_SETTINGS.join(', ')}`));
      continue;
    }
    if (!TIER_SETTINGS[tier].includes(k)) {
      ds.push(err(
        'E_SETTING_TIER',
        `"${k}" is not allowed in ${tier}; ${tier} allows ${TIER_SETTINGS[tier].join(', ') || 'no settings'}`,
        settingAt,
        `Remove "${k}", or move ${ref} to a tier that allows it`,
      ));
      continue;
    }
    if (k === 'threshold') {
      entry.threshold = severityValue(v, `threshold for ${ref}`, file, settingAt.line, ds);
    } else if (k === 'note') {
      if (typeof v === 'string' && v.trim() !== '') entry.note = v.trim();
      else ds.push(err('E_FIELD_TYPE', `note for ${ref} must be a non-empty string`, settingAt, `Set note to a non-empty string`));
    } else {
      const list = stringList(v);
      if (!list) ds.push(err('E_FIELD_TYPE', `${k} for ${ref} must be a list of strings`, settingAt, `Set ${k} to a list of strings`));
      else if (k === 'add_questions') entry.addQuestions = list;
      else entry.addRedFlags = list;
    }
  }
  return entry;
}

export function parsePersona(file: string, raw: string): { persona?: PersonaDoc; diagnostics: Diagnostic[] } {
  const split = splitFrontmatter(file, raw);
  if (!split.fm) return { diagnostics: split.diagnostics };
  const fm = split.fm;
  const ds: Diagnostic[] = [];
  const loc = (path: (string | number)[]): Loc => ({ file, line: fm.lineOf(path) });

  warnUnknownFields(fm, PERSONA_FIELDS, file, ds);
  const name = stringField(fm, 'name', file, ds, true);
  checkName(name, file, fm, ds);
  const descriptionHadTypeError = fm.data.description !== undefined && fm.data.description !== null && typeof fm.data.description !== 'string';
  const description = stringField(fm, 'description', file, ds, false);
  const ext = stringField(fm, 'extends', file, ds, false);
  const isChild = fm.data.extends !== undefined && fm.data.extends !== null;
  if (ext !== undefined && !REF.test(ext)) {
    ds.push(err('E_FIELD_TYPE', `extends "${ext}" is not a valid persona reference`, loc(['extends']), 'Use a kebab-case name, or plugin:name'));
  }
  const model = modelField(fm, file, ds);

  // units
  const units: UnitEntry[] = [];
  let primaryOrder: PersonaDoc['primaryOrder'];
  let primaryTypeError = false;
  const u = fm.data.units;
  if (u !== undefined && u !== null) {
    if (!isPlainObject(u)) ds.push(err('E_FIELD_TYPE', 'units must be a mapping of tiers', loc(['units']), `Write units as a mapping of ${UNIT_KEYS.join(', ')}`));
    else {
      for (const key of Object.keys(u)) {
        if (!UNIT_KEYS.includes(key)) {
          ds.push(err('E_FIELD_UNKNOWN', `unknown key units.${key}`, loc(['units', key]), hint(key, UNIT_KEYS) ?? `Use one of ${UNIT_KEYS.join(', ')}`));
          continue;
        }
        const list = u[key];
        if (list === null || list === undefined) continue;
        if (!Array.isArray(list)) {
          ds.push(err('E_FIELD_TYPE', `units.${key} must be a list`, loc(['units', key]), `Write units.${key} as a YAML list`));
          if (key === 'primary') primaryTypeError = true;
          continue;
        }
        if (key === 'primary_order') {
          const refs: string[] = [];
          list.forEach((r, i) => {
            if (typeof r !== 'string' || !REF.test(r)) {
              ds.push(err('E_PRIMARY_ORDER', `primary_order entries must be unit references`, loc(['units', key, i]), 'Use kebab-case unit references, or plugin:name'));
            } else if (refs.includes(r)) {
              ds.push(err('E_PRIMARY_ORDER', `${r} is listed twice in primary_order`, loc(['units', key, i]), 'Remove the duplicate entry'));
            } else refs.push(r);
          });
          primaryOrder = { refs, loc: loc(['units', key]) };
          continue;
        }
        list.forEach((item, i) => {
          const entry = parseEntry(item, key as EntryTier, file, ['units', key, i], loc, ds);
          if (entry) units.push(entry);
        });
      }
    }
  }
  const seen = new Map<string, UnitEntry>();
  for (const e of units) {
    const prev = seen.get(e.ref);
    if (prev) {
      const message = prev.tier === e.tier ? `${e.ref} is listed twice in ${e.tier}` : `${e.ref} appears in both ${prev.tier} and ${e.tier}`;
      ds.push(err('E_DUPLICATE_UNIT', message, e.loc, 'Keep it in one tier only'));
    } else seen.set(e.ref, e);
  }

  // judgment
  const judgmentSections: JudgmentSectionDecl[] = [];
  const j = fm.data.judgment;
  if (j !== undefined && j !== null) {
    if (!isPlainObject(j)) ds.push(err('E_FIELD_TYPE', 'judgment must be a mapping', loc(['judgment']), 'Write judgment as a mapping with a sections list'));
    else {
      for (const k of Object.keys(j)) {
        if (k !== 'sections') ds.push(err('E_FIELD_UNKNOWN', `unknown key judgment.${k}`, loc(['judgment', k]), 'Use judgment.sections'));
      }
      const secs = j.sections;
      if (secs !== undefined && secs !== null) {
        if (!Array.isArray(secs)) ds.push(err('E_FIELD_TYPE', 'judgment.sections must be a list', loc(['judgment', 'sections']), 'Write judgment.sections as a YAML list'));
        else {
          secs.forEach((s, i) => {
            const at = loc(['judgment', 'sections', i]);
            if (!isPlainObject(s) || typeof s.name !== 'string' || !s.name.trim() || typeof s.ask !== 'string' || !s.ask.trim()) {
              ds.push(err('E_FIELD_TYPE', 'each judgment section needs a non-empty name and ask', at, 'Give the section a non-empty name and ask'));
              return;
            }
            const extra = Object.keys(s).filter((x) => x !== 'name' && x !== 'ask');
            if (extra.length > 0) {
              ds.push(err(
                'E_FIELD_UNKNOWN',
                `unknown key ${extra.join(', ')} on judgment section ${s.name}`,
                loc(['judgment', 'sections', i, extra[0]!]),
                'A judgment section has only name and ask',
              ));
              return;
            }
            const key = sectionKey(s.name);
            if (CORE_JUDGMENT_HEADINGS.includes(key)) {
              ds.push(err('E_JUDGMENT_SECTION', `"${s.name}" collides with a core judgment heading`, at, 'Choose a different section name'));
            } else if (judgmentSections.some((x) => sectionKey(x.name) === key)) {
              ds.push(err('E_JUDGMENT_SECTION', `judgment section "${s.name}" is defined twice`, at, 'Section names must be unique, ignoring case'));
            } else {
              judgmentSections.push({ name: s.name.trim(), ask: s.ask.trim(), loc: at });
            }
          });
        }
      }
    }
  }

  // capabilities
  const capabilities: CapabilityDecl[] = [];
  const tools: string[] = [];
  const c = fm.data.capabilities;
  if (c !== undefined && c !== null) {
    if (!isPlainObject(c)) ds.push(err('E_FIELD_TYPE', 'capabilities must be a mapping', loc(['capabilities']), 'Write capabilities as a mapping with skills, mcp and/or tools'));
    else {
      for (const [k, v] of Object.entries(c)) {
        if (k === 'tools') {
          const list = stringList(v);
          if (!list) ds.push(err('E_FIELD_TYPE', 'capabilities.tools must be a list of tool names', loc(['capabilities', k]), 'Write capabilities.tools as a list of tool names'));
          else tools.push(...list);
          continue;
        }
        if (k !== 'skills' && k !== 'mcp') {
          ds.push(err('E_FIELD_UNKNOWN', `unknown key capabilities.${k}`, loc(['capabilities', k]), hint(k, ['skills', 'mcp', 'tools']) ?? 'Use one of skills, mcp, tools'));
          continue;
        }
        if (!Array.isArray(v)) {
          ds.push(err('E_FIELD_TYPE', `capabilities.${k} must be a list`, loc(['capabilities', k]), `Write capabilities.${k} as a YAML list`));
          continue;
        }
        v.forEach((d, i) => {
          const at = loc(['capabilities', k, i]);
          if (!isPlainObject(d) || typeof d.name !== 'string' || !d.name.trim() || typeof d.when !== 'string' || !d.when.trim()) {
            ds.push(err('E_FIELD_TYPE', `each ${k} capability needs a non-empty name and when`, at, 'Give the capability a non-empty name and when'));
            return;
          }
          const extra = Object.keys(d).filter((x) => x !== 'name' && x !== 'when');
          if (extra.length > 0) {
            ds.push(err(
              'E_FIELD_UNKNOWN',
              `unknown key ${extra.join(', ')} on ${k} capability ${d.name}`,
              loc(['capabilities', k, i, extra[0]!]),
              'A capability has only name and when',
            ));
            return;
          }
          const trimmedName = d.name.trim();
          if (capabilities.some((x) => x.kind === k && x.name === trimmedName)) {
            ds.push(err('E_DUPLICATE', `${k} capability ${trimmedName} is declared twice`, at, 'Remove the duplicate declaration, or rename one of them'));
            return;
          }
          capabilities.push({ kind: k as CapabilityKind, name: trimmedName, when: d.when.trim(), loc: at });
        });
      }
    }
  }

  // overrides
  const overrides: OverrideEntry[] = [];
  const o = fm.data.overrides;
  if (o !== undefined && o !== null) {
    if (!isPlainObject(o)) ds.push(err('E_FIELD_TYPE', 'overrides must be a mapping of clash id to child or parent', loc(['overrides']), 'Write overrides as a mapping of clash id to "child" or "parent"'));
    else {
      for (const [k, v] of Object.entries(o)) {
        const at = loc(['overrides', k]);
        if (v !== 'child' && v !== 'parent') ds.push(err('E_OVERRIDE_VALUE', `overrides.${k} must be "child" or "parent"`, at, 'Set it to "child" or "parent"'));
        else overrides.push({ key: k, value: v, loc: at });
      }
    }
  }

  if (!isChild) {
    const needs = (what: string, present: boolean, at: Loc) => {
      if (present) ds.push(err('E_NEEDS_EXTENDS', `${what} is only valid in a persona that extends another`, at, 'Add extends: <parent>, or remove it'));
    };
    const hasUnitKey = (key: string) => isPlainObject(u) && Object.prototype.hasOwnProperty.call(u, key);
    needs('units.exclude', hasUnitKey('exclude'), loc(['units', 'exclude']));
    needs('units.primary_order', hasUnitKey('primary_order'), loc(['units', 'primary_order']));
    needs('overrides', o !== undefined && o !== null, loc(['overrides']));
  }

  // body
  const body = splitSections(fm.body, fm.bodyStartLine);
  if (body.unclosedFence) {
    ds.push(err(
      'E_FENCE_UNCLOSED',
      'a fenced code block is never closed',
      { file, line: body.unclosedFence.line },
      `Close the fence opened on line ${body.unclosedFence.line}`,
    ));
  }
  if (body.preamble) {
    ds.push(err('E_PREAMBLE', 'text before the first ## heading is not allowed', { file, line: body.preamble.line }, 'Put it under a ## heading, or delete it'));
  }
  let stance: Section | undefined;
  let tieBreaking: Section | undefined;
  const extraSections: Section[] = [];
  const keys = new Set<string>();
  const nearMissHeading = new Map<'stance' | 'tie-breaking', string>();
  for (const s of body.sections) {
    const sec: Section = { heading: s.heading.trim(), key: s.key, text: s.text, loc: { file, line: s.line } };
    if (keys.has(s.key)) {
      ds.push(err('E_HEADING_DUPLICATE', `"## ${s.heading}" appears more than once`, sec.loc, 'Merge the two sections'));
      continue;
    }
    keys.add(s.key);
    if (s.text === '') ds.push(err('E_SECTION_EMPTY', `"## ${s.heading}" is empty`, sec.loc, 'Add text under the heading, or remove it'));
    if (s.key === 'stance') stance = sec;
    else if (s.key === 'tie-breaking') tieBreaking = sec;
    else {
      extraSections.push(sec);
      const near = didYouMean(s.key, ['stance', 'tie-breaking']) as 'stance' | 'tie-breaking' | undefined;
      if (near) {
        if (!nearMissHeading.has(near)) nearMissHeading.set(near, s.heading);
        const canonicalHeading = near === 'stance' ? 'Stance' : 'Tie-breaking';
        ds.push(warn(
          'W_SECTION_NEAR_MISS',
          `"## ${s.heading}" looks like it might be meant as "## ${canonicalHeading}"`,
          sec.loc,
          `Rename "## ${s.heading}" to "## ${canonicalHeading}" if that's what you meant`,
        ));
      }
    }
  }

  if (!isChild) {
    const root = (ok: boolean, what: string, fix: string) => {
      if (!ok) ds.push(err('E_ROOT_REQUIRED', `a persona without extends needs ${what}`, { file, line: 1 }, fix));
    };
    root(description !== undefined || descriptionHadTypeError, 'a description', 'Add "description: ..." to the frontmatter');
    root(
      units.some((e) => e.tier === 'primary') || primaryTypeError,
      'at least one primary unit',
      'Add a unit under units.primary',
    );
    root(
      stance !== undefined,
      'a "## Stance" section',
      nearMissHeading.has('stance') ? `Rename "## ${nearMissHeading.get('stance')}" to "## Stance"` : 'Add a "## Stance" section',
    );
    root(
      tieBreaking !== undefined,
      'a "## Tie-breaking" section',
      nearMissHeading.has('tie-breaking') ? `Rename "## ${nearMissHeading.get('tie-breaking')}" to "## Tie-breaking"` : 'Add a "## Tie-breaking" section',
    );
  }

  if (hasErrors(ds) || name === undefined) return { diagnostics: ds };
  return {
    persona: {
      name,
      description,
      extends: ext,
      extendsLoc: ext !== undefined ? loc(['extends']) : undefined,
      model,
      units,
      primaryOrder,
      judgmentSections,
      capabilities,
      tools,
      overrides,
      stance,
      tieBreaking,
      extraSections,
      loc: { file, line: 1 },
    },
    diagnostics: ds,
  };
}
