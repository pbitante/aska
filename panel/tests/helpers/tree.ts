import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const roots: string[] = [];

export function mkdtemp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

export function cleanupTempDirs(): void {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
}

export function makeTree(files: Record<string, string>): string {
  const root = mkdtemp('personas-');
  for (const [rel, content] of Object.entries(files)) {
    const path = join(root, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return root;
}
