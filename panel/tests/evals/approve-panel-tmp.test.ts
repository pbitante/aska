import { spawnSync } from 'node:child_process';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mkdtemp } from '../helpers/tree';

const server = fileURLToPath(new URL('../../evals/panel/approve-tmp.mjs', import.meta.url));

function decide(cwd: string, tool_name: string, input: Record<string, unknown>): { behavior: string } {
  const req = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'approve', arguments: { tool_name, input } } };
  const r = spawnSync('node', [server], { cwd, input: `${JSON.stringify(req)}\n`, encoding: 'utf8' });
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
});
