import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAuthored, distinctPrimaries, diffSnapshots, pluginFingerprint, snapshotGitTree, snapshotTree, type AuthorCheck } from './checks';
import { costLine, sourceCost, type SourceCost } from '../cost/tokens';

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

const briefsDir = join(here, 'briefs');
const briefs = readdirSync(briefsDir).filter((f) => f.endsWith('.md')).sort();
const ISOLATION = ['--setting-sources', '', '--strict-mcp-config', '--no-session-persistence'];
// We considered narrowing this to `Bash(node "<exact bundle path>" *)`, but the skill emits the
// command with the base directory Claude Code reports to it (quoted, with a literal `..` segment:
// see skills/author/SKILL.md's "Tools" section), and allow-rule matching is a literal
// prefix/glob match on that command text, not a path-equivalence check. A narrower rule that
// didn't match the exact text the model writes would silently break a live, paid eval run (max 2
// attempts). The snapshot diff below enforces the "nothing outside the temp project" rule instead
// — it doesn't depend on which command wrote the file, so it isn't exposed to that risk.
const TOOLS = ['--allowedTools', 'Read,Write,Edit,Glob,Grep,Bash(node *),Skill'];
// Claude Code protects `.claude/`: in -p mode a write there becomes a permission prompt that no allow rule or
// acceptEdits answers, so it is denied. This MCP tool answers those prompts, approving only persona and unit
// files in the project's `.claude/personas/` (see README "Permissions").
const approver = JSON.stringify({ mcpServers: { approver: { command: 'node', args: [join(here, 'approve-personas.mjs')] } } });
const APPROVE = ['--mcp-config', approver, '--permission-prompt-tool', 'mcp__approver__approve'];
// Full transcripts (every tool call, result, and permission denial) are kept next to the results file.
const OUTPUT = ['--output-format', 'stream-json', '--verbose'];
const PLUGIN = ['--plugin-dir', repo, '--model', model];
// What is actually spawned, minus the trailing prompt text (recorded separately per brief).
const ARGV = ['-p', ...PLUGIN, ...ISOLATION, ...TOOLS, ...APPROVE, ...OUTPUT, '--'];

// Without these, the CLI falls back to the user's real ~/.claude and runs the real `claude plugin
// list`, so the eval's view of "what's installed" depends on their machine. PERSONA_PLUGINS_JSON
// pointing at `[]` still lets the CLI find the repo's own starter units through `selfPluginRoot`
// (see src/cli/bin.ts), it just stops it from also reporting the user's installed plugins.
const pluginsJsonDir = mkdtempSync(join(tmpdir(), 'author-eval-plugins-'));
const pluginsJsonFile = join(pluginsJsonDir, 'plugins.json');
writeFileSync(pluginsJsonFile, '[]');

// "Write nothing outside the temporary project" is checked by snapshotting (path + mtime +
// size) before and after each run and diffing. The repo is snapshotted via `git ls-files -co
// --exclude-standard` (snapshotGitTree): tracked files plus untracked-but-not-ignored ones, which
// skips `.git`, anything gitignored (`.worktrees/`, `.superpowers/`, `node_modules/`,
// `evals/results` among them), without an exclude list that has to be kept in sync with the repo's
// ignore rules. The two home roots below aren't git repos, so they still use a plain tree walk.
const realHomePersonas = join(homedir(), '.claude', 'personas');

function prompt(brief: string): string {
  return `Use the author skill.\n\n${brief}\n\nTreat this brief as my complete answers to your interview: do not ask me questions; make reasonable choices, save to the project scope, and finish when validate reports 0 errors.`;
}

function permissionDenials(stdout: string): unknown[] {
  for (const line of stdout.split('\n').reverse()) {
    try {
      const ev = JSON.parse(line) as { type?: string; permission_denials?: unknown[] };
      if (ev.type === 'result') return ev.permission_denials ?? [];
    } catch {}
  }
  return [];
}

