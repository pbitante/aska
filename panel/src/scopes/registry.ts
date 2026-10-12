import { readdirSync, statSync, type Dirent } from 'node:fs';
import { join } from 'node:path';
import { didYouMean, err, warn, type Diagnostic } from '../diagnostics';
import { safeRealpath } from '../fs';
import type { FileKind, FileRef, Loc, Scope, ScopeKind, Shadow } from '../model/types';

const RANK: Record<ScopeKind, number> = { project: 0, user: 1, plugin: 2 };
export const SUFFIX: Record<FileKind, string> = { persona: '.persona.md', unit: '.unit.md', panel: '.panel.md' };
const KINDS: readonly FileKind[] = ['persona', 'unit', 'panel'];

export const scopeRank = (kind: ScopeKind): number => RANK[kind];

function canonicalName(scope: Scope, name: string): string {
  return scope.kind === 'plugin' ? `${scope.plugin}:${name}` : name;
}

function isRegularFile(dir: string, e: Dirent): boolean {
  if (e.isFile()) return true;
  if (!e.isSymbolicLink()) return false;
  try {
    return statSync(join(dir, e.name)).isFile();
  } catch {
    return false;
  }
}

export interface Lookup {
  file?: FileRef;
  shadow?: Shadow;
  diagnostic?: Diagnostic;
}

export class Registry {
  private readonly files: FileRef[] = [];
  readonly diagnostics: Diagnostic[] = [];

  constructor(readonly scopes: readonly Scope[]) {
    const seenRoots = new Set<string>();
    for (const scope of scopes) {
      const real = safeRealpath(scope.root);
      if (seenRoots.has(real)) continue;
      seenRoots.add(real);
      const dir = join(scope.root, 'personas');
      let entries: Dirent[];
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch (e) {
        // A scope without a personas folder is normal; one that can't be read is worth saying.
        const code = (e as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT' && code !== 'ENOTDIR') {
          this.diagnostics.push(warn('W_SCOPE_UNREADABLE', `could not read ${dir} (${code ?? (e as Error).message}), so its personas, units and panels are unavailable`, { file: dir, line: 1 },
            'Check the folder\'s permissions'));
        }
        continue;
      }
      const names = entries.filter((e) => e.name.endsWith('.md') && isRegularFile(dir, e)).map((e) => e.name).sort();
      for (const f of names) {
        const kind = KINDS.find((k) => f.endsWith(SUFFIX[k]));
        if (!kind) {
          const path = join(dir, f);
          this.diagnostics.push(warn('W_UNTYPED_FILE', `${path} is neither a persona, unit, nor panel file, so it is ignored`, { file: path, line: 1 },
            'Rename it to <name>.persona.md, <name>.unit.md or <name>.panel.md, or move it out of this folder if it is not one of those'));
          continue;
        }
        const name = f.slice(0, -SUFFIX[kind].length);
        if (name === '') continue;
        if (name.includes(':')) {
          const path = join(dir, f);
          this.diagnostics.push(warn('W_BAD_FILENAME', `${path} has a ":" in its name, so it is ignored`, { file: path, line: 1 },
            'Remove the colon; plugin namespaces come from the plugin manifest'));
          continue;
        }
        this.files.push({ kind, name, scope, path: join(dir, f), canonical: canonicalName(scope, name) });
      }
    }
  }

  all(kind: FileKind): FileRef[] {
    return this.files.filter((f) => f.kind === kind);
  }

  lookup(kind: FileKind, ref: string, at?: Loc, below?: Scope): Lookup {
    const colon = ref.indexOf(':');
    if (colon >= 0) {
      const plugin = ref.slice(0, colon);
      const name = ref.slice(colon + 1);
      const file = this.files.find((f) => f.kind === kind && f.scope.kind === 'plugin' && f.scope.plugin === plugin && f.name === name);
      return file ? { file } : { diagnostic: this.unknown(kind, ref, at) };
    }
    let candidates = this.files.filter((f) => f.kind === kind && f.name === ref);
    if (below) candidates = candidates.filter((f) => RANK[f.scope.kind] > RANK[below.kind]);
    candidates.sort((a, b) => RANK[a.scope.kind] - RANK[b.scope.kind]);
    if (candidates.length === 0) {
      if (below) {
        return {
          diagnostic: err('E_UNKNOWN_REF', `no ${kind} named "${ref}" exists in a scope below ${below.kind}`, at,
            `To extend a ${kind} with the same name, define it in a less specific scope; otherwise use a different name, or the namespaced form <plugin>:${ref} to reach another plugin's ${kind}`),
        };
      }
      return { diagnostic: this.unknown(kind, ref, at) };
    }
    const top = candidates[0]!;
    const pluginHits = candidates.filter((c) => c.scope.kind === 'plugin');
    if (top.scope.kind === 'plugin' && pluginHits.length > 1) {
      return {
        diagnostic: err('E_AMBIGUOUS', `"${ref}" is defined by more than one plugin`, at, `Use one of: ${pluginHits.map((c) => c.canonical).join(', ')}`),
      };
    }
    const shadowed = candidates.slice(1);
    return { file: top, shadow: shadowed.length > 0 ? { kind, name: ref, used: top, shadowed } : undefined };
  }

  private unknown(kind: FileKind, ref: string, at?: Loc): Diagnostic {
    const files = this.all(kind);
    const candidates = new Set(files.map((f) => f.canonical));
    const byName = new Map<string, FileRef[]>();
    for (const f of files) byName.set(f.name, [...(byName.get(f.name) ?? []), f]);
    for (const refs of byName.values()) {
      const pluginCount = new Set(refs.filter((r) => r.scope.kind === 'plugin').map((r) => r.scope.plugin)).size;
      const hasNonPlugin = refs.some((r) => r.scope.kind !== 'plugin');
      if (hasNonPlugin || pluginCount <= 1) candidates.add(refs[0]!.name);
    }
    const sug = didYouMean(ref, [...candidates]);
    return err('E_UNKNOWN_REF', `unknown ${kind} "${ref}"`, at,
      sug ? `Did you mean "${sug}"?` : `Create personas/${ref.split(':').pop()}${SUFFIX[kind]} in a scope`);
  }
}
