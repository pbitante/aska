import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, sep } from 'node:path';
import { err, formatDiagnostic, hasErrors, type Diagnostic } from '../diagnostics';
import { findFile, showFile } from '../author/show';
import { checkInPlace, type CheckResult } from '../author/check';
import { diagnosticJson, hashOf, scopeRoot, staleCheck, targetPath, writeFault, type WriteScope } from '../author/files';
import { isSymlink, readIfExists, safeRealpath, writeAtomic } from '../fs';
import { applyPatch } from '../author/patch';
import { splitFrontmatter } from '../parse/frontmatter';
import type { FileKind } from '../model/types';
import type { Discovery } from '../scopes/discover';
import { Registry, SUFFIX } from '../scopes/registry';
import type { CliEnv, ParsedArgv } from './main';

export type AuthorArgs = Extract<ParsedArgv, { kind: 'author' }>;

function printDiagnostics(ds: readonly Diagnostic[], env: CliEnv): void {
  for (const d of ds) env.out(formatDiagnostic(d));
}

function show(d: Discovery, a: AuthorArgs, env: CliEnv): number {
  const reg = new Registry(d.scopes);
  const found = findFile(reg, a.fileKind, a.name, a.scope);
  if (!found.file) {
    if (a.json) env.out(JSON.stringify({ diagnostics: [diagnosticJson(found.diagnostic!)] }, null, 2));
    else printDiagnostics([found.diagnostic!], env);
    return 1;
  }
  const s = showFile(found.file);
  if (a.json) env.out(JSON.stringify({ ...s, diagnostics: s.diagnostics.map(diagnosticJson) }, null, 2));
  else env.out(s.raw);
  return 0;
}

interface WriteOutcome { written: boolean; path: string | null; hash: string | null; diagnostics: Diagnostic[] }

function report(o: WriteOutcome, a: AuthorArgs, env: CliEnv): number {
  if (a.json) {
    env.out(JSON.stringify({ written: o.written, path: o.path, hash: o.hash, diagnostics: o.diagnostics.map(diagnosticJson) }, null, 2));
  } else {
    printDiagnostics(o.diagnostics, env);
    env.out(o.written ? `wrote ${o.path}` : 'refused: nothing was written');
  }
  return o.written ? 0 : 1;
}

interface Located {
  root: string;
  path: string;
  current: string | undefined;
  currentHash: string | null;
}

// Shared by save and patch: finds the target file and runs the stale check. The check and the
// later write aren't locked, so a write landing in between is still lost: --expect-hash catches
// edits made since the caller read the file, not a race with another writer. Reports and returns an
// exit code when there is no scope or the file changed since it was read.
function locate(d: Discovery, a: AuthorArgs, env: CliEnv): Located | { code: number } {
  const root = scopeRoot(d, a.scope as WriteScope, a.cwd, env.home);
  if (!root.root) return { code: report({ written: false, path: null, hash: null, diagnostics: [root.diagnostic!] }, a, env) };
  const path = targetPath(root.root, a.fileKind, a.name);
  const current = readIfExists(path);
  const currentHash = current === undefined ? null : hashOf(current);
  // A project's files come with the repository, so a project-scope link may only point inside the
  // project: otherwise a cloned repo could aim a persona at the user's own files. User-scope links
  // (dotfiles setups) are the user's own, and are written through.
  const project = dirname(root.root);
  if (a.scope === 'project' && isSymlink(path) && !safeRealpath(path).startsWith(safeRealpath(project) + sep)) {
    return { code: report({ written: false, path, hash: currentHash, diagnostics: [
      err('E_WRITE_SYMLINK', `${path} is a symlink to a file outside the project; refusing to write through it`, { file: path, line: 1 }, 'Remove the link, or point it at a file inside the project'),
    ] }, a, env) };
  }
  const stale = staleCheck(path, a.expectHash);
  if (stale) return { code: report({ written: false, path, hash: currentHash, diagnostics: [stale] }, a, env) };
  return { root: root.root, path, current, currentHash };
}

