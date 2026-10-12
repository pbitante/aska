import { randomBytes } from "node:crypto";
import { chmod, copyFile, lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import type { RunActivity } from "../../shared/activity";
import { assembleRun, recognize } from "../../shared/recognize";
import { RUN_DIR_NAME, RUN_ID, comparisonSchema, digest, panelResultSchema, runIdFor, timelineSchema, type Comparison, type ImportCounts, type RunMeta, type Timeline } from "../../shared/runs";
import { readRegular, readRegularJson } from "./files";
import { lexicalRunDir, realRunDir, type RunPaths } from "./paths";
import type { RunStore } from "./store";
import { activityDigest, activityOf, activityPart, buildTimeline, withEarlier, type ArchiveActivity, type JudgmentTime } from "./timeline";
import { errorText } from "../../shared/guards";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

// Run folders hold briefs and judgments that may quote code or secrets: owner-only throughout.
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

// Reserved for the files the archiver itself writes; a stray copy from the source folder would
// otherwise masquerade as this run's own comparison or meta.
const RESERVED: readonly string[] = ["comparison.json", "meta.json", "timeline.json"];

export interface ArchiveDeps {
  store: RunStore;
  // Runs `compare --file <resultFile> --json` with --cwd <cwd> (or a no-project folder) and returns its JSON.
  compare: (resultFile: string, cwd: string | null) => Promise<unknown>;
  now: () => Date;
  log: (message: string) => void;
}

export interface ArchiveSource {
  dir: string; // the folder as the timeline names it; recorded as meta.tmpDir
  realDir: string; // the allow-listed real path to read from
  source: "paseo" | "import";
  agentId: string | null;
  workspaceId: string | null;
  projectPath: string | null;
  reportCallId: string | null;
  // The run's sub-agent activity from the collector. Null or absent for imports, and when no
  // sub-agent matched a panelist; a previous entry's timeline is then carried forward.
  activity?: ArchiveActivity | null;
}

export interface ArchiveOutcome {
  id: string;
  changed: boolean;
}

// Copies a run folder, skipping symlinks and files over MAX_FILE_BYTES. Returns what it skipped.
async function copyRunFolder(src: string, dst: string, rel = ""): Promise<string[]> {
  const skipped: string[] = [];
  await mkdir(join(dst, rel), { recursive: true, mode: DIR_MODE });
  for (const entry of await readdir(join(src, rel), { withFileTypes: true })) {
    if (rel === "" && RESERVED.includes(entry.name)) continue;
    const path = rel === "" ? entry.name : `${rel}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      skipped.push(`${path} (symlink)`);
      continue;
    }
    if (entry.isDirectory()) {
      skipped.push(...(await copyRunFolder(src, dst, path)));
      continue;
    }
    if (!entry.isFile()) continue;
    const size = (await lstat(join(src, path))).size;
    if (size > MAX_FILE_BYTES) {
      skipped.push(`${path} (${Math.round(size / (1024 * 1024))} MB)`);
      continue;
    }
    await copyFile(join(src, path), join(dst, path));
    await chmod(join(dst, path), FILE_MODE);
  }
  return skipped;
}

async function startedAtOf(dir: string): Promise<string> {
  const s = await stat(dir);
  return (s.birthtimeMs > 0 ? s.birthtime : s.mtime).toISOString();
}

// When each archived judgment landed: the source file's mtime, since copyFile gives the copy in
// `partial` the archive time. Lists `partial` so only what was actually archived counts.
async function judgmentTimes(partial: string, realDir: string): Promise<JudgmentTime[]> {
  let names: string[];
  try {
    names = (await readdir(join(partial, "judgments"))).filter((n) => n.endsWith(".json")).sort();
  } catch {
    return [];
  }
  const out: JudgmentTime[] = [];
  for (const name of names) {
    try {
      const s = await lstat(join(realDir, "judgments", name));
      if (s.isFile()) out.push({ panelist: basename(name, ".json"), at: s.mtime.toISOString() });
    } catch {
      // Gone from the source since the copy; leave it out.
    }
  }
  return out;
}

// One archive per run folder at a time: two turn-end events for the same folder would otherwise
// race on the same entry's renames.
const queues = new Map<string, Promise<unknown>>();

export function archiveFolder(src: ArchiveSource, deps: ArchiveDeps): Promise<ArchiveOutcome | null> {
  const key = `${deps.store.root}\0${src.dir}`;
  const run = (queues.get(key) ?? Promise.resolve()).then(() => archiveFolderNow(src, deps));
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  queues.set(key, settled);
  void settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key);
  });
  return run;
}

async function archiveFolderNow(src: ArchiveSource, deps: ArchiveDeps): Promise<ArchiveOutcome | null> {
  await deps.store.sweep();
  const text = await readRegular(join(src.realDir, "panel-result.json"));
  if (text === null) return null;
  const parsedResult = (() => {
    try {
      return panelResultSchema.safeParse(JSON.parse(text));
    } catch {
      return null;
    }
  })();
  if (!parsedResult?.success) {
    deps.log(`aska-editor: ${src.dir}/panel-result.json is not a panel result; not archived`);
    return null;
  }
  const result = parsedResult.data;
  const hash = digest(text);
  if (await deps.store.isDeleted(src.dir, hash)) return null;
  // An archive that died between its two renames left this folder's entry as <id>.old-*: put it
  // back before deciding what changed.
  await deps.store.recover(runIdFor(new Date(await startedAtOf(src.realDir)), basename(src.dir)));
  const existing = await deps.store.findByTmpDir(src.dir);
  const reportCallId = src.reportCallId ?? existing?.meta.reportCallId ?? null;
  // The activity to keep: this turn's, plus earlier attempts only the previous timeline still has;
  // with none this turn, the previous timeline's, carried forward.
  const prevTimeline = existing ? await readRegularJson<Timeline>(join(existing.dir, "timeline.json"), (v) => timelineSchema.safeParse(v), deps.log) : null;
  const prevActivity = prevTimeline ? activityOf(prevTimeline) : null;
  const activity = src.activity ? withEarlier(prevActivity, src.activity) : prevActivity;
  const timelineDigest = activity ? activityDigest(activity) : null;
  // A null comparedAt means a previous attempt's compare failed: always worth a retry, even when
  // nothing else about the folder changed. Activity that grew since is worth a rewrite too.
  if (
    existing &&
    existing.meta.digest === hash &&
    existing.meta.reportCallId === reportCallId &&
    existing.meta.comparedAt !== null &&
    (existing.meta.timelineDigest ?? null) === timelineDigest
  ) {
    return { id: existing.meta.id, changed: false };
  }

  const startedAt = existing?.meta.startedAt ?? (await startedAtOf(src.realDir));
  const id = existing?.meta.id ?? runIdFor(new Date(startedAt), basename(src.dir));
  if (!existing) {
    // Something sits at this run's entry that the store couldn't read. Never overwrite a newer
    // version's entry; keep a broken one aside rather than delete it with the swap below.
    const state = await deps.store.entryState(id);
    if (state === "newer") {
      deps.log(`aska-editor: ${id} was archived by a newer aska-editor; left alone`);
      return null;
    }
    if (state === "broken") deps.log(`aska-editor: ${id}'s archive entry is unreadable; kept it as ${await deps.store.quarantine(id)} and archived the run afresh`);
  }
  const final = deps.store.entryDir(id);
  const partial = `${final}.partial-${randomBytes(6).toString("hex")}`;
  let old: string | null = null;
  try {
    const skipped = await copyRunFolder(src.realDir, partial);

    let comparison: Comparison | null = null;
    try {
      const parsed = comparisonSchema.safeParse(await deps.compare(join(partial, "panel-result.json"), src.projectPath));
      if (parsed.success) comparison = parsed.data;
      else deps.log(`aska-editor: compare output for ${id} didn't match the expected shape`);
    } catch (e) {
      deps.log(`aska-editor: compare failed for ${id}: ${errorText(e)}`);
    }

    let comparedAt: string | null = null;
    const now = deps.now().toISOString();
    if (comparison) {
      await writeFile(join(partial, "comparison.json"), JSON.stringify(comparison, null, 2), { mode: FILE_MODE });
      comparedAt = now;
    } else if (existing?.meta.comparedAt) {
      // This refresh's compare failed: keep the previous run's frozen comparison rather than
      // losing it, since the removal step below would otherwise take it down with the old entry.
      try {
        const prevText = await readFile(join(existing.dir, "comparison.json"), "utf8");
        const parsedPrev = comparisonSchema.safeParse(JSON.parse(prevText));
        if (parsedPrev.success) {
          await writeFile(join(partial, "comparison.json"), prevText, { mode: FILE_MODE });
          comparison = parsedPrev.data;
          comparedAt = existing.meta.comparedAt;
        }
      } catch {
        // No readable previous comparison to carry forward; proceed without one.
      }
    }

    if (activity) {
      const timeline = buildTimeline(activity, await judgmentTimes(partial, src.realDir), comparedAt);
      await writeFile(join(partial, "timeline.json"), JSON.stringify(timeline, null, 2), { mode: FILE_MODE });
    }

    const row = (persona: string) => comparison?.verdicts.find((v) => v.persona === persona);
    const meta: RunMeta = {
      schemaVersion: 1,
      id,
      source: existing?.meta.source === "paseo" ? "paseo" : src.source,
      tmpDir: src.dir,
      agentId: src.agentId ?? existing?.meta.agentId ?? null,
      workspaceId: src.workspaceId ?? existing?.meta.workspaceId ?? null,
      projectPath: src.projectPath ?? existing?.meta.projectPath ?? null,
      question: result.question,
      panel: result.panel,
      panelists: result.panelists.map((p) => ({ persona: p.persona, status: row(p.persona)?.status ?? p.status, verdict: row(p.persona)?.verdict ?? null })),
      startedAt,
      comparedAt,
      archivedAt: now,
      digest: hash,
      reportCallId,
      timelineDigest,
      skipped,
    };
    await writeFile(join(partial, "meta.json"), JSON.stringify(meta, null, 2), { mode: FILE_MODE });
    await mkdir(dirname(final), { recursive: true, mode: DIR_MODE });

    deps.store.beginSwap(id);
    try {
      try {
        old = `${final}.old-${randomBytes(6).toString("hex")}`;
        await rename(final, old);
      } catch {
        old = null; // final didn't exist yet
      }
      await rename(partial, final);
    } finally {
      deps.store.endSwap(id);
    }
    if (old) await rm(old, { recursive: true, force: true });
    deps.store.remember(meta);
    return { id, changed: true };
  } catch (e) {
    // If the first rename succeeded but the second didn't, put the previous entry back rather
    // than leaving it archived only as a dangling <id>.old-*.
    if (old) {
      const finalMissing = await stat(final).then(() => false, () => true);
      if (finalMissing) await rename(old, final).catch(() => {});
    }
    await rm(partial, { recursive: true, force: true });
    throw e;
  }
}

export type AutoImport = (opts?: { force?: boolean }) => Promise<ImportCounts>;

export const AUTO_IMPORT_MS = 30_000;
const NO_CHANGE: ImportCounts = { imported: 0, skipped: 0, alreadyArchived: 0 };

// Throttles `run` (importTmp) to at most once per AUTO_IMPORT_MS; callers that overlap an
// in-flight run share its result instead of starting their own.
export function createAutoImport(run: () => Promise<ImportCounts>, now: () => number = Date.now): AutoImport {
  let lastRun = -Infinity;
  let inFlight: Promise<ImportCounts> | null = null;
  return (opts) => {
    if (inFlight) return inFlight;
    if (!opts?.force && now() - lastRun < AUTO_IMPORT_MS) return Promise.resolve(NO_CHANGE);
    const started = run().finally(() => {
      lastRun = now();
      inFlight = null;
    });
    inFlight = started;
    return started;
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

export interface TurnEvent {
  agent: { id: string; workspaceId: string | null; cwd: string };
  timeline: readonly unknown[];
}

// Archives every run whose compare call appears in a finished turn (the last call per folder),
// with its panelists' activity when the collector has it. Never throws: failures are logged.
export async function archiveFromTimeline(
  event: TurnEvent,
  deps: ArchiveDeps & { paths: RunPaths; activityOf?: (agentId: string) => RunActivity },
): Promise<ArchiveOutcome[]> {
  const latest = new Map<string, { callId: string; index: number }>();
  for (const [index, item] of event.timeline.entries()) {
    const row = recognize(item);
    if (row?.kind === "report") latest.set(row.dir, { callId: row.callId, index });
  }
  const collected = latest.size > 0 && deps.activityOf ? deps.activityOf(event.agent.id) : null;
  const outcomes: ArchiveOutcome[] = [];
  for (const [dir, { callId, index }] of latest) {
    try {
      const lexical = lexicalRunDir(dir, deps.paths);
      const realDir = lexical ? await realRunDir(lexical, deps.paths) : null;
      if (!lexical || !realDir) {
        // Commands that merely mention a run-shaped path (tests, examples) name nothing on disk, so
        // they stay quiet. A real folder that was refused is logged: one outside the allow-list (say,
        // under a TMPDIR the daemon doesn't share), a symlink, or another user's.
        if (await exists(dir)) deps.log(`aska-editor: ${dir} is not an archivable run folder`);
        continue;
      }
      // This folder's run is the latest one in the timeline up to its own compare call.
      const run = collected ? assembleRun(event.timeline.slice(0, index + 1)) : null;
      // `run.dir === null` is defensive: the slice always ends at this folder's own report row.
      const activity = collected && run && (run.dir === null || run.dir === dir) ? activityPart(run, collected) : null;
      const outcome = await archiveFolder(
        { dir: lexical, realDir, source: "paseo", agentId: event.agent.id, workspaceId: event.agent.workspaceId, projectPath: event.agent.cwd, reportCallId: callId, activity },
        deps,
      );
      if (outcome) outcomes.push(outcome);
    } catch (e) {
      deps.log(`aska-editor: archiving ${dir} failed: ${errorText(e)}`);
    }
  }
  return outcomes;
}

// Scans both the chair's temp-folder runs and aska's own kept runs under paths.askaRunsRoot;
// a missing root (e.g. no askaRunsRoot yet) is just skipped.
export async function importTmp(paths: RunPaths, deps: ArchiveDeps): Promise<ImportCounts> {
  let imported = 0;
  let skipped = 0;
  let alreadyArchived = 0;
  for (const { root, pattern } of [
    { root: paths.tmpRoot, pattern: RUN_DIR_NAME },
    { root: paths.askaRunsRoot, pattern: RUN_ID },
  ]) {
    let names: string[];
    try {
      names = await readdir(root);
    } catch {
      continue;
    }
    for (const name of names.filter((n) => pattern.test(n))) {
      const dir = resolve(root, name);
      if (await deps.store.findByTmpDir(dir)) {
        alreadyArchived++;
        continue;
      }
      const realDir = await realRunDir(dir, paths);
      if (!realDir) {
        skipped++;
        continue;
      }
      // A run the user deleted isn't skipped or imported: it just stays gone.
      const text = await readRegular(join(realDir, "panel-result.json"));
      if (text !== null && (await deps.store.isDeleted(dir, digest(text)))) continue;
      const outcome = await archiveFolder({ dir, realDir, source: "import", agentId: null, workspaceId: null, projectPath: null, reportCallId: null, activity: null }, deps);
      if (outcome) imported++;
      else skipped++;
    }
  }
  return { imported, skipped, alreadyArchived };
}
