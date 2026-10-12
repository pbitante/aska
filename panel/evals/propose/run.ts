import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePersona } from '../../src/resolve/resolve';
import { Registry } from '../../src/scopes/registry';
import { diffSnapshots, snapshotGitTree, snapshotTree } from '../author/checks';
import { checkProposalRun } from './checks';
import { SCENARIOS, type ProposalScenario } from './scenarios';
import { costLine, sourceCost } from '../cost/tokens';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const mi = args.indexOf('--model');
if (mi >= 0 && (args[mi + 1] === undefined || args[mi + 1]!.startsWith('--'))) {
  console.error('--model needs a value');
  process.exit(2);
}
const model = mi >= 0 ? args[mi + 1]! : 'sonnet';
for (const a of args) {
  if (a.startsWith('--') && a !== '--dry-run' && a !== '--model') {
    console.error(`unknown flag ${a}`);
    process.exit(2);
  }
}

const ISOLATION = ['--setting-sources', '', '--strict-mcp-config', '--no-session-persistence'];
// Agent/Task are allowed so that a premature panelist launch shows up in the transcript (and
// fails the run) instead of being silently denied. No Write: a proposal writes nothing.
const TOOLS = ['--allowedTools', 'Read,Glob,Grep,Bash(node *),Skill,Agent,Task'];
const OUTPUT = ['--output-format', 'stream-json', '--verbose'];
const PLUGIN = ['--plugin-dir', repo, '--model', model];
const ARGV = ['-p', ...PLUGIN, ...ISOLATION, ...TOOLS, ...OUTPUT, '--'];
const promptFor = (s: ProposalScenario) => `Use the panel skill. /aska:panel : ${s.question}`;

if (dryRun) {
  for (const s of SCENARIOS) console.log(`${s.id}: ${promptFor(s)}`);
  console.log(`argv: claude ${ARGV.join(' ')} <prompt>`);
  console.log('env: PERSONA_HOME=<fresh temp dir>, PERSONA_PLUGINS_JSON=<temp file containing []>');
  process.exit(0);
}

function parseEvents(stdout: string): unknown[] {
  const events: unknown[] = [];
  for (const line of stdout.split('\n')) {
    if (line.trim() === '') continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // not a JSON line (e.g. stray stdout); ignore
    }
  }
  return events;
}

function finalResultText(events: unknown[]): string {
  for (const e of [...events].reverse()) {
    const ev = e as { type?: string; result?: unknown };
    if (ev.type === 'result' && typeof ev.result === 'string') return ev.result;
  }
  return '';
}

// Only the plugin's own personas are in scope: the project is empty, PERSONA_HOME is fresh,
// and the plugin list is [] (the CLI always adds its own plugin root).
const reg = new Registry([{ kind: 'plugin', root: repo, plugin: 'aska' }]);
const resolves = (p: string) => resolvePersona(reg, p).effective !== undefined;

const pluginsJsonDir = mkdtempSync(join(tmpdir(), 'propose-eval-plugins-'));
const pluginsJsonFile = join(pluginsJsonDir, 'plugins.json');
writeFileSync(pluginsJsonFile, '[]');

const realHomePersonas = join(homedir(), '.claude', 'personas');
const repoBefore = snapshotGitTree(repo);
const realHomeBefore = snapshotTree(realHomePersonas);
const claudeVersion = spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout?.trim();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const transcripts = join(repo, 'evals', 'results');
mkdirSync(transcripts, { recursive: true });

const runs = [];
for (const s of SCENARIOS) {
  const projectDir = mkdtempSync(join(tmpdir(), 'propose-eval-project-'));
  mkdirSync(join(projectDir, '.git'));
  cpSync(join(repo, s.file), join(projectDir, 'scenario.md'));
  const personaHome = mkdtempSync(join(tmpdir(), 'propose-eval-home-'));
  const projectBefore = snapshotTree(projectDir);

  const r = spawnSync('claude', [...ARGV, promptFor(s)], {
    cwd: projectDir,
    env: { ...process.env, PERSONA_HOME: personaHome, PERSONA_PLUGINS_JSON: pluginsJsonFile },
    encoding: 'utf8',
    timeout: 10 * 60 * 1000,
    maxBuffer: 64 * 1024 * 1024,
  });

  const transcript = join(transcripts, `propose-${stamp}-${s.id}.jsonl`);
  writeFileSync(transcript, `${r.stdout ?? ''}${r.stderr ? `\n// stderr\n${r.stderr}` : ''}`);
  const events = parseEvents(r.stdout ?? '');
  const check = checkProposalRun({ events, reply: finalResultText(events), scenario: s, resolves, projectChanges: diffSnapshots(projectBefore, snapshotTree(projectDir)) });
  const pass = check.problems.length === 0;
  console.log(`${s.id}: ${pass ? 'PASS' : `FAIL\n${check.problems.map((p) => `  ${p}`).join('\n')}`}`);
  for (const x of check.soft) console.log(`  (soft) ${x}`);
  const cost = sourceCost((r.stdout ?? '').split('\n'));
  console.log(`  ${costLine(cost)}`);
  runs.push({ id: s.id, exit: r.status, pass, problems: check.problems, soft: check.soft, cost, projectDir, personaHome, transcript });
}

const outsideWrites = [
  ...diffSnapshots(repoBefore, snapshotGitTree(repo)).map((p) => `wrote outside the temp projects (repo: ${p})`),
  ...diffSnapshots(realHomeBefore, snapshotTree(realHomePersonas)).map((p) => `wrote outside the temp projects (~/.claude/personas: ${p})`),
];
for (const w of outsideWrites) console.log(`FAIL ${w}`);
const pass = outsideWrites.length === 0 && runs.every((x) => x.pass);

const out = join(transcripts, `propose-${stamp}.json`);
writeFileSync(out, JSON.stringify({ model, claudeVersion, argv: ARGV, pass, outsideWrites, runs, pluginsJsonFile }, null, 2));
console.log(`${pass ? 'PASS' : 'FAIL'}: wrote ${out}`);
process.exit(pass ? 0 : 1);
