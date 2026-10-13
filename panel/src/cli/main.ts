import { statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { err, formatDiagnostic, hasErrors, type Diagnostic } from '../diagnostics';
import { checkEvidenceCmd, checkJudgmentCmd, promptCmd, readRequiredInput } from './judgment';
import { formatListing, listRows, type ListKind } from './list';
import { checkLibrary } from '../library';
import { effectiveThreshold, type EffUnit, type EffectivePersona } from '../model/effective';
import { checkPanelFile } from '../panel/panels';
import { comparePanel, formatComparison, parsePanelResult } from '../panel/compare';
import { KEBAB, REF } from '../parse/fields';
import { renderPrompt } from '../render/prompt';
import { generatedFileName, panelTools } from '../render/targets';
import { findStaleRenders, planRender, writePlan, type RenderTargets, type TargetScope } from '../render/write';
import { activationLine, formatReport } from '../resolve/report';
import { resolvePersona } from '../resolve/resolve';
import { discoverScopes } from '../scopes/discover';
import { Registry } from '../scopes/registry';
import { diagnosticJson } from '../author/files';
import { authorCmd } from './author';
import { runsCmd } from './runs';
import { recordComparison, type RunEnv } from '../runs/store';
import { gateCmd, targetsCmd } from './gate';
import type { FileKind, FileRef } from '../model/types';

export interface CliEnv {
  cwd: string;
  home: string;
  pluginListJson?: string;
  pluginListUnavailableReason?: string;
  selfPluginRoot?: string;
  out: (line: string) => void;
  columns?: number;
  err?: (line: string) => void;
  stdin?: () => string | undefined;
  stdinIsTTY?: boolean;
  // The clock for `runs new` and `compare --record`; tests inject a fixed one.
  now?: () => Date;
  // ASKA_RUNS_DIR, GIT_DIR and GIT_WORK_TREE for `runs`; the CLI passes process.env, tests their own.
  runsEnv?: RunEnv;
}

const USAGE = [
  'usage: persona <command> [options]',
  '',
  '  validate [name]                        check one persona, or every persona, unit and panel',
  '  explain <name>                         show the effective persona, clash report and prompt',
  '  render <name> [--scope project|user]   write the output style and the panel subagent',
  '  list [units|personas|panels] [--json]  show every unit, persona and panel in every scope',
  '  prompt <name> --panel [--checks <targets.json>]   print a persona\'s panel prompt, with review targets if given',
  '  check-judgment <name> [--file <path>] [--checks <targets.json>]   validate a judgment (JSON from the file or stdin)',
  '  check-evidence [--file <path>]         validate an investigator\'s evidence (markdown from the file or stdin)',
  '  compare [--file <path>] [--json] [--record]   compare a panel\'s judgments (panel-result JSON); --record updates the run\'s meta.json',
  '  runs new                               create a kept panel-run folder and print its path',
  '  runs list [--json]                     list kept panel runs, newest first',
  '  targets --from <file.md> [--out <targets.json>]   extract a step file\'s adversarial review targets',
  '  gate [<name>] --file <judgment.json> --checks <targets.json> [--json]   decide a gate as persona <name> (default gate): pass, pass with conditions, or fail',
  '  show <kind> <name> [--scope s] [--json]   print one unit, persona or panel file (kind: unit|persona|panel)',
  '  save <kind> <name> --scope project|user --file <md> [--expect-hash h] [--json]   check a whole file as if in place, then write it',
  '  patch <kind> <name> --scope project|user --file <json> [--expect-hash h] [--json]  apply form edits, check, then write',
  '  delete <kind> <name> --scope project|user [--force] [--expect-hash h] [--json]  remove a file; refuses if others depend on it',
  '',
  'options:',
  '  --cwd <dir>   run as if from <dir>',
  '  -h, --help    show this help',
].join('\n');

const indent = (text: string): string => text.split('\n').map((l) => `  ${l}`).join('\n');

function finish(ds: Diagnostic[], env: CliEnv): number {
  const unique = [...new Map(ds.map((d) => [formatDiagnostic(d), d])).values()];
  for (const d of unique) env.out(formatDiagnostic(d));
  const errors = unique.filter((d) => d.level === 'error').length;
  const warnings = unique.length - errors;
  env.out(`${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`);
  return errors > 0 ? 1 : 0;
}

function describeEffective(p: EffectivePersona): string {
  const list = (us: EffUnit[], numbered: boolean) =>
    us.length === 0
      ? '(none)'
      : us.map((u, i) => `${numbered ? `${i + 1}. ` : ''}${u.canonical} (${effectiveThreshold(u)})`).join(numbered ? '  ' : ', ');
  const caps = p.capabilities.length === 0
    ? '(none)'
    : p.capabilities.map((c) => `${c.kind === 'skills' ? 'skill' : 'mcp'} ${c.name}`).join(', ');
  return [
    `== ${p.canonical} (${p.source}) ==`,
    p.description,
    `primary:       ${list(p.units.primary, true)}`,
    `secondary:     ${list(p.units.secondary, false)}`,
    `deprioritized: ${list(p.units.deprioritized, false)}`,
    `capabilities:  ${caps}`,
    `panel tools:   ${panelTools(p).join(', ')}`,
    'inputs:',
    ...p.inputs.map((f) => `  ${f}`),
  ].join('\n');
}

// Which scopes define each name, so a name defined in more than one scope can be labelled with its scope.
function scopeKindsByName(files: readonly FileRef[]): Map<string, Set<string>> {
  const kinds = new Map<string, Set<string>>();
  for (const f of files) kinds.set(f.name, (kinds.get(f.name) ?? new Set<string>()).add(f.scope.kind));
  return kinds;
}

function validate(
  reg: Registry,
  userOnlyReg: Registry,
  base: Diagnostic[],
  targets: RenderTargets,
  dropped: boolean,
  name: string | undefined,
  env: CliEnv,
): number {
  const ds = [...base];
  const printStatus = (r: ReturnType<typeof resolvePersona>, label: string) => {
    ds.push(...r.diagnostics);
    env.out(`${label}: ${r.effective ? 'ok' : 'failed'}`);
    const { clashes, stale, shadows } = r.report;
    if (clashes.length + stale.length + shadows.length > 0) env.out(indent(formatReport(r.report)));
  };
  // Project-scope generated files resolve against the full registry; user-scope ones resolve
  // against a registry without the project scope, so a project persona that shadows a user
  // persona's name doesn't falsely mark the user-scope render stale. When the project scope was
  // dropped there is no registered project directory at all (render refuses to write one; see
  // the `dropped` guard below), so skip that check entirely rather than re-deriving a path.
  const staleRenderDiagnostics = (onlyFileName?: string): Diagnostic[] => {
    const result: Diagnostic[] = [];
    if (!dropped) {
      result.push(...findStaleRenders(
        { projectClaudeDir: targets.projectClaudeDir, userClaudeDir: targets.projectClaudeDir },
        (c) => resolvePersona(reg, c).effective,
        undefined,
        onlyFileName,
      ));
    }
    result.push(...findStaleRenders(
      { projectClaudeDir: targets.userClaudeDir, userClaudeDir: targets.userClaudeDir },
      (c) => resolvePersona(userOnlyReg, c).effective,
      // A project persona of the same name shadows this one from inside the project, so
      // `persona render <name>` run here would render the project version, not fix this
      // user-scope file.
      (c) => (reg.lookup('persona', c).file?.scope.kind === 'project'
        ? `Run: persona render ${c} from outside this project`
        : `Run: persona render ${c}`),
      onlyFileName,
    ));
    return result;
  };
  if (name) {
    const r = resolvePersona(reg, name);
    if (!r.effective) {
      const panelFile = reg.lookup('panel', name);
      if (panelFile.file) {
        const pr = checkPanelFile(reg, panelFile.file);
        env.out(`${panelFile.file.canonical} (panel): ${hasErrors(pr.diagnostics) ? 'failed' : 'ok'}`);
        return finish([...ds, ...pr.diagnostics], env);
      }
    }
    printStatus(r, name);
    if (r.effective) ds.push(...staleRenderDiagnostics(generatedFileName(r.effective)));
    return finish(ds, env);
  }
  const c = checkLibrary(reg, userOnlyReg);
  for (const u of c.units) ds.push(...u.diagnostics);
  if (c.personas.length === 0) env.out('no personas found');
  const personaKinds = scopeKindsByName(c.personas.map((p) => p.file));
  for (const { file, result } of c.personas) {
    printStatus(result, (personaKinds.get(file.name)?.size ?? 0) > 1 ? `${file.canonical} (${file.scope.kind})` : file.canonical);
  }
  const panelKinds = scopeKindsByName(c.panels.map((p) => p.file));
  for (const { file, diagnostics } of c.panels) {
    ds.push(...diagnostics);
    const label = (panelKinds.get(file.name)?.size ?? 0) > 1 ? `${file.canonical} (panel, ${file.scope.kind})` : `${file.canonical} (panel)`;
    env.out(`${label}: ${hasErrors(diagnostics) ? 'failed' : 'ok'}`);
  }
  ds.push(...staleRenderDiagnostics());
  return finish(ds, env);
}

function explain(reg: Registry, base: Diagnostic[], name: string, env: CliEnv): number {
  const r = resolvePersona(reg, name);
  if (r.effective) {
    env.out(describeEffective(r.effective));
    env.out(`\n== Clash report ==\n${formatReport(r.report)}`);
    env.out(`\n== Rendered prompt (swap) ==\n${renderPrompt(r.effective, 'swap')}`);
  }
  return finish([...base, ...r.diagnostics], env);
}

function render(
  reg: Registry,
  base: Diagnostic[],
  targets: RenderTargets,
  name: string,
  scope: TargetScope | undefined,
  dropped: boolean,
  env: CliEnv,
): number {
  const r = resolvePersona(reg, name);
  const ds = [...base, ...r.diagnostics.filter((d) => d.code !== 'W_UNREVIEWED' && d.code !== 'W_STALE_OVERRIDE')];
  if (!r.effective) return finish(ds, env);
  const planned = planRender(r.effective, targets, scope);
  if (planned.plan?.scope === 'project' && dropped) {
    ds.push(err(
      'E_RENDER_SCOPE',
      'the project scope was dropped because it is the same directory as the user scope; there is no project scope to render into',
      undefined,
      'Run from inside a project (a directory below a git root with its own .claude, distinct from the user scope)',
    ));
    return finish(ds, env);
  }
  ds.push(...planned.diagnostics);
  if (planned.plan) {
    const written = writePlan(planned.plan);
    ds.push(...written);
    if (written.length === 0) {
      for (const f of planned.plan.files) env.out(`wrote ${f.path}`);
      env.out('Restart Claude Code to pick up a new or changed output style.');
    }
  }
  const line = activationLine(r.effective.canonical, r.report);
  if (line) env.out(line);
  return finish(ds, env);
}

function list(reg: Registry, warnings: Diagnostic[], kind: ListKind | undefined, json: boolean, env: CliEnv): number {
  const listing = listRows(reg);
  const kinds: ListKind[] = kind ? [kind] : ['units', 'personas', 'panels'];
  if (json) {
    const out: Record<string, unknown> = {};
    for (const k of kinds) out[k] = listing[k];
    out.warnings = warnings.map(diagnosticJson);
    env.out(JSON.stringify(out, null, 2));
    return 0;
  }
  env.out(formatListing(listing, kinds, env.columns ?? 80));
  for (const d of warnings) (env.err ?? env.out)(formatDiagnostic(d));
  return 0;
}

type ScopeArg = TargetScope | 'plugin';
const AUTHOR_COMMANDS = ['show', 'save', 'patch', 'delete'] as const;
type AuthorCommand = (typeof AUTHOR_COMMANDS)[number];
const FILE_KINDS: readonly FileKind[] = ['unit', 'persona', 'panel'];

export type ParsedArgv =
  | { kind: 'help' }
  | { kind: 'usage'; message?: string }
  | { kind: 'command'; cwd: string; command: 'validate' | 'explain' | 'render' | 'list' | 'prompt' | 'check-judgment' | 'compare' | 'targets' | 'gate'; name?: string; scope?: TargetScope; json?: boolean; panel?: boolean; file?: string; record?: boolean; checks?: string; from?: string; fromGiven?: string; out?: string }
  | { kind: 'author'; cwd: string; command: AuthorCommand; fileKind: FileKind; name: string; scope?: ScopeArg; json: boolean; file?: string; expectHash?: string; force: boolean }
  | { kind: 'runs'; cwd: string; command: 'new' | 'list'; json: boolean }
  | { kind: 'evidence'; file?: string };

// Pulled out so bin.ts can tell, before running `claude plugin list`, whether this invocation
// even reaches a command that needs plugin data — --help and usage errors never do.
// Usage messages for flags that more than one branch of parseArgv rejects, kept in one place so
// they list the same commands everywhere.
const ONLY = {
  file: '--file is only accepted by check-judgment, check-evidence, compare, gate, save and patch',
  expectHash: '--expect-hash is only accepted by save, patch and delete',
  force: '--force is only accepted by delete',
  panel: '--panel is only accepted by prompt',
  json: '--json is only accepted by list, runs list, compare, gate, show, save, patch and delete',
} as const;

export function parseArgv(argv: string[], baseCwd: string): ParsedArgv {
  let cwd = baseCwd;
  let scope: ScopeArg | undefined;
  let scopeSeen = false;
  let json = false;
  let panel = false;
  let file: string | undefined;
  let checks: string | undefined;
  let from: string | undefined;
  let fromGiven: string | undefined;
  let out: string | undefined;
  let expectHash: string | undefined;
  let force = false;
  let record = false;
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '-h' || a === '--help') return { kind: 'help' };
    if (a === '--cwd') {
      const v = argv[++i];
      if (!v) return { kind: 'usage' };
      const next = resolve(baseCwd, v);
      let isDir: boolean;
      try {
        isDir = statSync(next).isDirectory();
      } catch {
        isDir = false;
      }
      if (!isDir) return { kind: 'usage', message: `${next} is not a directory` };
      cwd = next;
    } else if (a === '--scope') {
      const v = argv[++i];
      if (v !== 'project' && v !== 'user' && v !== 'plugin') return { kind: 'usage' };
      if (scopeSeen) return { kind: 'usage', message: '--scope may be given only once' };
      scopeSeen = true;
      scope = v;
    } else if (a === '--json') {
      json = true;
    } else if (a === '--panel') {
      panel = true;
    } else if (a === '--file') {
      const v = argv[++i];
      if (!v) return { kind: 'usage', message: '--file needs a path' };
      file = resolve(baseCwd, v);
    } else if (a === '--expect-hash') {
      const v = argv[++i];
      if (!v) return { kind: 'usage', message: '--expect-hash needs a hash, or "none"' };
      expectHash = v;
    } else if (a === '--force') {
      force = true;
    } else if (a === '--record') {
      record = true;
    } else if (a === '--checks' || a === '--from' || a === '--out') {
      const v = argv[++i];
      if (!v) return { kind: 'usage', message: `${a} needs a path` };
      if (a === '--checks') checks = resolve(baseCwd, v);
      else if (a === '--from') {
        from = resolve(baseCwd, v);
        fromGiven = v;
      } else out = resolve(baseCwd, v);
    } else if (a.startsWith('-')) {
      return { kind: 'usage' };
    } else {
      positional.push(a);
    }
  }
  if (record && positional[0] !== 'compare') return { kind: 'usage', message: '--record is only accepted by compare' };
  if (positional[0] === 'check-evidence') {
    if (positional.length > 1) return { kind: 'usage', message: 'check-evidence takes no name; pass the evidence with --file or on stdin' };
    if (scopeSeen || json || panel || expectHash !== undefined || force || checks !== undefined || from !== undefined || out !== undefined) return { kind: 'usage', message: 'check-evidence accepts only --file' };
    return { kind: 'evidence', file };
  }
  if (positional[0] === 'runs') {
    const [, sub, ...extra] = positional;
    if (sub !== 'new' && sub !== 'list') return { kind: 'usage', message: 'runs needs "new" or "list"' };
    if (extra.length > 0) return { kind: 'usage', message: `runs ${sub} takes no other arguments` };
    if (scopeSeen || panel || file !== undefined || expectHash !== undefined || force || checks !== undefined || from !== undefined || out !== undefined || (json && sub === 'new')) {
      return { kind: 'usage', message: sub === 'new' ? 'runs new accepts only --cwd' : 'runs list accepts only --cwd and --json' };
    }
    return { kind: 'runs', cwd, command: sub, json };
  }
  if ((AUTHOR_COMMANDS as readonly string[]).includes(positional[0] ?? '')) {
    const [command, kind, name, ...extra] = positional;
    const cmd = command as AuthorCommand;
    if (!kind || !name || extra.length > 0) return { kind: 'usage', message: `${cmd} needs <unit|persona|panel> <name>` };
    if (!(FILE_KINDS as readonly string[]).includes(kind)) return { kind: 'usage', message: `kind must be unit, persona or panel, not "${kind}"` };
    const writes = (cmd as string) !== 'show';
    const nameValid = writes ? KEBAB.test(name) : REF.test(name);
    if (!nameValid) {
      return { kind: 'usage', message: writes ? `<name> must be kebab-case, not "${name}"` : `<name> must be kebab-case, or <plugin>:kebab, not "${name}"` };
    }
    if (writes && scope === undefined) return { kind: 'usage', message: `${cmd} needs --scope project|user` };
    if (writes && scope === 'plugin') return { kind: 'usage', message: 'aska never writes into a plugin; use --scope project or user' };
    const takesFile = (cmd as string) === 'save' || (cmd as string) === 'patch';
    if (takesFile && file === undefined) return { kind: 'usage', message: `${cmd} needs --file <path>` };
    if (!takesFile && file !== undefined) return { kind: 'usage', message: ONLY.file };
    if (!takesFile && (cmd as string) !== 'delete' && expectHash !== undefined) return { kind: 'usage', message: ONLY.expectHash };
    if ((cmd as string) === 'delete' && expectHash === 'none') return { kind: 'usage', message: 'delete takes the hash of the file it deletes, not --expect-hash none' };
    if (force && (cmd as string) !== 'delete') return { kind: 'usage', message: ONLY.force };
    if (panel) return { kind: 'usage', message: ONLY.panel };
    if (checks !== undefined || from !== undefined || out !== undefined) return { kind: 'usage', message: `--checks, --from and --out are not accepted by ${cmd}` };
    return { kind: 'author', cwd, command: cmd, fileKind: kind as FileKind, name, scope, json, file, expectHash, force };
  }
  if (expectHash !== undefined) return { kind: 'usage', message: ONLY.expectHash };
  if (force) return { kind: 'usage', message: ONLY.force };
  if (scope === 'plugin') return { kind: 'usage', message: '--scope plugin is only accepted by show' };
  const [command, name, ...rest] = positional;
  if (rest.length > 0) return { kind: 'usage' };
  const COMMANDS = ['validate', 'explain', 'render', 'list', 'prompt', 'check-judgment', 'compare', 'targets', 'gate'] as const;
  type Command = (typeof COMMANDS)[number];
  if (!(COMMANDS as readonly string[]).includes(command ?? '')) return { kind: 'usage' };
  const cmd = command as Command;
  if ((cmd === 'explain' || cmd === 'render' || cmd === 'prompt' || cmd === 'check-judgment') && !name) return { kind: 'usage' };
  if (cmd === 'compare' && name !== undefined) return { kind: 'usage', message: 'compare takes no name; pass the panel result with --file or on stdin' };
  if (record && file === undefined) return { kind: 'usage', message: '--record needs --file <folder>/panel-result.json' };
  if (cmd === 'targets' && name !== undefined) return { kind: 'usage', message: 'targets takes no name' };
  if ((from !== undefined || out !== undefined) && cmd !== 'targets') return { kind: 'usage', message: '--from and --out are only accepted by targets' };
  if (cmd === 'targets' && from === undefined) return { kind: 'usage', message: 'targets needs --from <file.md>' };
  if (cmd === 'targets' && out !== undefined && out === from) return { kind: 'usage', message: '--out must not be the same file as --from' };
  if (checks !== undefined && cmd !== 'prompt' && cmd !== 'check-judgment' && cmd !== 'gate') return { kind: 'usage', message: '--checks is only accepted by prompt, check-judgment and gate' };
  if (cmd === 'gate' && (file === undefined || checks === undefined)) return { kind: 'usage', message: 'gate needs --file <judgment.json> and --checks <targets.json>' };
  if (cmd !== 'render' && scope !== undefined) return { kind: 'usage', message: '--scope is only accepted by render' };
  if (panel && cmd !== 'prompt') return { kind: 'usage', message: ONLY.panel };
  if (cmd === 'prompt' && !panel) return { kind: 'usage', message: 'prompt needs --panel' };
  if (file !== undefined && cmd !== 'check-judgment' && cmd !== 'compare' && cmd !== 'gate') return { kind: 'usage', message: ONLY.file };
  if (json && cmd !== 'list' && cmd !== 'compare' && cmd !== 'gate') return { kind: 'usage', message: ONLY.json };
  if (cmd === 'list') {
    if (name !== undefined && name !== 'units' && name !== 'personas' && name !== 'panels') {
      return { kind: 'usage', message: `list takes "units", "personas" or "panels", not "${name}"` };
    }
    return { kind: 'command', cwd, command: cmd, name, json };
  }
  return { kind: 'command', cwd, command: cmd, name, scope: scope as TargetScope | undefined, json, panel, file, record, checks, from, fromGiven, out };
}

