import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { warn, type Diagnostic } from '../diagnostics';
import { safeRealpath } from '../fs';
import { cmp, type Scope } from '../model/types';

export interface ProjectLocation {
  base: string;
  claudeDir?: string;
  droppedClaudeDir?: string;
}

const isDir = (p: string): boolean => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

function sameDir(a: string, b: string): boolean {
  return safeRealpath(a) === safeRealpath(b);
}

export function findGitRoot(start: string): string | undefined {
  for (let d = resolve(start); ; d = dirname(d)) {
    if (existsSync(join(d, '.git'))) return d;
    if (dirname(d) === d) return undefined;
  }
}

export function locateProject(cwd: string): ProjectLocation {
  const start = resolve(cwd);
  const git = findGitRoot(start);
  if (!git) return isDir(join(start, '.claude')) ? { base: start, claudeDir: join(start, '.claude') } : { base: start };
  for (let d = start; ; d = dirname(d)) {
    if (isDir(join(d, '.claude'))) return { base: git, claudeDir: join(d, '.claude') };
    if (d === git || dirname(d) === d) break;
  }
  return { base: git };
}

function manifestName(root: string): string | undefined {
  try {
    const m = JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8')) as { name?: unknown };
    return typeof m.name === 'string' && m.name !== '' ? m.name : undefined;
  } catch {
    return undefined;
  }
}

const listWarning = (why: string): Diagnostic =>
  warn('W_PLUGIN_LIST', `${why}; other plugins' personas and units are unavailable`, undefined, 'Make sure the claude CLI is on PATH and "claude plugin list --json" works');


const nameWarning = (namespace: string): Diagnostic =>
  warn(
    'W_PLUGIN_NAME',
    `plugin namespace "${namespace}" is not valid and was skipped`,
    undefined,
    'Rename the plugin or its manifest "name" so it is not empty and does not contain ":" or "/"',
  );

const duplicateWarning = (plugin: string, a: string, b: string): Diagnostic =>
  warn(
    'W_PLUGIN_DUPLICATE',
    `plugin namespace "${plugin}" is installed more than once`,
    undefined,
    `Installed at both "${a}" and "${b}"; disable one`,
  );

export function parsePluginList(json: string): { scopes: Scope[]; diagnostics: Diagnostic[] } {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { scopes: [], diagnostics: [listWarning('could not parse the plugin list')] };
  }
  if (!Array.isArray(data)) return { scopes: [], diagnostics: [listWarning('the plugin list is not a JSON array')] };
  const diagnostics: Diagnostic[] = [];
  const scopes: Scope[] = [];
  for (const p of data) {
    if (typeof p !== 'object' || p === null) continue;
    const { id, enabled, installPath } = p as { id?: unknown; enabled?: unknown; installPath?: unknown };
    if (enabled !== true || typeof installPath !== 'string') continue;
    const manifest = manifestName(installPath);
    const namespace = manifest ?? (typeof id === 'string' ? id.split('@')[0]! : undefined);
    if (namespace === undefined) continue;
    if (namespace === '' || namespace.includes(':') || namespace.includes('/')) {
      diagnostics.push(nameWarning(namespace));
      continue;
    }
    scopes.push({ kind: 'plugin', root: resolve(installPath), plugin: namespace });
  }
  scopes.sort((a, b) => cmp(a.plugin!, b.plugin!) || cmp(a.root, b.root));
  const seen = new Map<string, Scope>();
  const deduped: Scope[] = [];
  for (const s of scopes) {
    const existing = seen.get(s.plugin!);
    if (existing) {
      diagnostics.push(duplicateWarning(s.plugin!, existing.root, s.root));
      continue;
    }
    seen.set(s.plugin!, s);
    deduped.push(s);
  }
  return { scopes: deduped, diagnostics };
}

const PLUGIN_LIST_TIMEOUT_MS = 20_000;

// On failure, `reason` says why (no claude on PATH, a timeout, a signal, or the exit code and
// first line of stderr), so the W_PLUGIN_LIST warning points at the real problem.
export function runPluginList(cwd?: string, timeoutMs = PLUGIN_LIST_TIMEOUT_MS): { json?: string; reason?: string } {
  try {
    return {
      json: execFileSync('claude', ['plugin', 'list', '--json'], {
        encoding: 'utf8',
        timeout: timeoutMs,
        stdio: ['ignore', 'pipe', 'pipe'],
        ...(cwd !== undefined ? { cwd } : {}),
      }),
    };
  } catch (e) {
    const x = e as NodeJS.ErrnoException & { status?: number | null; signal?: string | null; stderr?: string };
    const firstLine = (x.stderr ?? '').split('\n').map((l) => l.trim()).find((l) => l !== '');
    const cause = x.code === 'ENOENT' ? 'claude is not on PATH'
      : x.code === 'ETIMEDOUT' ? `no answer within ${timeoutMs / 1000}s`
      : x.signal ? `killed by ${x.signal}`
      : typeof x.status === 'number' ? `exit code ${x.status}${firstLine ? `: ${firstLine}` : ''}`
      : x.message;
    return { reason: `could not run "claude plugin list --json" (${cause})` };
  }
}

export interface DiscoverOptions {
  cwd: string;
  home: string;
  pluginListJson?: string;
  pluginListUnavailableReason?: string;
  selfPluginRoot?: string;
}

export interface Discovery {
  scopes: Scope[];
  project: ProjectLocation;
  diagnostics: Diagnostic[];
}

export function discoverScopes(o: DiscoverOptions): Discovery {
  const diagnostics: Diagnostic[] = [];
  const located = locateProject(o.cwd);
  const userRoot = join(resolve(o.home), '.claude');
  const dropped = located.claudeDir !== undefined && sameDir(located.claudeDir, userRoot);
  const project: ProjectLocation = dropped ? { base: located.base, droppedClaudeDir: located.claudeDir } : located;
  const scopes: Scope[] = [];
  if (project.claudeDir) scopes.push({ kind: 'project', root: project.claudeDir });
  scopes.push({ kind: 'user', root: userRoot });
  if (o.pluginListJson === undefined) {
    diagnostics.push(listWarning(o.pluginListUnavailableReason ?? 'could not run "claude plugin list --json"'));
  } else {
    const p = parsePluginList(o.pluginListJson);
    scopes.push(...p.scopes);
    diagnostics.push(...p.diagnostics);
  }
  if (o.selfPluginRoot !== undefined) {
    const name = manifestName(o.selfPluginRoot);
    if (name !== undefined && (name === '' || name.includes(':') || name.includes('/'))) {
      diagnostics.push(nameWarning(name));
    } else if (name && !scopes.some((s) => s.kind === 'plugin' && s.plugin === name)) {
      scopes.push({ kind: 'plugin', root: resolve(o.selfPluginRoot), plugin: name });
    }
  }
  const nonPlugin = scopes.filter((s) => s.kind !== 'plugin');
  const plugin = scopes
    .filter((s) => s.kind === 'plugin')
    .sort((a, b) => (a.plugin! < b.plugin! ? -1 : a.plugin! > b.plugin! ? 1 : 0));
  return { scopes: [...nonPlugin, ...plugin], project, diagnostics };
}
