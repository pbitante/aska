import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateJudgment } from '../../src/judgment/validate';
import { comparePanel, parsePanelResult, type PanelResult } from '../../src/panel/compare';
import { resolvePersona } from '../../src/resolve/resolve';
import { Registry } from '../../src/scopes/registry';
import { checkPanelRun, costModelMismatches, evalEnv, findTempFolder, ignoreKeptRunChanges, panelistLaunchModels, panelistModelMismatches, parallelPanelistLaunch, type ExpectedModel, type PanelRunInput } from './checks';
import { diffSnapshots, snapshotGitTree, snapshotTree } from '../author/checks';
import { costLine, sourceCost } from '../cost/tokens';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const mixedModels = args.includes('--mixed-models');
const mi = args.indexOf('--model');
const model = mi >= 0 && args[mi + 1] ? args[mi + 1]! : 'sonnet';
for (const a of args) {
  if (a.startsWith('--') && a !== '--dry-run' && a !== '--model' && a !== '--mixed-models') {
    console.error(`unknown flag ${a}`);
    process.exit(2);
  }
}

const PANELISTS = ['guardian', 'accelerator'];
const ISOLATION = ['--setting-sources', '', '--strict-mcp-config', '--no-session-persistence'];
const TOOLS = ['--allowedTools', 'Read,Write,Glob,Grep,Bash(node *),Bash(mktemp *),Bash(mkdir *),Agent,Task,Skill'];
// Claude Code asks for permission on a Write outside the current project (and, separately, on
// anything under `.claude/`) even with these tools pre-allowed; this MCP tool answers those
// prompts, approving only the kept-run folder the panel skill creates in PERSONA_HOME (`runs new`)
// or the `aska-panel-*` temp folder it falls back to (`mktemp -d -t aska-panel-XXXXXX`); see
// evals/panel/approve-tmp.mjs. The temp *project* below is
// never approved, so any write the model makes there is caught only by the snapshot diff — same
// reasoning as the author eval's unnarrowed `Bash(node *)` (see evals/author/README.md).
// PERSONA_HOME is set in the server's own `env` rather than left to inheritance, because the
// approver needs it to recognise the kept-run folder and an MCP stdio server may get only a
// reduced environment.
const approve = (home: string) => [
  '--mcp-config',
  JSON.stringify({ mcpServers: { approver: { command: 'node', args: [join(here, 'approve-tmp.mjs')], env: { PERSONA_HOME: home } } } }),
  '--permission-prompt-tool',
  'mcp__approver__approve',
];
const OUTPUT = ['--output-format', 'stream-json', '--verbose'];
const PLUGIN = ['--plugin-dir', repo, '--model', model];
const argvFor = (home: string) => ['-p', ...PLUGIN, ...ISOLATION, ...TOOLS, ...approve(home), ...OUTPUT, '--'];

const PROMPT = mixedModels
  ? 'Use the panel skill. /aska:panel --model haiku guardian accelerator@sonnet: Should the change described in scenario.md ship? Treat this as my complete request; do not ask me questions.'
  : 'Use the panel skill. /aska:panel guardian accelerator: Should the change described in scenario.md ship? Treat this as my complete request; do not ask me questions.';
const EXPECTED_MODELS: ExpectedModel[] = [
  { persona: 'guardian', model: 'haiku', modelSource: 'run' },
  { persona: 'accelerator', model: 'sonnet', modelSource: 'panelist' },
];

const realHomePersonas = join(homedir(), '.claude', 'personas');

