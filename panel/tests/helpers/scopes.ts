import { join } from 'node:path';
import type { Scope } from '../../src/model/types';
import { Registry } from '../../src/scopes/registry';
import { makeTree } from './tree';

// Keys: "<scope>/units/a.md" → <scope root>/personas/a.unit.md
//       "<scope>/personas/p.md" → <scope root>/personas/p.persona.md
//       "<scope>/panels/p.md" → <scope root>/personas/p.panel.md
//       "<scope>/raw/<path>" → <scope root>/personas/<path> (verbatim; for untyped files and subfolders)
// <scope> is "project", "user", or a plugin name.
export function registryFor(files: Record<string, string>): { reg: Registry; root: string; scopes: Scope[] } {
  const mapped: Record<string, string> = { 'proj/.git/HEAD': '' };
  const plugins = new Set<string>();
  for (const [key, content] of Object.entries(files)) {
    const [scope, kindDir, ...rest] = key.split('/');
    let base: string;
    if (scope === 'project') base = 'proj/.claude';
    else if (scope === 'user') base = 'home/.claude';
    else {
      base = `plugins/${scope}`;
      plugins.add(scope!);
    }
    const file = rest.join('/');
    const target =
      kindDir === 'units' ? file.replace(/\.md$/, '.unit.md')
      : kindDir === 'personas' ? file.replace(/\.md$/, '.persona.md')
      : kindDir === 'panels' ? file.replace(/\.md$/, '.panel.md')
      : kindDir === 'raw' ? file
      : [kindDir, ...rest].join('/');
    mapped[`${base}/personas/${target}`] = content;
  }
  const root = makeTree(mapped);
  const scopes: Scope[] = [
    { kind: 'project', root: join(root, 'proj/.claude') },
    { kind: 'user', root: join(root, 'home/.claude') },
    ...[...plugins].sort().map((p) => ({ kind: 'plugin' as const, root: join(root, 'plugins', p), plugin: p })),
  ];
  return { reg: new Registry(scopes), root, scopes };
}
