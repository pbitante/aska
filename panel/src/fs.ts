import { chmodSync, existsSync, lstatSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Writes through a symlinked target to the file it points to, so the link survives, and keeps
// the replaced file's permissions (its owner can't be kept without privileges). A dangling link
// is replaced by a regular file. The folder must already exist. Cleans up the tmp file if the
// write or rename fails.
export function writeAtomic(path: string, content: string): void {
  const target = existsSync(path) && lstatSync(path).isSymbolicLink() ? realpathSync(path) : path;
  const mode = existsSync(target) ? statSync(target).mode & 0o7777 : undefined;
  const tmp = `${target}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, content);
    if (mode !== undefined) chmodSync(tmp, mode);
    renameSync(tmp, target);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}

// The real path, or the resolved path when it doesn't exist (yet).
export function safeRealpath(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

export function readIfExists(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

export function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}
