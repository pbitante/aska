import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { err, type Diagnostic } from '../diagnostics';
import { readIfExists } from '../fs';
import type { FileKind } from '../model/types';
import { findGitRoot, type Discovery } from '../scopes/discover';
import { SUFFIX } from '../scopes/registry';

export type WriteScope = 'project' | 'user';

export const hashOf = (raw: string): string => createHash('sha256').update(raw).digest('hex');

// Where a write in this scope goes. The user scope is always <home>/.claude. The project scope
// is the discovered .claude folder or, when there is none yet, <git root>/.claude — the same
// place discovery would find it once it exists.
export function scopeRoot(d: Discovery, scope: WriteScope, cwd: string, home: string): { root?: string; diagnostic?: Diagnostic } {
  if (scope === 'user') return { root: join(resolve(home), '.claude') };
  if (d.project.droppedClaudeDir !== undefined) {
    return { diagnostic: err('E_NO_SCOPE', 'the project scope is the same folder as the user scope', undefined, 'Use --scope user, or run from inside a project') };
  }
  if (d.project.claudeDir) return { root: d.project.claudeDir };
  const git = findGitRoot(cwd);
  if (!git) {
    return { diagnostic: err('E_NO_SCOPE', 'no project found above the working directory (no .claude folder and no git root)', undefined, 'Run from inside a project, or use --scope user') };
  }
  return { root: join(git, '.claude') };
}

export const targetPath = (root: string, kind: FileKind, name: string): string => join(root, 'personas', `${name}${SUFFIX[kind]}`);

export function writeFault(e: unknown, dir: string): Diagnostic {
  const message = e instanceof Error ? e.message : String(e);
  return err('E_WRITE', `could not write: ${message}`, undefined, `Check permissions on ${dir}`);
}

// --expect-hash none means "this must be a new file"; any other value must equal the current
// file's hash. Without --expect-hash there is no check.
export function staleCheck(path: string, expectHash: string | undefined): Diagnostic | undefined {
  if (expectHash === undefined) return undefined;
  const current = existsSync(path) ? readIfExists(path) : undefined;
  if (expectHash === 'none') {
    return current === undefined ? undefined : err('E_STALE', `${path} already exists`, { file: path, line: 1 }, 'Reload it and edit the existing file instead of creating it');
  }
  if (current === undefined) return err('E_STALE', `${path} no longer exists`, { file: path, line: 1 }, 'Reload; the file was deleted since you opened it');
  return hashOf(current) === expectHash ? undefined : err('E_STALE', `${path} changed since you opened it`, { file: path, line: 1 }, 'Reload it, then make your edit again');
}

export const diagnosticJson = (d: Diagnostic) => ({
  level: d.level,
  code: d.code,
  message: d.message,
  file: d.loc?.file ?? null,
  line: d.loc?.line ?? null,
  fix: d.fix ?? null,
});
