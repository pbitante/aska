import { spawnSync } from 'node:child_process';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mkdtemp } from '../helpers/tree';

const server = fileURLToPath(new URL('../../evals/author/approve-personas.mjs', import.meta.url));

function decide(cwd: string, tool_name: string, input: Record<string, unknown>): { behavior: string } {
  const req = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'approve', arguments: { tool_name, input } } };
  const r = spawnSync('node', [server], { cwd, input: `${JSON.stringify(req)}\n`, encoding: 'utf8' });
  return JSON.parse(JSON.parse(r.stdout.trim()).result.content[0].text);
}

describe('author eval permission approver', () => {
  const cwd = mkdtemp('approve-');

  it('allows Write and Edit of persona and unit files in .claude/personas/', () => {
    expect(decide(cwd, 'Write', { file_path: '.claude/personas/a.persona.md' }).behavior).toBe('allow');
    expect(decide(cwd, 'Edit', { file_path: join(cwd, '.claude/personas/b.unit.md') }).behavior).toBe('allow');
  });

  it('denies other files, other folders, escapes, and other tools', () => {
    for (const [tool, path] of [
      ['Write', '.claude/settings.json'],
      ['Write', '.claude/personas/notes.md'],
      ['Write', '.claude/personas/sub/a.persona.md'],
      ['Write', '.claude/personas/../a.persona.md'],
      ['Write', 'a.persona.md'],
      ['Write', '/tmp/elsewhere/.claude/personas/a.persona.md'],
      ['Bash', '.claude/personas/a.persona.md'],
    ] as const) {
      expect(decide(cwd, tool, { file_path: path, command: 'x' }).behavior, `${tool} ${path}`).toBe('deny');
    }
  });

  it('denies a write through a symlinked target file', () => {
    const dir = mkdtemp('approve-');
    mkdirSync(join(dir, '.claude', 'personas'), { recursive: true });
    const outside = join(dir, 'outside.txt');
    writeFileSync(outside, 'x');
    symlinkSync(outside, join(dir, '.claude', 'personas', 'evil.persona.md'));
    expect(decide(dir, 'Write', { file_path: '.claude/personas/evil.persona.md' }).behavior).toBe('deny');
  });

  it('denies a write through a symlinked directory component that a ".." segment lexically folds away', () => {
    const dir = mkdtemp('approve-');
    mkdirSync(join(dir, '.claude', 'personas'), { recursive: true });
    const elsewhere = mkdtemp('approve-elsewhere-');
    symlinkSync(elsewhere, join(dir, '.claude', 'personas', 'link'));
    // Lexically, "personas/link/../x.persona.md" resolves to "personas/x.persona.md" (inside the
    // folder). Really, the filesystem follows the "link" symlink first, so the write would land
    // next to `elsewhere`, outside the folder.
    expect(decide(dir, 'Write', { file_path: '.claude/personas/link/../x.persona.md' }).behavior).toBe('deny');
  });

  it('still allows a normal first write once a real .claude/personas/ exists', () => {
    const dir = mkdtemp('approve-');
    mkdirSync(join(dir, '.claude', 'personas'), { recursive: true });
    expect(decide(dir, 'Write', { file_path: '.claude/personas/a.persona.md' }).behavior).toBe('allow');
  });
});