if (dryRun) {
  for (const b of briefs) console.log(`--- ${b}\n${prompt(readFileSync(join(briefsDir, b), 'utf8').trim())}`);
  console.log(`argv: claude ${ARGV.join(' ')} <prompt>`);
  console.log('env: PERSONA_HOME=<fresh temp dir per run>, PERSONA_PLUGINS_JSON=<temp file containing []>');
  process.exit(0);
}

const pluginBefore = pluginFingerprint(repo);
const claudeVersion = spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout?.trim();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const transcripts = join(repo, 'evals', 'results', `author-${stamp}`);
mkdirSync(transcripts, { recursive: true });
const results: { brief: string; exit: number | null; check: AuthorCheck; cost: SourceCost; dir: string; transcript: string; denials: unknown[]; personaHome: string }[] = [];
for (const b of briefs) {
  const dir = mkdtempSync(join(tmpdir(), 'author-eval-'));
  mkdirSync(join(dir, '.git'));
  mkdirSync(join(dir, '.claude', 'personas'), { recursive: true });
  const personaHome = mkdtempSync(join(tmpdir(), 'author-eval-home-'));
  process.stdout.write(`${b}... `);

  const repoBefore = snapshotGitTree(repo);
  const realHomeBefore = snapshotTree(realHomePersonas);
  const personaHomeBefore = snapshotTree(personaHome);

  const r = spawnSync('claude', [...ARGV, prompt(readFileSync(join(briefsDir, b), 'utf8').trim())], {
    cwd: dir,
    env: { ...process.env, PERSONA_HOME: personaHome, PERSONA_PLUGINS_JSON: pluginsJsonFile },
    encoding: 'utf8',
    timeout: 20 * 60 * 1000,
    maxBuffer: 64 * 1024 * 1024,
  });

  const outsideWrites = [
    ...diffSnapshots(repoBefore, snapshotGitTree(repo)).map((p) => `wrote outside the temp project (repo: ${p})`),
    ...diffSnapshots(realHomeBefore, snapshotTree(realHomePersonas)).map((p) => `wrote outside the temp project (~/.claude/personas: ${p})`),
    ...diffSnapshots(personaHomeBefore, snapshotTree(personaHome)).map((p) => `wrote outside the temp project (PERSONA_HOME: ${p})`),
  ];

  const transcript = join(transcripts, b.replace(/\.md$/, '.jsonl'));
  writeFileSync(transcript, `${r.stdout ?? ''}${r.stderr ? `\n// stderr\n${r.stderr}` : ''}`);
  const check = checkAuthored(join(dir, '.claude'), repo, pluginBefore);
  check.problems.push(...outsideWrites);
  const cost = sourceCost((r.stdout ?? '').split('\n'));
  results.push({ brief: b, exit: r.status, check, cost, dir, transcript, denials: permissionDenials(r.stdout ?? ''), personaHome });
  console.log(check.problems.length === 0 ? `ok (${check.persona}: ${check.primary.join(', ')})` : `FAIL: ${check.problems.join('; ')}`);
  console.log(`  ${costLine(cost)}`);
}

const problems = results.flatMap((r) => r.check.problems.map((p) => `${r.brief}: ${p}`));
problems.push(...distinctPrimaries(results.map((r) => ({ brief: r.brief, primary: r.check.primary }))));
const pass = problems.length === 0;
console.log(pass ? 'PASS' : `FAIL\n${problems.map((p) => `  ${p}`).join('\n')}`);
mkdirSync(join(repo, 'evals', 'results'), { recursive: true });
const out = join(repo, 'evals', 'results', `author-${stamp}.json`);
writeFileSync(
  out,
  JSON.stringify(
    { model, claudeVersion, argv: ARGV, pluginsJsonFile, pass, problems, results },
    null,
    2,
  ),
);
console.log(`wrote ${out}`);
process.exit(pass ? 0 : 1);
