import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { Diagnostic } from '../diagnostics';
import type { Scope } from '../model/types';
import { checkLibrary } from '../library';
import { Registry } from '../scopes/registry';

export interface CheckTarget {
  scope: { kind: 'project' | 'user'; root: string };
  path: string;
}

export interface CheckResult {
  own: Diagnostic[];
  broken: Diagnostic[];
}

const keyOf = (d: Diagnostic): string => `${d.level}|${d.code}|${d.loc?.file ?? ''}|${d.loc?.line ?? ''}|${d.message}`;
const dedupe = (ds: Diagnostic[]): Diagnostic[] => [...new Map(ds.map((d) => [keyOf(d), d])).values()];

// Everything `validate` (no name) would report about units, personas and panels, without the
// render staleness checks (they're about generated files, not the library).
export function collectAll(scopes: readonly Scope[]): Diagnostic[] {
  const reg = new Registry(scopes);
  const c = checkLibrary(reg, new Registry(scopes.filter((s) => s.kind !== 'project')));
  return dedupe([
    ...reg.diagnostics,
    ...c.units.flatMap((u) => u.diagnostics),
    ...c.personas.flatMap((p) => p.result.diagnostics),
    ...c.panels.flatMap((p) => p.diagnostics),
  ]);
}

// Copies the target scope's personas folder into a temporary folder, puts the candidate in (or
// removes the file when content is null), and collects diagnostics as if that were the real
// scope. Nothing outside the temporary folder is touched.
export function checkInPlace(scopes: readonly Scope[], target: CheckTarget, content: string | null): CheckResult {
  const baseline = new Set(collectAll(scopes).map(keyOf));
  const staging = mkdtempSync(join(tmpdir(), 'aska-check-'));
  try {
    const dst = join(staging, 'personas');
    mkdirSync(dst, { recursive: true });
    const src = join(target.scope.root, 'personas');
    if (existsSync(src)) cpSync(src, dst, { recursive: true, dereference: true });
    const stagedFile = join(dst, basename(target.path));
    rmSync(stagedFile, { force: true });
    if (content !== null) writeFileSync(stagedFile, content);
    const stagedScope: Scope = { kind: target.scope.kind, root: staging };
    const present = scopes.some((s) => s.kind === target.scope.kind);
    const staged = present ? scopes.map((s) => (s.kind === target.scope.kind ? stagedScope : s)) : [stagedScope, ...scopes];
    const unstage = (s: string): string => s.split(staging).join(target.scope.root);
    const all = dedupe(collectAll(staged).map((d) => ({
      ...d,
      message: unstage(d.message),
      fix: d.fix === undefined ? undefined : unstage(d.fix),
      loc: d.loc === undefined ? undefined : { ...d.loc, file: unstage(d.loc.file) },
    })));
    return {
      own: all.filter((d) => d.loc?.file === target.path),
      broken: all.filter((d) => d.level === 'error' && d.loc?.file !== target.path && !baseline.has(keyOf(d))),
    };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
