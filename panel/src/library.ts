import { readFileSync } from 'node:fs';
import { err, type Diagnostic } from './diagnostics';
import type { FileRef } from './model/types';
import { checkPanelFile } from './panel/panels';
import { parseUnit } from './parse/unit';
import { resolvePersona } from './resolve/resolve';
import type { Registry } from './scopes/registry';

export interface LibraryCheck {
  units: { file: FileRef; diagnostics: Diagnostic[] }[];
  personas: { file: FileRef; result: ReturnType<typeof resolvePersona> }[];
  panels: { file: FileRef; diagnostics: Diagnostic[] }[];
}

// Checks every unit, persona and panel in the registry: what `validate` (no name) reports, and
// what the authoring commands compare before and after a write.
export function checkLibrary(reg: Registry, userOnly: Registry): LibraryCheck {
  const units = reg.all('unit').map((file) => {
    let raw: string;
    try {
      raw = readFileSync(file.path, 'utf8');
    } catch {
      return { file, diagnostics: [err('E_READ', `could not read ${file.path}`, { file: file.path, line: 1 }, 'Check that the file still exists and is readable')] };
    }
    return { file, diagnostics: parseUnit(file.path, raw).diagnostics };
  });
  // A user-scope file shadowed by a more specific scope can't be reached through the full
  // registry, so it resolves without that scope. One that isn't shadowed still resolves through
  // the full registry, as `validate <name>`, `explain` and `render` do, so that its units (which
  // may live in the project scope) resolve to the same effective persona everywhere.
  const personas = reg.all('persona').map((file) => {
    const shadowed = file.scope.kind === 'user' && reg.lookup('persona', file.canonical).file?.path !== file.path;
    return { file, result: resolvePersona(shadowed ? userOnly : reg, file.canonical) };
  });
  const panels = reg.all('panel').map((file) => ({ file, diagnostics: checkPanelFile(reg, file).diagnostics }));
  return { units, personas, panels };
}
