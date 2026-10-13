import { spawnSync } from 'node:child_process';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mkdtemp } from '../helpers/tree';

const server = fileURLToPath(new URL('../../evals/panel/approve-tmp.mjs', import.meta.url));

function decide(cwd: string, tool_name: string, input: Record<string, unknown>, personaHome?: string): { behavior: string } {
  const req = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'approve', arguments: { tool_name, input } } };
  const env = { ...process.env };
  delete env.PERSONA_HOME;
  if (personaHome !== undefined) env.PERSONA_HOME = personaHome;
  const r = spawnSync('node', [server], { cwd, env, input: `${JSON.stringify(req)}\n`, encoding: 'utf8' });
  return JSON.parse(JSON.parse(r.stdout.trim()).result.content[0].text);
}

describe('panel eval permission approver', () => {
  it('allows a Write directly under an aska-panel-* temp folder', () => {
    const dir = mkdtemp('aska-panel-');
    expect(decide(dir, 'Write', { file_path: join(dir, 'brief.md') }).behavior).toBe('allow');
  });

  it('allows a Write nested under an aska-panel-* temp folder', () => {
    const dir = mkdtemp('aska-panel-');
    mkdirSync(join(dir, 'judgments'));
    expect(decide(dir, 'Write', { file_path: join(dir, 'judgments', 'guardian.json') }).behavior).toBe('allow');
  });

  it('denies a Write in a temp folder without the aska-panel- prefix (e.g. the eval\'s project)', () => {
    const dir = mkdtemp('panel-eval-project-');
    mkdirSync(join(dir, '.claude', 'personas'), { recursive: true });
    expect(decide(dir, 'Write', { file_path: join(dir, '.claude', 'personas', 'x.persona.md') }).behavior).toBe('deny');
    expect(decide(dir, 'Write', { file_path: join(dir, 'scenario.md') }).behavior).toBe('deny');
  });

  it('denies other tools and a relative escape out of the temp folder', () => {
    const dir = mkdtemp('aska-panel-');
    expect(decide(dir, 'Bash', { command: 'rm -rf /', file_path: join(dir, 'brief.md') }).behavior).toBe('deny');
    expect(decide(dir, 'Write', { file_path: join(dir, '..', 'escaped.txt') }).behavior).toBe('deny');
  });

  it('denies a write through a symlinked target file', () => {
    const dir = mkdtemp('aska-panel-');
    const outside = mkdtemp('aska-panel-outside-');
    const target = join(outside, 'secret.txt');
    writeFileSync(target, 'x');
    symlinkSync(target, join(dir, 'evil.md'));
    expect(decide(dir, 'Write', { file_path: join(dir, 'evil.md') }).behavior).toBe('deny');
  });

  it('denies a write through a symlinked directory component that a ".." segment lexically folds away', () => {
    const dir = mkdtemp('aska-panel-');
    const elsewhere = mkdtemp('aska-panel-elsewhere-');
    symlinkSync(elsewhere, join(dir, 'link'));
    // Built as a literal string, not via path.join/resolve: those would lexically collapse
    // "link/.." to nothing before the server ever sees it, hiding the escape being tested.
    // Really, the filesystem follows the "link" symlink first, so the write would land next to
    // `elsewhere`, outside the aska-panel- folder being checked.
    expect(decide(dir, 'Write', { file_path: `${dir}/link/../x.txt` }).behavior).toBe('deny');
  });

  describe('kept-run store under PERSONA_HOME', () => {
    const RUN = '20261013T101500Z-abc123';
    function home(): { home: string; run: string } {
      const h = mkdtemp('panel-eval-home-');
      const run = join(h, '.claude', 'aska', 'runs', RUN);
      mkdirSync(run, { recursive: true });
      return { home: h, run };
    }

    it('allows a Write directly in a run folder', () => {
      const { home: h, run } = home();
      expect(decide(h, 'Write', { file_path: join(run, 'brief.md') }, h).behavior).toBe('allow');
    });

    it('allows a Write nested in a run folder', () => {
      const { home: h, run } = home();
      mkdirSync(join(run, 'judgments'));
      expect(decide(h, 'Write', { file_path: join(run, 'judgments', 'guardian.json') }, h).behavior).toBe('allow');
    });

    it('denies a folder under runs/ whose name is not a run id', () => {
      const { home: h } = home();
      const bad = join(h, '.claude', 'aska', 'runs', 'not-a-run');
      mkdirSync(bad);
      expect(decide(h, 'Write', { file_path: join(bad, 'x.md') }, h).behavior).toBe('deny');
    });

    it('denies a file directly in runs/ and a sibling of runs/', () => {
      const { home: h } = home();
      expect(decide(h, 'Write', { file_path: join(h, '.claude', 'aska', 'runs', 'x.md') }, h).behavior).toBe('deny');
      mkdirSync(join(h, '.claude', 'aska', 'other'));
      expect(decide(h, 'Write', { file_path: join(h, '.claude', 'aska', 'other', 'x.md') }, h).behavior).toBe('deny');
      expect(decide(h, 'Write', { file_path: join(h, '.claude', 'personas', 'x.persona.md') }, h).behavior).toBe('deny');
    });

    it('denies a ".." escape through a run folder that does not exist yet', () => {
      const { home: h } = home();
      const ghost = join(h, '.claude', 'aska', 'runs', '20261013T101500Z-zzzzzz');
      expect(decide(h, 'Write', { file_path: `${ghost}/../../other/x.md` }, h).behavior).toBe('deny');
      expect(decide(h, 'Write', { file_path: `${ghost}/../../../../x.md` }, h).behavior).toBe('deny');
    });

    it('denies a ".." escape out of a run folder', () => {
      const { home: h, run } = home();
      expect(decide(h, 'Write', { file_path: `${run}/../x.md` }, h).behavior).toBe('deny');
    });

    it('denies a symlinked directory inside a run folder that points outside', () => {
      const { home: h, run } = home();
      const outside = mkdtemp('panel-eval-outside-');
      symlinkSync(outside, join(run, 'link'));
      expect(decide(h, 'Write', { file_path: join(run, 'link', 'x.md') }, h).behavior).toBe('deny');
      expect(decide(h, 'Write', { file_path: `${run}/link/../x.md` }, h).behavior).toBe('deny');
    });

    it('denies a run folder that is itself a symlink out of PERSONA_HOME', () => {
      const h = mkdtemp('panel-eval-home-');
      const outside = mkdtemp('panel-eval-outside-');
      mkdirSync(join(h, '.claude', 'aska', 'runs'), { recursive: true });
      symlinkSync(outside, join(h, '.claude', 'aska', 'runs', RUN));
      expect(decide(h, 'Write', { file_path: join(h, '.claude', 'aska', 'runs', RUN, 'x.md') }, h).behavior).toBe('deny');
    });

    it('denies a write through a symlinked target file', () => {
      const { home: h, run } = home();
      const outside = mkdtemp('panel-eval-outside-');
      writeFileSync(join(outside, 's.txt'), 'x');
      symlinkSync(join(outside, 's.txt'), join(run, 'evil.md'));
      expect(decide(h, 'Write', { file_path: join(run, 'evil.md') }, h).behavior).toBe('deny');
    });

    it('denies everything there when PERSONA_HOME is unset', () => {
      const { home: h, run } = home();
      expect(decide(h, 'Write', { file_path: join(run, 'brief.md') }).behavior).toBe('deny');
    });
  });
});
