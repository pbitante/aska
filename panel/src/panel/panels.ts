import { readFileSync } from 'node:fs';
import { err, type Diagnostic } from '../diagnostics';
import type { FileRef } from '../model/types';
import { parsePanel, type PanelDoc } from '../parse/panel';
import type { Registry } from '../scopes/registry';

export function checkPanelFile(reg: Registry, f: FileRef): { panel?: PanelDoc; personas: FileRef[]; diagnostics: Diagnostic[] } {
  let raw: string;
  try {
    raw = readFileSync(f.path, 'utf8');
  } catch {
    return { personas: [], diagnostics: [err('E_READ', `could not read ${f.path}`, { file: f.path, line: 1 }, 'Check that the file still exists and is readable')] };
  }
  const parsed = parsePanel(f.path, raw);
  if (!parsed.panel) return { personas: [], diagnostics: parsed.diagnostics };
  const ds = [...parsed.diagnostics];
  const personas: FileRef[] = [];
  const refByPath = new Map<string, string>();
  for (const p of parsed.panel.personas) {
    const l = reg.lookup('persona', p.ref, p.loc);
    if (!l.file) {
      ds.push(err('E_PANEL_PERSONA', `panel persona "${p.ref}" does not resolve`, p.loc, l.diagnostic?.fix ?? 'Use the name of an existing persona'));
      continue;
    }
    const dup = personas.find((x) => x.path === l.file!.path);
    if (dup) {
      const earlierRef = refByPath.get(dup.path);
      ds.push(err('E_PANEL_PERSONA', `"${p.ref}" and "${earlierRef}" are the same persona (${l.file.canonical})`, p.loc, 'List each persona once'));
      continue;
    }
    personas.push(l.file);
    refByPath.set(l.file.path, p.ref);
  }
  return { panel: parsed.panel, personas, diagnostics: ds };
}