if (dryRun) {
  console.log(PROMPT);
  console.log(`argv: claude ${argvFor('<fresh temp dir>').join(' ')} <prompt>`);
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

type PanelResultRead = { status: 'ok'; result: PanelResult } | { status: 'missing' | 'malformed' };

// A missing panel-result.json (the skill never wrote one) and a malformed one (it wrote
// something, but not valid panel-result JSON) are different failures and must be reported with
// different messages.
function readPanelResult(tempFolder: string | undefined): PanelResultRead {
  if (!tempFolder) return { status: 'missing' };
  let text: string;
  try {
    text = readFileSync(join(tempFolder, 'panel-result.json'), 'utf8');
  } catch {
    return { status: 'missing' };
  }
  const parsed = parsePanelResult(text);
  return parsed.result ? { status: 'ok', result: parsed.result } : { status: 'malformed' };
}

const pluginsJsonDir = mkdtempSync(join(tmpdir(), 'panel-eval-plugins-'));
const pluginsJsonFile = join(pluginsJsonDir, 'plugins.json');
writeFileSync(pluginsJsonFile, '[]');

// Not "aska-panel-*": that prefix is reserved for the folder the panel skill creates for itself,
// and the approver (evals/panel/approve-tmp.mjs) must never approve a write here.
const projectDir = mkdtempSync(join(tmpdir(), 'panel-eval-project-'));
mkdirSync(join(projectDir, '.git'));
mkdirSync(join(projectDir, '.claude', 'personas'), { recursive: true });
const poolDir = join(repo, 'evals', 'pool', '.claude', 'personas');
for (const f of readdirSync(poolDir)) {
  if (f.endsWith('.persona.md') || f.endsWith('.unit.md')) cpSync(join(poolDir, f), join(projectDir, '.claude', 'personas', f));
}
cpSync(join(repo, 'evals', 'scenarios', '01-migration.md'), join(projectDir, 'scenario.md'));
const personaHome = mkdtempSync(join(tmpdir(), 'panel-eval-home-'));

const repoBefore = snapshotGitTree(repo);
const realHomeBefore = snapshotTree(realHomePersonas);
const personaHomeBefore = snapshotTree(personaHome);
const projectBefore = snapshotTree(projectDir);

const claudeVersion = spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout?.trim();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

const ARGV = argvFor(personaHome);
const r = spawnSync('claude', [...ARGV, PROMPT], {
  cwd: projectDir,
  env: evalEnv(process.env, personaHome, pluginsJsonFile),
  encoding: 'utf8',
  // The model's own fallback wake-up (ScheduleWakeup) is scheduled up to 1200s out; a shorter
  // spawnSync timeout than that can kill the process before such a wake-up would even fire.
  timeout: 30 * 60 * 1000,
  maxBuffer: 64 * 1024 * 1024,
});

const outsideWrites = [
  ...diffSnapshots(repoBefore, snapshotGitTree(repo)).map((p) => `wrote outside the temp project (repo: ${p})`),
  ...diffSnapshots(realHomeBefore, snapshotTree(realHomePersonas)).map((p) => `wrote outside the temp project (~/.claude/personas: ${p})`),
  ...ignoreKeptRunChanges(diffSnapshots(personaHomeBefore, snapshotTree(personaHome))).map((p) => `wrote outside the temp project (PERSONA_HOME: ${p})`),
];
const projectChanges = diffSnapshots(projectBefore, snapshotTree(projectDir));

const transcripts = join(repo, 'evals', 'results');
mkdirSync(transcripts, { recursive: true });
const transcript = join(transcripts, `panel-${stamp}.jsonl`);
writeFileSync(transcript, `${r.stdout ?? ''}${r.stderr ? `\n// stderr\n${r.stderr}` : ''}`);

const events = parseEvents(r.stdout ?? '');
const report = finalResultText(events);
const tempFolder = findTempFolder(report, events);
const panelRead = readPanelResult(tempFolder);
const panelists = panelRead.status === 'ok' ? panelRead.result.panelists : undefined;

const reg = new Registry([
  { kind: 'project', root: join(projectDir, '.claude') },
  { kind: 'plugin', root: repo, plugin: 'aska' },
]);

const judgmentViolations: Record<string, string[]> = {};
const verdicts: Record<string, string> = {};
for (const name of PANELISTS) {
  const canonical = reg.lookup('persona', name).file?.canonical ?? name;
  const entry = panelists?.find((p) => p.persona === canonical);
  if (!entry) {
    judgmentViolations[name] = ['panel-result.json has no entry for this panelist'];
    continue;
  }
  if (entry.status === 'ok') {
    const resolution = resolvePersona(reg, entry.persona);
    judgmentViolations[name] = resolution.effective ? validateJudgment(resolution.effective, entry.judgment) : ['persona does not resolve'];
    if (judgmentViolations[name]!.length === 0) {
      const verdict = (entry.judgment as { verdict?: unknown } | undefined)?.verdict;
      if (typeof verdict === 'string') verdicts[name] = verdict;
    }
  } else {
    judgmentViolations[name] = entry.violations && entry.violations.length > 0 ? entry.violations : [entry.reason ?? `status is ${entry.status}`];
  }
}

// comparePanel's followUps is the ground truth the report's "Follow-ups" section must match,
// line by line and in order (persona and type, not just count).
const expectedFollowUps = panelRead.status === 'ok'
  ? comparePanel(panelRead.result, (ref) => resolvePersona(reg, ref).effective).followUps.map((f) => ({ type: f.type, persona: f.persona }))
  : [];
const recommendationRequested = /\brecommend/i.test(PROMPT);

const input: PanelRunInput = { events, report, judgmentViolations, verdicts, panelResultStatus: panelRead.status, projectChanges, expectedFollowUps, recommendationRequested };
const check = checkPanelRun(input);
check.problems.push(...outsideWrites);

const cost = sourceCost((r.stdout ?? '').split('\n'));
if (mixedModels) {
  const expected = EXPECTED_MODELS.map((x) => ({ ...x, persona: reg.lookup('persona', x.persona).file?.canonical ?? x.persona }));
  check.problems.push(...panelistModelMismatches(panelists, panelistLaunchModels(events), expected), ...costModelMismatches(cost, model));
}

const pass = check.problems.length === 0;
console.log(pass ? 'PASS' : `FAIL\n${check.problems.map((p) => `  ${p}`).join('\n')}`);
for (const s of check.soft) console.log(`  (soft) ${s}`);
console.log(`max parallel aska:panelist launches: ${parallelPanelistLaunch(events)}`);
console.log(costLine(cost));

const out = join(transcripts, `panel-${stamp}.json`);
writeFileSync(
  out,
  JSON.stringify(
    { model, mixedModels, claudeVersion, argv: ARGV, exit: r.status, pass, problems: check.problems, soft: check.soft, cost, tempFolder, projectDir, personaHome, pluginsJsonFile, transcript },
    null,
    2,
  ),
);
console.log(`wrote ${out}`);
process.exit(pass ? 0 : 1);
