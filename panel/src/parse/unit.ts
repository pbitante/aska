import { didYouMean, err, hasErrors, type Diagnostic } from '../diagnostics';
import { SEVERITIES, type Severity, type UnitDoc } from '../model/types';
import { checkName, severityValue, stringField, warnUnknownFields } from './fields';
import { splitFrontmatter } from './frontmatter';
import { parseList, splitSections, type RawSection } from './sections';

const HEADINGS = {
  'looks for': 'Looks for',
  questions: 'Questions',
  'red flags': 'Red flags',
  'good looks like': 'Good looks like',
} as const;
type HeadingKey = keyof typeof HEADINGS;
const HEADING_KEYS = Object.keys(HEADINGS) as HeadingKey[];

export function parseUnit(file: string, raw: string): { unit?: UnitDoc; diagnostics: Diagnostic[] } {
  const split = splitFrontmatter(file, raw);
  if (!split.fm) return { diagnostics: split.diagnostics };
  const fm = split.fm;
  const ds: Diagnostic[] = [];

  warnUnknownFields(fm, ['name', 'description', 'applies_when', 'threshold'], file, ds);
  const name = stringField(fm, 'name', file, ds, true);
  checkName(name, file, fm, ds);
  if (name === 'outside-scope') {
    ds.push(err('E_FIELD_TYPE', 'unit name "outside-scope" is reserved', { file, line: fm.lineOf(['name']) }, 'Rename the unit; outside-scope is reserved for judgments'));
  }
  const description = stringField(fm, 'description', file, ds, true);
  const appliesWhen = stringField(fm, 'applies_when', file, ds, false);
  let threshold: Severity | undefined;
  if (fm.data.threshold === undefined || fm.data.threshold === null) {
    ds.push(err('E_REQUIRED', 'missing required field "threshold"', { file, line: 2 }, `Add "threshold: medium" (one of ${SEVERITIES.join(', ')})`));
  } else {
    threshold = severityValue(fm.data.threshold, 'threshold', file, fm.lineOf(['threshold']), ds);
  }

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
    ds.push(err('E_PREAMBLE', 'text before the first ## heading is not allowed', { file, line: body.preamble.line }, 'Move it under one of the four headings, or delete it'));
  }
  const found = new Map<HeadingKey, RawSection>();
  const suggested = new Set<HeadingKey>();
  for (const s of body.sections) {
    if (!(HEADING_KEYS as string[]).includes(s.key)) {
      const sug = didYouMean(s.key, HEADING_KEYS);
      if (sug) suggested.add(sug as HeadingKey);
      ds.push(err(
        'E_UNIT_HEADING_UNKNOWN',
        `unknown heading "## ${s.heading}"; a unit has exactly: Looks for, Questions, Red flags, Good looks like`,
        { file, line: s.line },
        sug ? `Did you mean "## ${HEADINGS[sug as HeadingKey]}"?` : 'Remove the heading, or move its text into one of the four sections',
      ));
      continue;
    }
    const key = s.key as HeadingKey;
    if (found.has(key)) {
      ds.push(err('E_HEADING_DUPLICATE', `"## ${s.heading}" appears more than once`, { file, line: s.line }, 'Merge the two sections'));
      continue;
    }
    found.set(key, s);
  }
  for (const key of HEADING_KEYS) {
    if (!found.has(key) && !suggested.has(key) && !body.unclosedFence) {
      ds.push(err('E_HEADING_MISSING', `missing required heading "## ${HEADINGS[key]}"`, { file, line: fm.bodyStartLine }, `Add a "## ${HEADINGS[key]}" section`));
    }
  }

  const prose = (key: HeadingKey): string => {
    const s = found.get(key);
    if (s && s.text === '') ds.push(err('E_SECTION_EMPTY', `"## ${s.heading}" is empty`, { file, line: s.line }, 'Add text under the heading, or remove it'));
    return s?.text ?? '';
  };
  const list = (key: HeadingKey): string[] => {
    const s = found.get(key);
    if (!s) return [];
    if (s.text === '') {
      ds.push(err('E_SECTION_EMPTY', `"## ${s.heading}" is empty`, { file, line: s.line }, 'Add at least one bullet item, or remove the heading'));
      return [];
    }
    const r = parseList(s.text, s.textLine);
    if (r.badLine !== undefined) {
      const fix = r.badEmpty ? 'That bullet has no text; add text after the "-", or remove it' : 'Start each item with "- "';
      ds.push(err('E_LIST_FORMAT', `"## ${s.heading}" must be a bullet list`, { file, line: r.badLine }, fix));
    }
    return r.items;
  };
  const looksFor = prose('looks for');
  const questions = list('questions');
  const redFlags = list('red flags');
  const goodLooksLike = prose('good looks like');

  if (hasErrors(ds) || !name || !description || !threshold) return { diagnostics: ds };
  return {
    unit: { name, description, appliesWhen, threshold, looksFor, questions, redFlags, goodLooksLike, loc: { file, line: 1 } },
    diagnostics: ds,
  };
}
