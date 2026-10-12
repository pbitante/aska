import { readFileSync } from 'node:fs';
import { err, type Diagnostic } from '../diagnostics';
import type { FileKind, FileRef, ScopeKind } from '../model/types';
import { splitFrontmatter } from '../parse/frontmatter';
import { parsePanel } from '../parse/panel';
import { parsePersona } from '../parse/persona';
import { splitSections } from '../parse/sections';
import { parseUnit } from '../parse/unit';
import type { Registry } from '../scopes/registry';
import { hashOf } from './files';

export interface ShowResult {
  kind: FileKind;
  name: string;
  canonical: string;
  scope: ScopeKind;
  plugin: string | null;
  path: string;
  hash: string;
  raw: string;
  fields: Record<string, unknown>;
  sections: Record<string, string>;
  diagnostics: Diagnostic[];
}

export function findFile(reg: Registry, kind: FileKind, name: string, scope?: ScopeKind): { file?: FileRef; diagnostic?: Diagnostic } {
  if (scope === undefined) {
    const l = reg.lookup(kind, name);
    return l.file ? { file: l.file } : { diagnostic: l.diagnostic };
  }
  const namespaced = name.includes(':');
  const hits = reg.all(kind).filter((f) => f.scope.kind === scope && (namespaced ? f.canonical === name : f.name === name));
  if (hits.length === 1) return { file: hits[0] };
  if (hits.length === 0) {
    return { diagnostic: err('E_UNKNOWN_REF', `no ${kind} named "${name}" in ${scope} scope`, undefined, `Run: persona list ${kind}s`) };
  }
  return { diagnostic: err('E_AMBIGUOUS', `"${name}" is defined by more than one plugin`, undefined, `Use one of: ${hits.map((h) => h.canonical).join(', ')}`) };
}

export function showFile(file: FileRef): ShowResult {
  const raw = readFileSync(file.path, 'utf8');
  const split = splitFrontmatter(file.path, raw);
  const sections: Record<string, string> = {};
  if (split.fm) {
    const body = splitSections(split.fm.body, split.fm.bodyStartLine);
    if (body.preamble) sections[''] = body.preamble.text;
    for (const s of body.sections) sections[s.heading] = s.text;
  }
  const parsed = file.kind === 'unit' ? parseUnit(file.path, raw) : file.kind === 'panel' ? parsePanel(file.path, raw) : parsePersona(file.path, raw);
  return {
    kind: file.kind,
    name: file.name,
    canonical: file.canonical,
    scope: file.scope.kind,
    plugin: file.scope.kind === 'plugin' ? (file.scope.plugin ?? null) : null,
    path: file.path,
    hash: hashOf(raw),
    raw,
    fields: split.fm?.data ?? {},
    sections,
    diagnostics: parsed.diagnostics,
  };
}
