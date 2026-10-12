import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const bundle = resolve('skills/operator/scripts/persona.mjs');
const cwd = resolve('tests/fixtures/smoke');

const tmpRoots = [];
function mkTemp(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpRoots.push(dir);
  return dir;
}

const baseEnv = { ...process.env, PERSONA_HOME: mkTemp('persona-smoke-'), PERSONA_PLUGINS_JSON: join(cwd, 'plugins.json') };

// A PATH with only a `node` symlink on it, so `claude plugin list --json` can't be found.
const noClaudePath = mkTemp('persona-smoke-path-');
symlinkSync(process.execPath, join(noClaudePath, 'node'));
const noClaudeEnv = { ...baseEnv, PATH: noClaudePath };
delete noClaudeEnv.PERSONA_PLUGINS_JSON;

let failed = 0;
try {
  failed = await runSmokeCases();
} finally {
  for (const dir of tmpRoots) rmSync(dir, { recursive: true, force: true });
}
process.exit(failed > 0 ? 1 : 0);

async function runSmokeCases() {

  const smokeIn = mkTemp('persona-smoke-in-');
  writeFileSync(join(smokeIn, 'wrong-name.md'), '---\nname: other\ndescription: X.\nthreshold: medium\n---\n');

  const cases = [
    { args: ['--help'], code: 0, expect: 'usage: persona' },
    { args: ['validate'], code: 0, expect: 'reader: ok' },
    { args: ['explain', 'reader'], code: 0, expect: '# Persona: reader' },
    { args: ['explain', 'nobody'], code: 1, expect: 'E_UNKNOWN_REF' },
    { args: ['list', 'units', '--json'], code: 0, expect: '"canonical": "clarity"' },
    { args: ['list', 'personas', '--json'], code: 0, expect: '"units": {' },
    { args: ['list', 'panels', '--json'], code: 0, expect: '"canonical": "review"' },
    { args: ['prompt', 'reader', '--panel'], code: 0, expect: 'Respond with only a JSON object' },
    { args: ['check-judgment', 'reader'], code: 1, expect: '"not valid JSON"', input: 'not json' },
    { args: ['check-evidence'], code: 1, expect: 'missing section', input: 'Looks fine to me.' },
    { args: ['compare'], code: 1, expect: 'E_PANEL_RESULT', input: '' },
    { args: ['show', 'persona', 'reader', '--json'], code: 0, expect: '"kind": "persona"' },
    { args: ['save', 'unit', 'clarity', '--scope', 'project', '--file', join(smokeIn, 'wrong-name.md'), '--json'], code: 1, expect: 'E_NAME_MISMATCH' },
    { args: ['runs', 'list', '--json'], code: 0, expect: '[]' },
    { args: ['runs', 'new'], code: 0, expect: '/.claude/aska/runs/' },
    {
      args: ['validate'],
      code: 0,
      expect: 'could not read',
      env: { ...baseEnv, PERSONA_PLUGINS_JSON: join(cwd, 'no-such-plugins.json') },
    },
    {
      args: ['validate'],
      code: 0,
      expect: 'could not run "claude plugin list --json"',
      env: noClaudeEnv,
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const r = spawnSync(process.execPath, [bundle, ...c.args], { cwd, env: c.env ?? baseEnv, encoding: 'utf8', input: c.input });
    const ok = r.status === c.code && r.stdout.includes(c.expect);
    console.log(`${ok ? 'ok  ' : 'FAIL'} persona ${c.args.join(' ')} (exit ${r.status})`);
    if (!ok) {
      failed++;
      console.log(r.stdout, r.stderr);
    }
  }

  // Regression guard: a writer slower than Node's startup must still validate normally.
  // `process.stdin.isTTY` creates Node's stdin stream, which as a side effect sets O_NONBLOCK on
  // a pipe or socket fd 0; the later readFileSync(0) then throws EAGAIN on any writer that hasn't
  // finished by the time Node reads, which `spawnSync({ input })` never exercises because it
  // writes everything up front before the child even starts.
  {
    const judgment = JSON.stringify({ persona: 'reader', verdict: 'proceed', findings: [], cleared: ['clarity'], not_applicable: [] });
    const r = await new Promise((done) => {
      const p = spawn(process.execPath, [bundle, 'check-judgment', 'reader'], { cwd, env: baseEnv, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      p.stdout.on('data', (d) => { stdout += d; });
      p.stderr.on('data', (d) => { stderr += d; });
      p.on('close', (status) => done({ status, stdout, stderr }));
      setTimeout(() => p.stdin.end(judgment), 300);
    });
    const ok = r.status === 0 && r.stdout.includes('"valid": true');
    console.log(`${ok ? 'ok  ' : 'FAIL'} persona check-judgment reader (stdin written after a 300ms delay) (exit ${r.status})`);
    if (!ok) {
      failed++;
      console.log(r.stdout, r.stderr);
    }
  }

  // Every starter unit in personas/ must be reachable via its `aska:<unit>` canonical, not just one sentinel.
  {
    const expected = readdirSync(resolve('personas')).filter((f) => f.endsWith('.unit.md')).length;
    const r = spawnSync(process.execPath, [bundle, 'list', 'units', '--json'], { cwd, env: baseEnv, encoding: 'utf8' });
    let starterCanonicals = [];
    try {
      starterCanonicals = JSON.parse(r.stdout).units
        .map((u) => u.canonical)
        .filter((c) => c.startsWith('aska:'));
    } catch {
      starterCanonicals = [];
    }
    const ok = r.status === 0 && expected > 0 && starterCanonicals.length === expected;
    console.log(`${ok ? 'ok  ' : 'FAIL'} persona list units --json has all ${expected} aska:<unit> canonicals (found ${starterCanonicals.length})`);
    if (!ok) {
      failed++;
      console.log(r.stdout, r.stderr);
    }
  }

  // A fake `claude` that records whether it ran, to prove --help and usage errors never spawn it,
  // while a real command still does.
  const fakeClaudeDir = mkTemp('persona-smoke-fakeclaude-');
  const invokedMarker = join(fakeClaudeDir, 'invoked');
  writeFileSync(join(fakeClaudeDir, 'claude'), `#!/bin/sh\ntouch "${invokedMarker}"\necho '[]'\n`, { mode: 0o755 });
  const fakeClaudeEnv = {
    ...process.env,
    PATH: `${fakeClaudeDir}:${process.env.PATH}`,
    PERSONA_HOME: mkTemp('persona-smoke-'),
  };
  delete fakeClaudeEnv.PERSONA_PLUGINS_JSON;

  function spawnedClaude(args) {
    if (existsSync(invokedMarker)) rmSync(invokedMarker);
    spawnSync(process.execPath, [bundle, ...args], { cwd, env: fakeClaudeEnv, encoding: 'utf8' });
    return existsSync(invokedMarker);
  }

  for (const [args, expected, label] of [
    [['--help'], false, 'persona --help never spawns claude'],
    [['bogus'], false, 'persona bogus (usage error) never spawns claude'],
    [['validate'], true, 'persona validate spawns claude'],
  ]) {
    const ran = spawnedClaude(args);
    const ok = ran === expected;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
    if (!ok) failed++;
  }

  return failed;
}
