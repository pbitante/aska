import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { isatty } from 'node:tty';
import { fileURLToPath } from 'node:url';
import { runPluginList } from '../scopes/discover';
import { parseArgv, run } from './main';

// The bundle lives at <plugin root>/skills/operator/scripts/persona.mjs.
const selfPluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function pluginList(cwd: string): { json?: string; reason?: string } {
  const fromEnv = process.env.PERSONA_PLUGINS_JSON;
  if (fromEnv === undefined) return runPluginList(cwd);
  try {
    return { json: readFileSync(fromEnv, 'utf8') };
  } catch {
    return { reason: `could not read "${fromEnv}"` };
  }
}

const argv = process.argv.slice(2);
const cwd = process.cwd();
// --help and usage errors never need plugin data, so don't pay for spawning `claude` to get it.
// `targets` reads only the step file, so it never needs plugin data either.
const parsed = parseArgv(argv, cwd);
const needsPlugins = (parsed.kind === 'command' && parsed.command !== 'targets') || parsed.kind === 'author';
const pl = needsPlugins ? pluginList(parsed.cwd) : {};
process.exitCode = run(argv, {
  cwd,
  home: process.env.PERSONA_HOME ?? homedir(),
  pluginListJson: pl.json,
  pluginListUnavailableReason: pl.reason,
  selfPluginRoot,
  out: (line) => process.stdout.write(`${line}\n`),
  columns: process.stdout.columns,
  err: (line) => process.stderr.write(`${line}\n`),
  stdin: () => readFileSync(0, 'utf8'),
  // isatty(0) checks fd 0 directly, unlike process.stdin.isTTY, whose getter creates Node's
  // stdin stream and as a side effect sets O_NONBLOCK on a pipe or socket fd 0 — which then
  // makes the later readFileSync(0) throw EAGAIN on any writer slower than Node's startup.
  stdinIsTTY: isatty(0),
});
