import { constants } from "node:fs";
import { open } from "node:fs/promises";

// The text of a regular file, or null when it is missing or anything else: a symlink swapped in
// after a check-only lstat would otherwise still get followed, so this opens with O_NOFOLLOW and
// checks the open handle instead.
export async function readRegular(path: string): Promise<string | null> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    return null;
  }
  try {
    if (!(await handle.stat()).isFile()) return null;
    return await handle.readFile("utf8");
  } catch {
    return null;
  } finally {
    await handle.close();
  }
}

type Parse<T> = (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; code: string }[] } };

// Like readRegular, parsed and validated. Absent is silent; present but invalid is logged, so a
// broken file doesn't pass for one that was never written. The logged reason never carries file
// content: a JSON parse error logs only its name, and a validation failure logs issue paths and
// codes, not the received values.
export async function readRegularJson<T>(path: string, parse: Parse<T>, log: (message: string) => void): Promise<T | null> {
  const text = await readRegular(path);
  if (text === null) return null;
  let reason: string;
  try {
    const r = parse(JSON.parse(text));
    if (r.success) return r.data;
    reason = r.error.issues.map((i) => `${i.path.join(".")}:${i.code}`).join(", ");
  } catch (e) {
    reason = e instanceof Error ? e.name : String(e);
  }
  log(`aska-editor: ${path} is malformed: ${reason.slice(0, 1000)}`);
  return null;
}
