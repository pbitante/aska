import { randomBytes } from "node:crypto";
import { chmod, lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { errorText, isObj } from "../../shared/guards";
import { RUN_ID, runMetaSchema, type RunMeta } from "../../shared/runs";

export interface StoredRun {
  meta: RunMeta;
  dir: string;
}

// A partial copy older than this belongs to an archive that died; a live one takes seconds.
const STALE_MS = 10 * 60 * 1000;
// <id>.partial-<hex> is an archive in progress; <id>.old-<hex> is the entry it is replacing.
// (<id>.unreadable-<hex>, an entry whose meta.json couldn't be read, is kept and never swept.)
const SIDE = /^(\d{8}T\d{6}Z-[A-Za-z0-9]{6})\.(partial|old)-[0-9a-f]+$/;

// The plugin's archive: one folder per run, named by its id, holding a copy of the run plus
// meta.json and comparison.json. findByTmpDir answers from a tmpDir → id index built on first use
// and kept current by remember() and delete().
export class RunStore {
  private index: Promise<Map<string, string>> | null = null;
  // Ids with a swap in flight: archiveFolderNow adds one just before it moves the current entry
  // aside, and removes it once both renames are done. Sweep leaves these alone so it never races
  // the daemon's own in-progress swap.
  private readonly midSwap = new Set<string>();
  // The line last logged for each entry that couldn't be read, so polling logs it once.
  private readonly unreadable = new Map<string, string>();
  // Deleted runs, by run folder, with the digest of the panel result that was deleted.
  private deleted: Promise<Record<string, string>> | null = null;

  constructor(
    readonly root: string,
    private readonly log: (message: string) => void = () => {},
  ) {}

  beginSwap(id: string): void {
    this.midSwap.add(id);
  }

  endSwap(id: string): void {
    this.midSwap.delete(id);
  }

  entryDir(id: string): string {
    if (!RUN_ID.test(id)) throw new Error(`bad run id ${id}`);
    return join(this.root, id);
  }

  async get(id: string): Promise<StoredRun | null> {
    return (await this.read(id)).run;
  }

  // What is at an entry's folder: a readable entry, nothing, one written by a newer version of the
  // plugin (left alone), or one whose meta.json can't be read.
  async entryState(id: string): Promise<"ok" | "missing" | "newer" | "broken"> {
    const { run, state } = await this.read(id);
    if (run) return "ok";
    if (state !== "absent") return state;
    return (await lstat(this.entryDir(id)).then(() => true, () => false)) ? "broken" : "missing";
  }

  // Moves an unreadable entry out of the way, so a fresh archive doesn't delete it: its timeline
  // and comparison may still be worth something to whoever looks.
  async quarantine(id: string): Promise<string> {
    const kept = `${this.entryDir(id)}.unreadable-${randomBytes(6).toString("hex")}`;
    await rename(this.entryDir(id), kept);
    return kept;
  }

  private async read(id: string): Promise<{ run: StoredRun | null; state: "absent" | "newer" | "broken" }> {
    if (!RUN_ID.test(id)) return { run: null, state: "absent" };
    const dir = join(this.root, id);
    const file = join(dir, "meta.json");
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch {
      return { run: null, state: "absent" };
    }
    let reason: string;
    try {
      const raw: unknown = JSON.parse(text);
      if (isObj(raw) && typeof raw.schemaVersion === "number" && raw.schemaVersion > 1) {
        this.report(id, `aska-editor: ${id} was archived by a newer aska-editor; left alone`);
        return { run: null, state: "newer" };
      }
      const parsed = runMetaSchema.safeParse(raw);
      if (parsed.success && parsed.data.id === id) {
        this.unreadable.delete(id);
        return { run: { meta: parsed.data, dir }, state: "absent" };
      }
      reason = parsed.success ? "its id doesn't match its folder" : parsed.error.issues.map((i) => `${i.path.join(".")}:${i.code}`).join(", ");
    } catch (e) {
      reason = e instanceof Error ? e.name : errorText(e);
    }
    this.report(id, `aska-editor: ${file} is unreadable: ${reason.slice(0, 1000)}`);
    return { run: null, state: "broken" };
  }

  private report(id: string, message: string): void {
    if (this.unreadable.get(id) === message) return;
    this.unreadable.set(id, message);
    this.log(message);
  }

  private deletions(): Promise<Record<string, string>> {
    this.deleted ??= readFile(join(this.root, "deleted.json"), "utf8").then(
      (text) => {
        const raw: unknown = JSON.parse(text);
        return isObj(raw) ? (Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "string")) as Record<string, string>) : {};
      },
      () => ({}),
    ).catch(() => ({}));
    return this.deleted;
  }

  // Whether the run in this folder, with this panel result, was deleted. Imports and turn ends skip
  // it, so a deletion sticks; a panel that runs again in the folder (a new digest) is archived anew.
  async isDeleted(tmpDir: string, digest: string): Promise<boolean> {
    return (await this.deletions())[tmpDir] === digest;
  }

  async list(): Promise<RunMeta[]> {
    await this.sweep();
    let names: string[];
    try {
      names = await readdir(this.root);
    } catch {
      return [];
    }
    const runs = await Promise.all(names.filter((n) => RUN_ID.test(n)).map((n) => this.get(n)));
    return runs
      .filter((r): r is StoredRun => r !== null)
      .map((r) => r.meta)
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
  }

  // list() is newest-first; the first entry seen for a tmpDir is the one that should win.
  private tmpDirIndex(): Promise<Map<string, string>> {
    this.index ??= this.list().then((runs) => {
      const index = new Map<string, string>();
      for (const m of runs) if (m.tmpDir !== null && !index.has(m.tmpDir)) index.set(m.tmpDir, m.id);
      return index;
    });
    return this.index;
  }

  async findByTmpDir(dir: string): Promise<StoredRun | null> {
    const index = await this.tmpDirIndex();
    const id = index.get(dir);
    if (id === undefined) return null;
    const run = await this.get(id);
    if (run?.meta.tmpDir === dir) return run;
    if (index.get(dir) === id) index.delete(dir);
    return null;
  }

  // Records a freshly written entry. Before the index is built there is nothing to update: the
  // first findByTmpDir reads the entry from disk.
  remember(meta: RunMeta): void {
    if (meta.tmpDir === null || this.index === null) return;
    const tmpDir = meta.tmpDir;
    void this.index.then((index) => {
      for (const [dir, id] of index) if (id === meta.id && dir !== tmpDir) index.delete(dir);
      index.set(tmpDir, meta.id);
    });
  }

  // Undoes an archive that died between moving the entry aside and moving its replacement in.
  // Only when exactly one <id>.old-* exists: with two, which one is newer isn't knowable.
  async recover(id: string): Promise<boolean> {
    const final = this.entryDir(id);
    let names: string[];
    try {
      names = await readdir(this.root);
    } catch {
      return false;
    }
    if (names.includes(id)) return false;
    const olds = names.filter((n) => n.startsWith(`${id}.old-`) && SIDE.test(n));
    if (olds.length !== 1) return false;
    await rename(join(this.root, olds[0]!), final);
    const run = await this.get(id);
    if (run) this.remember(run.meta);
    return true;
  }

  // Removes partial copies left by an archive that died, restores an old entry a crashed archive
  // never swapped back in, and removes old entries a finished archive didn't get to delete.
  // Never throws.
  async sweep(): Promise<void> {
    try {
      await chmod(this.root, 0o700);
    } catch {
      // Missing, or not ours to chmod; the next sweep tries again.
    }
    let names: string[];
    try {
      names = await readdir(this.root);
    } catch {
      return;
    }
    const now = Date.now();
    await Promise.all(
      names.map(async (name) => {
        const m = SIDE.exec(name);
        if (!m) return;
        const id = m[1]!;
        const path = join(this.root, name);
        try {
          if (m[2] === "partial") {
            if (now - (await stat(path)).mtimeMs > STALE_MS) await rm(path, { recursive: true, force: true });
          } else if (names.includes(id)) {
            await rm(path, { recursive: true, force: true });
          } else if (!this.midSwap.has(id)) {
            await this.recover(id);
          }
        } catch {
          // Gone already, or not ours to read; the next sweep tries again.
        }
      }),
    );
  }

  async delete(id: string): Promise<boolean> {
    const run = await this.get(id);
    if (!run) return false;
    if (run.meta.tmpDir !== null) {
      const deleted = await this.deletions();
      deleted[run.meta.tmpDir] = run.meta.digest;
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      const tmp = join(this.root, `deleted.json.partial-${randomBytes(6).toString("hex")}`);
      await writeFile(tmp, JSON.stringify(deleted, null, 2), { mode: 0o600 });
      await rename(tmp, join(this.root, "deleted.json"));
    }
    await rm(run.dir, { recursive: true, force: true });
    if (this.index) {
      const index = await this.index;
      for (const [dir, known] of index) if (known === id) index.delete(dir);
    }
    return true;
  }
}
