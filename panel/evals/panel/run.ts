import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateJudgment } from '../../src/judgment/validate';
import { comparePanel, parsePanelResult, type PanelResult } from '../../src/panel/compare';
import { resolvePersona } from '../../src/resolve/resolve';
import { Registry } from '../../src/scopes/registry';
import { checkPanelRun, parallelPanelistLaunch, type PanelRunInput } from './checks';
import { diffSnapshots, snapshotGitTree, snapshotTree } from '../author/checks';
import { costLine, sourceCost } from '../cost/tokens';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const mi = args.indexOf('--model');
const model = mi >= 0 && args[mi + 1] ? args[mi + 1]! : 'sonnet';
for (const a of args) {
  if (a.startsWith('--') && a !== '--dry-run' && a !== '--model') {
    console.error(`unknown flag ${a}`);
    process.exit(2);
  }
}

const PANELISTS = ['guardian', 'accelerator'];
const ISOLATION = ['--setting-sources', '', '--strict-mcp-config', '--no-session-persistence'];
const TOOLS = ['--allowedTools', 'Read,Write,Glob,Grep,Bash(node *),Bash(mktemp *),Bash(mkdir *),Agent,Task,Skill'];
// Claude Code asks for permission on a Write outside the current project (and, separately, on
// anything under `.claude/`) even with these tools pre-allowed; this MCP tool answers those
// prompts, approving only the `aska-panel-*` temp folder the panel skill creates for itself with
// `mktemp -d -t aska-panel-XXXXXX` (see evals/panel/approve-tmp.mjs). The temp *project* below is
// never approved, so any write the model makes there is caught only by the snapshot diff — same
// reasoning as the author eval's unnarrowed `Bash(node *)` (see evals/author/README.md).
const approver = JSON.stringify({ mcpServers: { approver: { command: 'node', args: [join(here, 'approve-tmp.mjs')] } } });
const APPROVE = ['--mcp-config', approver, '--permission-prompt-tool', 'mcp__approver__approve'];
const OUTPUT = ['--output-format', 'stream-json', '--verbose'];
const PLUGIN = ['--plugin-dir', repo, '--model', model];
const ARGV = ['-p', ...PLUGIN, ...ISOLATION, ...TOOLS, ...APPROVE, ...OUTPUT, '--'];

const PROMPT = 'Use the panel skill. /aska:panel guardian accelerator: Should the change described in scenario.md ship? Treat this as my complete request; do not ask me questions.';

const realHomePersonas = join(homedir(), '.claude', 'personas');

if (dryRun) {
  console.log(PROMPT);
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

function toolResultTexts(events: unknown[]): string[] {
  const out: string[] = [];
  for (const e of events) {
    const ev = e as { type?: string; message?: { content?: { type?: string; content?: unknown }[] } };
    if (ev.type !== 'user' && ev.type !== 'assistant') continue;
    for (const c of ev.message?.content ?? []) {
      if (c.type !== 'tool_result') continue;
      if (typeof c.content === 'string') out.push(c.content);
      else if (Array.isArray(c.content)) out.push(c.content.map((x) => (typeof (x as { text?: unknown })?.text === 'string' ? (x as { text: string }).text : '')).join(''));
    }
  }
  return out;
}

// The temp folder is created by the panel skill itself at run time (`mktemp -d -t
// aska-panel-XXXXXX`), so run.ts can't know its path in advance. The report footer names it
// (skills/panel/SKILL.md step 5's "Footer"); the `mktemp` tool's own result is a fallback for a
// run whose report is missing or malformed.
function findTempFolder(report: string, events: unknown[]): string | undefined {
  const re = /\/\S*aska-panel-[A-Za-z0-9]+/g;
  const fromReport = report.match(re);
  if (fromReport) return fromReport[fromReport.length - 1];
  for (const text of toolResultTexts(events)) {
    const m = text.match(re);
    if (m) return m[m.length - 1];
  }
  return undefined;
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

const r = spawnSync('claude', [...ARGV, PROMPT], {
  cwd: projectDir,
  env: { ...process.env, PERSONA_HOME: personaHome, PERSONA_PLUGINS_JSON: pluginsJsonFile },
  encoding: 'utf8',
  // The model's own fallback wake-up (ScheduleWakeup) is scheduled up to 1200s out; a shorter
  // spawnSync timeout than that can kill the process before such a wake-up would even fire.
  timeout: 30 * 60 * 1000,
  maxBuffer: 64 * 1024 * 1024,
});

const outsideWrites = [
  ...diffSnapshots(repoBefore, snapshotGitTree(repo)).map((p) => `wrote outside the temp project (repo: ${p})`),
  ...diffSnapshots(realHomeBefore, snapshotTree(realHomePersonas)).map((p) => `wrote outside the temp project (~/.claude/personas: ${p})`),
  ...diffSnapshots(personaHomeBefore, snapshotTree(personaHome)).map((p) => `wrote outside the temp project (PERSONA_HOME: ${p})`),
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
  const entry = panelists?.find((p) => p.persona === name);
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

const pass = check.problems.length === 0;
console.log(pass ? 'PASS' : `FAIL\n${check.problems.map((p) => `  ${p}`).join('\n')}`);
for (const s of check.soft) console.log(`  (soft) ${s}`);
console.log(`max parallel aska:panelist launches: ${parallelPanelistLaunch(events)}`);
const cost = sourceCost((r.stdout ?? '').split('\n'));
console.log(costLine(cost));

const out = join(transcripts, `panel-${stamp}.json`);
writeFileSync(
  out,
  JSON.stringify(
    { model, claudeVersion, argv: ARGV, exit: r.status, pass, problems: check.problems, soft: check.soft, cost, tempFolder, projectDir, personaHome, pluginsJsonFile, transcript },
    null,
    2,
  ),
);
console.log(`wrote ${out}`);
process.exit(pass ? 0 : 1);
