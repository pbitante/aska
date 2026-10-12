import { chmodSync, lstatSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeAtomic } from '../src/fs';
import { mkdtemp } from './helpers/tree';

describe('writeAtomic', () => {
  it('keeps the permissions of the file it replaces', () => {
    const dir = mkdtemp('fs-mode-');
    const path = join(dir, 'f.md');
    writeFileSync(path, 'old');
    chmodSync(path, 0o600);
    writeAtomic(path, 'new');
    expect(readFileSync(path, 'utf8')).toBe('new');
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it('keeps the permissions of a symlinked file it writes through', () => {
    const dir = mkdtemp('fs-mode-link-');
    const real = join(dir, 'real.md');
    writeFileSync(real, 'old');
    chmodSync(real, 0o640);
    symlinkSync(real, join(dir, 'link.md'));
    writeAtomic(join(dir, 'link.md'), 'new');
    expect(lstatSync(join(dir, 'link.md')).isSymbolicLink()).toBe(true);
    expect(readFileSync(real, 'utf8')).toBe('new');
    expect(statSync(real).mode & 0o777).toBe(0o640);
  });

  it('replaces a dangling symlink with a regular file instead of creating its target', () => {
    const dir = mkdtemp('fs-dangling-');
    const link = join(dir, 'link.md');
    symlinkSync(join(dir, 'missing/target.md'), link);
    writeAtomic(link, 'new');
    expect(lstatSync(link).isSymbolicLink()).toBe(false);
    expect(readFileSync(link, 'utf8')).toBe('new');
    expect(() => statSync(join(dir, 'missing'))).toThrow();
  });
});
