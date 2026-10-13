import { diagnosticJson } from '../author/files';
import { hasErrors, type Diagnostic } from '../diagnostics';
import { resolveLineup } from '../panel/lineup';
import type { Registry } from '../scopes/registry';
import type { CliEnv } from './main';

// `base` holds discovery and registry diagnostics (e.g. W_PLUGIN_LIST), so a plugin-data failure
// shows up beside the "does not resolve" it causes.
export function lineupCmd(reg: Registry, base: Diagnostic[], p: { names: string[]; model?: string }, env: CliEnv): number {
  const l = resolveLineup(reg, { names: p.names, model: p.model });
  const diagnostics = [...base, ...l.diagnostics];
  env.out(JSON.stringify({ panel: l.panel, panelists: l.panelists, diagnostics: diagnostics.map(diagnosticJson) }, null, 2));
  return hasErrors(diagnostics) ? 1 : 0;
}