// Shared by save and patch: name check, check-in-place, then an atomic write.
function checkAndWrite(d: Discovery, a: AuthorArgs, env: CliEnv, at: Located, content: string, extra: Diagnostic[] = []): number {
  const { path, currentHash } = at;
  const split = splitFrontmatter(path, content);
  const named = split.fm?.data.name;
  if (typeof named === 'string' && named !== a.name) {
    const line = split.fm?.lineOf(['name']) ?? 2;
    return report({
      written: false, path, hash: currentHash,
      diagnostics: [err('E_NAME_MISMATCH', `the file's name is "${named}", not "${a.name}"`, { file: path, line }, `Set name: ${a.name}, or save it under the name "${named}"`)],
    }, a, env);
  }
  let check: CheckResult;
  try {
    check = checkInPlace(d.scopes, { scope: { kind: a.scope as WriteScope, root: at.root }, path }, content);
  } catch (e) {
    return report({ written: false, path, hash: currentHash, diagnostics: [writeFault(e, dirname(path))] }, a, env);
  }
  const diagnostics = [...extra, ...check.own, ...check.broken];
  if (hasErrors(diagnostics)) return report({ written: false, path, hash: currentHash, diagnostics }, a, env);
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeAtomic(path, content);
  } catch (e) {
    return report({ written: false, path, hash: currentHash, diagnostics: [...diagnostics, writeFault(e, dirname(path))] }, a, env);
  }
  return report({ written: true, path, hash: hashOf(content), diagnostics }, a, env);
}

function save(d: Discovery, a: AuthorArgs, env: CliEnv): number {
  let content: string;
  try {
    content = readFileSync(a.file!, 'utf8');
  } catch {
    env.out(`could not read ${a.file}`);
    return 2;
  }
  const at = locate(d, a, env);
  if ('code' in at) return at.code;
  return checkAndWrite(d, a, env, at, content);
}

function patch(d: Discovery, a: AuthorArgs, env: CliEnv): number {
  let body: unknown;
  try {
    body = JSON.parse(readFileSync(a.file!, 'utf8'));
  } catch {
    env.out(`could not read a JSON patch from ${a.file}`);
    return 2;
  }
  const at = locate(d, a, env);
  if ('code' in at) return at.code;
  const applied = applyPatch(a.fileKind, a.name, at.current, body, at.path);
  if (applied.usage) {
    env.out(applied.usage);
    return 2;
  }
  if (applied.errors) return report({ written: false, path: at.path, hash: at.currentHash, diagnostics: applied.errors }, a, env);
  return checkAndWrite(d, a, env, at, applied.raw!, applied.warnings);
}

function describeDependent(d: Diagnostic): { kind: FileKind | null; name: string | null; path: string | null; message: string } {
  const path = d.loc?.file ?? null;
  const file = path === null ? '' : basename(path);
  const kind = (Object.keys(SUFFIX) as FileKind[]).find((k) => file.endsWith(SUFFIX[k])) ?? null;
  return { kind, name: kind ? file.slice(0, -SUFFIX[kind].length) : null, path, message: d.message };
}

function del(d: Discovery, a: AuthorArgs, env: CliEnv): number {
  const out = (deleted: boolean, path: string | null, dependents: Diagnostic[], diagnostics: Diagnostic[]): number => {
    if (a.json) {
      env.out(JSON.stringify({ deleted, path, dependents: dependents.map(describeDependent), diagnostics: diagnostics.map(diagnosticJson) }, null, 2));
    } else {
      printDiagnostics([...diagnostics, ...dependents], env);
      env.out(deleted ? `deleted ${path}` : 'refused: nothing was deleted');
    }
    return deleted ? 0 : 1;
  };
  const root = scopeRoot(d, a.scope as WriteScope, a.cwd, env.home);
  if (!root.root) return out(false, null, [], [root.diagnostic!]);
  const path = targetPath(root.root, a.fileKind, a.name);
  if (readIfExists(path) === undefined) {
    return out(false, path, [], [err('E_UNKNOWN_REF', `no ${a.fileKind} named "${a.name}" in ${a.scope} scope`, undefined, `Run: persona list ${a.fileKind}s`)]);
  }
  const stale = staleCheck(path, a.expectHash);
  if (stale) return out(false, path, [], [stale]);
  let broken: Diagnostic[];
  try {
    broken = checkInPlace(d.scopes, { scope: { kind: a.scope as WriteScope, root: root.root }, path }, null).broken;
  } catch (e) {
    return out(false, path, [], [writeFault(e, dirname(path))]);
  }
  if (broken.length > 0 && !a.force) return out(false, path, broken, []);
  try {
    rmSync(path);
  } catch (e) {
    return out(false, path, broken, [writeFault(e, dirname(path))]);
  }
  return out(true, path, broken, []);
}

export function authorCmd(d: Discovery, a: AuthorArgs, env: CliEnv): number {
  switch (a.command) {
    case 'show':
      return show(d, a, env);
    case 'save':
      return save(d, a, env);
    case 'patch':
      return patch(d, a, env);
    case 'delete':
      return del(d, a, env);
  }
}
