import { basename } from 'node:path';
import { didYouMean, err, warn, type Diagnostic } from '../diagnostics';
import { PANEL_MODELS, SEVERITIES, isPanelModel, type PanelModel, type Severity } from '../model/types';
import type { Frontmatter } from './frontmatter';

export const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const REF = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*:)?[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function hint(value: string, options: readonly string[]): string | undefined {
  const s = didYouMean(value, options);
  return s ? `Did you mean "${s}"?` : undefined;
}

export function stringField(fm: Frontmatter, key: string, file: string, ds: Diagnostic[], required: boolean): string | undefined {
  const v = fm.data[key];
  if (v === undefined || v === null) {
    if (required) ds.push(err('E_REQUIRED', `missing required field "${key}"`, { file, line: 2 }, `Add "${key}: ..." to the frontmatter`));
    return undefined;
  }
  if (typeof v !== 'string' || v.trim() === '') {
    ds.push(err('E_FIELD_TYPE', `"${key}" must be a non-empty string`, { file, line: fm.lineOf([key]) }, `Set "${key}" to a non-empty string`));
    return undefined;
  }
  return v.trim();
}

export function checkName(name: string | undefined, file: string, fm: Frontmatter, ds: Diagnostic[]): void {
  if (name === undefined) return;
  const line = fm.lineOf(['name']);
  if (!KEBAB.test(name)) {
    ds.push(err('E_FIELD_TYPE', `name "${name}" must be kebab-case (a-z, 0-9, -)`, { file, line }, 'Use only lowercase letters, digits and hyphens'));
    return;
  }
  const file0 = basename(file);
  const typed = /^(.*)\.(persona|unit|panel)\.md$/.exec(file0);
  const suffix = typed ? `.${typed[2]}.md` : '.md';
  const expected = typed ? typed[1]! : basename(file, '.md');
  if (name !== expected) {
    const fix = KEBAB.test(expected)
      ? `Rename the file to ${name}${suffix}, or set name: ${expected}`
      : `Rename the file to ${name}${suffix}`;
    ds.push(err('E_NAME_MISMATCH', `name "${name}" does not match the filename "${expected}${suffix}"`, { file, line }, fix));
  }
}

export function severityValue(v: unknown, what: string, file: string, line: number, ds: Diagnostic[]): Severity | undefined {
  if (typeof v === 'string' && (SEVERITIES as readonly string[]).includes(v)) return v as Severity;
  const fallback = `Use one of ${SEVERITIES.join(', ')}`;
  ds.push(err('E_SEVERITY', `${what} must be one of ${SEVERITIES.join(', ')}`, { file, line }, (typeof v === 'string' && hint(v, SEVERITIES)) || fallback));
  return undefined;
}

export function stringList(v: unknown): string[] | undefined {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string' && x.trim() !== '')) return undefined;
  return (v as string[]).map((x) => x.trim());
}

export function modelField(fm: Frontmatter, file: string, ds: Diagnostic[]): PanelModel | undefined {
  const v = fm.data.model;
  if (v === undefined || v === null) return undefined;
  const at = { file, line: fm.lineOf(['model']) };
  const allowed = `one of ${PANEL_MODELS.join(', ')}`;
  if (typeof v !== 'string') {
    ds.push(err('E_FIELD_TYPE', `"model" must be ${allowed}`, at, `Set "model" to ${allowed}`));
    return undefined;
  }
  if (!isPanelModel(v)) {
    ds.push(err('E_PERSONA_MODEL', `unknown model "${v}"`, at, hint(v, PANEL_MODELS) ?? `Use ${allowed}`));
    return undefined;
  }
  return v;
}

export function warnUnknownFields(fm: Frontmatter, known: readonly string[], file: string, ds: Diagnostic[]): void {
  for (const k of Object.keys(fm.data)) {
    if (!known.includes(k)) ds.push(warn('W_UNKNOWN_FIELD', `unknown field "${k}" is ignored`, { file, line: fm.lineOf([k]) }, hint(k, known) ?? `Remove "${k}", or check for a typo`));
  }
}
