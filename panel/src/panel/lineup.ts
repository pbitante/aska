import { err, hasErrors, warn, type Diagnostic } from '../diagnostics';
import { PANEL_MODELS, isPanelModel, type FileRef, type PanelModel } from '../model/types';
import { REF, hint } from '../parse/fields';
import { resolvePersona } from '../resolve/resolve';
import type { Registry } from '../scopes/registry';
import { checkPanelFile } from './panels';

// Where a panelist's model came from, highest precedence first.
export type ModelSource = 'panelist' | 'run' | 'panel' | 'persona' | 'session';
export const MODEL_SOURCES: readonly ModelSource[] = ['panelist', 'run', 'panel', 'persona', 'session'];

export interface LineupRow { persona: string; canonical: string; model: PanelModel | null; modelSource: ModelSource }
export interface Lineup { panel: string | null; panelists: LineupRow[]; diagnostics: Diagnostic[] }

interface Name { token: string; ref: string; model?: string }

const fail = (diagnostics: Diagnostic[]): Lineup => ({ panel: null, panelists: [], diagnostics });
const lineupErr = (message: string, fix: string): Diagnostic => err('E_LINEUP', message, undefined, fix);
const badModel = (m: string, where: string): Diagnostic =>
  lineupErr(`unknown model "${m}" ${where}`, hint(m, PANEL_MODELS) ?? `Use one of ${PANEL_MODELS.join(', ')}`);

// "<ref>" or "<ref>@<model>"; REF has no "@", so the first "@" splits it.
function readName(token: string, ds: Diagnostic[]): Name {
  const at = token.indexOf('@');
  const name: Name = at < 0 ? { token, ref: token } : { token, ref: token.slice(0, at), model: token.slice(at + 1) };
  if (!REF.test(name.ref)) ds.push(lineupErr(`"${token}" is not a valid persona or panel name`, 'Use a kebab-case name, or plugin:name, optionally followed by @<model>'));
  else if (name.model !== undefined && !isPanelModel(name.model)) ds.push(badModel(name.model, `for ${name.ref}`));
  return name;
}

function row(reg: Registry, launch: string, file: FileRef, layers: { panelist?: PanelModel; run?: PanelModel; panel?: PanelModel }, ds: Diagnostic[]): LineupRow {
  const eff = resolvePersona(reg, file.canonical).effective;
  if (!eff) ds.push(lineupErr(`${launch} does not resolve`, `Run: persona validate ${file.canonical}`));
  const persona = eff?.model ?? undefined;
  const [model, modelSource]: [PanelModel | null, ModelSource] =
    layers.panelist ? [layers.panelist, 'panelist']
    : layers.run ? [layers.run, 'run']
    : layers.panel ? [layers.panel, 'panel']
    : persona ? [persona, 'persona']
    : [null, 'session'];
  return { persona: launch, canonical: file.canonical, model, modelSource };
}

function fromPanel(reg: Registry, file: FileRef, tagged: Name[], run: PanelModel | undefined): Lineup {
  const checked = checkPanelFile(reg, file);
  if (!checked.panel || hasErrors(checked.diagnostics)) return fail(checked.diagnostics);
  const ds: Diagnostic[] = [...checked.diagnostics];
  // With no errors, checkPanelFile resolved every listed ref, in order.
  const members = checked.panel.personas.map((p, i) => ({ ref: p.ref, file: checked.personas[i]! }));
  const own = new Map<string, PanelModel>();
  for (const t of tagged) {
    const target = reg.lookup('persona', t.ref).file;
    const m = members.find((x) => x.ref === t.ref || (target !== undefined && x.file.path === target.path));
    if (!m) {
      ds.push(lineupErr(`${t.ref} is not on panel ${file.canonical}`, `Tag only the panel's own members (${members.map((x) => x.ref).join(', ')}), or list the personas instead to change the lineup`));
    } else if (own.has(m.file.path)) {
      ds.push(lineupErr(`${m.ref} is tagged twice`, 'Give each member one model'));
    } else {
      own.set(m.file.path, t.model as PanelModel);
    }
  }
  if (hasErrors(ds)) return fail(ds);
  const panelModels = checked.panel!.models;
  const panelists = members.map((m) => row(reg, m.ref, m.file, { panelist: own.get(m.file.path), run, panel: Object.hasOwn(panelModels, m.ref) ? panelModels[m.ref] : undefined }, ds));
  return hasErrors(ds) ? fail(ds) : { panel: file.canonical, panelists, diagnostics: ds };
}

function fromPersonas(reg: Registry, names: Name[], run: PanelModel | undefined): Lineup {
  const ds: Diagnostic[] = [];
  if (names.length < 2 || names.length > 6) {
    ds.push(err('E_PANEL_SIZE', `a panel needs 2 to 6 personas, this lineup has ${names.length}`, undefined, 'Name between 2 and 6 personas, or one saved panel'));
  }
  const seated: { name: Name; file: FileRef }[] = [];
  for (const n of names) {
    const l = reg.lookup('persona', n.ref);
    if (!l.file) {
      const isPanel = reg.lookup('panel', n.ref).file !== undefined;
      const fix = isPanel ? `${n.ref} is a saved panel: tag every other name with @<m>, or list personas only` : l.diagnostic?.fix ?? 'Use the name of an existing persona';
      ds.push(err('E_PANEL_PERSONA', `persona "${n.ref}" does not resolve`, undefined, fix));
      continue;
    }
    const dup = seated.find((s) => s.file.path === l.file!.path);
    if (dup) {
      ds.push(err('E_PANEL_PERSONA', `"${n.ref}" and "${dup.name.ref}" are the same persona (${l.file.canonical})`, undefined, 'List each persona once'));
      continue;
    }
    seated.push({ name: n, file: l.file });
  }
  if (hasErrors(ds)) return fail(ds);
  const panelists = seated.map((s) => row(reg, s.file.canonical, s.file, { panelist: s.name.model as PanelModel | undefined, run }, ds));
  return hasErrors(ds) ? fail(ds) : { panel: null, panelists, diagnostics: ds };
}

export function resolveLineup(reg: Registry, input: { names: string[]; model?: string }): Lineup {
  const ds: Diagnostic[] = [];
  if (input.model !== undefined && !isPanelModel(input.model)) ds.push(badModel(input.model, 'in --model'));
  const names = input.names.map((t) => readName(t, ds));
  if (names.length === 0) ds.push(lineupErr('no lineup given', 'Name a saved panel, or 2 to 6 personas'));
  if (hasErrors(ds)) return fail(ds);
  const run = input.model as PanelModel | undefined;
  const [first, ...rest] = names as [Name, ...Name[]];
  const panelFile = reg.lookup('panel', first.ref).file;
  if (first.model === undefined && panelFile && rest.every((n) => n.model !== undefined)) {
    const l = fromPanel(reg, panelFile, rest, run);
    // The first name also names a persona: the tags fit either reading, so say which was taken.
    if (l.panel !== null && reg.lookup('persona', first.ref).file) {
      l.diagnostics.push(warn('W_LINEUP_AMBIGUOUS', `${first.ref} is both a saved panel and a persona; read as the panel`, undefined, `To mean the persona, put ${first.ref} after another name (tester@sonnet ${first.ref}); to mean the panel, keep it first. Or rename one`));
    }
    return l;
  }
  if (first.model !== undefined && panelFile && !reg.lookup('persona', first.ref).file) {
    return fail([lineupErr(`${first.ref} is a saved panel, not a persona`, 'Put a whole panel on one model with --model <m>')]);
  }
  return fromPersonas(reg, names, run);
}