export function run(argv: string[], env: CliEnv): number {
  const parsed = parseArgv(argv, env.cwd);
  if (parsed.kind === 'help') {
    env.out(USAGE);
    return 0;
  }
  if (parsed.kind === 'usage') {
    if (parsed.message) env.out(parsed.message);
    env.out(USAGE);
    return 2;
  }
  if (parsed.kind === 'runs') return runsCmd(parsed, env);
  if (parsed.kind === 'evidence') return checkEvidenceCmd(parsed.file, env);
  if (parsed.kind === 'command' && parsed.command === 'targets') return targetsCmd(parsed.from!, parsed.fromGiven!, parsed.out, env);
  const d = discoverScopes({
    cwd: parsed.cwd,
    home: env.home,
    pluginListJson: env.pluginListJson,
    pluginListUnavailableReason: env.pluginListUnavailableReason,
    selfPluginRoot: env.selfPluginRoot,
  });
  if (parsed.kind === 'author') return authorCmd(d, parsed, env);
  const { command, name, scope } = parsed;

  const reg = new Registry(d.scopes);
  const dropped = d.project.droppedClaudeDir !== undefined;
  const targets: RenderTargets = {
    projectClaudeDir: d.project.claudeDir ?? join(d.project.base, '.claude'),
    userClaudeDir: join(resolve(env.home), '.claude'),
  };
  if (command === 'list') return list(reg, [...d.diagnostics, ...reg.diagnostics], name as ListKind | undefined, parsed.json === true, env);
  if (command === 'prompt') return promptCmd(reg, name!, env, parsed.checks);
  if (command === 'check-judgment') return checkJudgmentCmd(reg, name!, parsed.file, env, parsed.checks);
  if (command === 'compare') {
    const input = readRequiredInput(parsed.file, env);
    if ('code' in input) return input.code;
    const parsedResult = parsePanelResult(input.text);
    if (!parsedResult.result) {
      for (const d of parsedResult.diagnostics) env.out(formatDiagnostic(d));
      return 1;
    }
    const comparison = comparePanel(parsedResult.result, (ref) => resolvePersona(reg, ref).effective);
    env.out(parsed.json ? JSON.stringify(comparison, null, 2) : formatComparison(comparison));
    if (parsed.record) {
      // After stdout, on stderr, and never changing the exit code: recording is a side effect.
      const warning = recordComparison(dirname(parsed.file!), comparison, env.now?.() ?? new Date());
      if (warning) (env.err ?? env.out)(`warning: ${warning}`);
    }
    return comparison.ok ? 0 : 1;
  }
  if (command === 'validate') {
    const userOnlyReg = new Registry(d.scopes.filter((s) => s.kind !== 'project'));
    return validate(reg, userOnlyReg, [...d.diagnostics, ...reg.diagnostics], targets, dropped, name, env);
  }
  if (command === 'explain') return explain(reg, d.diagnostics, name!, env);
  if (command === 'gate') return gateCmd(reg, name ?? 'gate', parsed.file!, parsed.checks!, parsed.json === true, env);
  return render(reg, d.diagnostics, targets, name!, scope, dropped, env);
}
