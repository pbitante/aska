import { RUN_DIR_NAME, RUN_ID } from "./runs";
import { isObj } from "./guards";

// Recognises an aska panel run in a Paseo agent timeline. Items are typed `unknown` and checked
// field by field, so this stays shared-safe and degrades to "not recognised" when a shape changes.

export type PanelistState = "running" | "done" | "failed" | "canceled";
export interface PanelistRow {
  kind: "panelist";
  callId: string;
  state: PanelistState;
  persona: string;
  reask: boolean;
  error: string | null;
}
export interface RunFolderRow {
  kind: "runFolder";
  callId: string;
  dir: string;
}
export interface ReportRow {
  kind: "report";
  callId: string;
  dir: string;
}
export interface JudgmentSavedRow {
  kind: "judgmentSaved";
  callId: string;
  dir: string;
  name: string;
}
export type Recognized = PanelistRow | RunFolderRow | ReportRow | JudgmentSavedRow;

const STATES: Record<string, PanelistState> = { running: "running", completed: "done", failed: "failed", canceled: "canceled" };

// An absolute path whose last segment is a temp run folder or a persistent run id. Temp
// folders aren't necessarily under /tmp — macOS uses /var/folders/…/T/, and TMPDIR can be
// anything — so this only checks the shape; the daemon's allow-list is the security boundary.
function isRunDir(path: string): boolean {
  if (!path.startsWith("/")) return false;
  const name = path.split("/").filter((s) => s !== "").pop() ?? "";
  return RUN_DIR_NAME.test(name) || RUN_ID.test(name);
}

function errorText(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  if (typeof error === "string") return error.slice(0, 200);
  if (isObj(error) && typeof error.message === "string") return error.message.slice(0, 200);
  return "failed";
}

// "panelist aska:guardian [re-ask]" (aska's convention), else today's "guardian panelist judgment".
export function personaFromDescription(description: string): string {
  const d = description.trim();
  const own = /^panelist\s+(\S+)/i.exec(d);
  if (own) return own[1]!;
  const legacy = /^(\S+)\s+panelist\b/i.exec(d);
  if (legacy) return legacy[1]!;
  return d === "" ? "panelist" : d;
}

// The run folder of a `persona.mjs … compare --file <dir>/panel-result.json … --json` command.
export function reportDir(command: string): string | null {
  if (!/\bcompare\b/.test(command) || !/--json\b/.test(command) || !/persona/.test(command)) return null;
  const m = /--file(?:=|\s+)(["']?)(\S+?)\/panel-result\.json\1(?=\s|$)/.exec(command);
  if (!m) return null;
  const dir = m[2]!;
  return isRunDir(dir) ? dir : null;
}

// A persona's key without its plugin prefix: `aska:tester` → `tester`.
export const shortKey = (persona: string): string => persona.slice(persona.indexOf(":") + 1);

// `<run dir>/judgments/<name>.json` anywhere in a path or command: the chair saving (or checking)
// a panelist's judgment. The skill names the file by the row's canonical (`aska:tester.json`);
// older chairs used the short name. Either way the name is the short key.
const JUDGMENT_PATH = /(\/[^\s'"`]*?)\/judgments\/([A-Za-z0-9._:-]+)\.json(?=$|[\s'"`;|&)>])/;
function judgmentPath(text: string): { dir: string; name: string } | null {
  const m = JUDGMENT_PATH.exec(text);
  if (!m) return null;
  const dir = m[1]!;
  return isRunDir(dir) ? { dir, name: shortKey(m[2]!) } : null;
}

function folderInOutput(output: string): string | null {
  for (const token of output.split(/\s+/)) {
    const path = token.replace(/\/+$/, "");
    if (isRunDir(path)) return path;
  }
  return null;
}

// A simple `NAME=value` at the start of a statement (command start, or after `;`, `&&`, `||` or a
// newline). No general shell parsing: command substitution, backticks and unquoted spaces disqualify
// a value, so chairs that use those keep whatever literal text they wrote.
const ASSIGNMENT = /^[ \t]*([A-Za-z_][A-Za-z0-9_]*)=(?:'([^']*)'|"([^"]*)"|(\S*))[ \t]*$/;
const VAR_REF = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;

function expandRefs(text: string, vars: ReadonlyMap<string, string>): string {
  return text.replace(VAR_REF, (whole, braced: string | undefined, bare: string | undefined) => {
    const name = braced ?? bare!;
    return vars.has(name) ? vars.get(name)! : whole;
  });
}

export function expandShellVars(command: string): string {
  const vars = new Map<string, string>();
  const parts = command.split(/(;|&&|\|\||\n)/);
  const out = parts.map((part) => {
    if (part === ";" || part === "&&" || part === "||" || part === "\n") return part;
    const assignment = ASSIGNMENT.exec(part);
    const expanded = expandRefs(part, vars);
    if (assignment) {
      const raw = assignment[2] ?? assignment[3] ?? assignment[4] ?? "";
      if (!/\$\(|`/.test(raw)) vars.set(assignment[1]!, expandRefs(raw, vars));
    }
    return expanded;
  });
  return out.join("");
}

export function recognize(item: unknown): Recognized | undefined {
  if (!isObj(item) || item.type !== "tool_call" || typeof item.callId !== "string" || !isObj(item.detail)) return undefined;
  const detail = item.detail;
  const status = String(item.status);

  if (detail.type === "sub_agent") {
    if (detail.subAgentType !== "aska:panelist") return undefined;
    const state = STATES[status];
    if (!state) return undefined;
    const description = typeof detail.description === "string" ? detail.description : "";
    return {
      kind: "panelist",
      callId: item.callId,
      state,
      persona: personaFromDescription(description),
      reask: /re-?ask/i.test(description),
      error: state === "failed" ? (errorText(item.error) ?? "failed") : null,
    };
  }

  if (detail.type === "write" && typeof detail.filePath === "string") {
    if (status !== "completed") return undefined;
    const saved = judgmentPath(detail.filePath);
    return saved ? { kind: "judgmentSaved", callId: item.callId, ...saved } : undefined;
  }

  if (detail.type !== "shell" || typeof detail.command !== "string") return undefined;
  const command = expandShellVars(detail.command);
  const dir = reportDir(command);
  if (dir && (status === "completed" || status === "failed")) return { kind: "report", callId: item.callId, dir };
  if (status === "completed") {
    const saved = judgmentPath(command);
    if (saved) return { kind: "judgmentSaved", callId: item.callId, ...saved };
  }
  const makesFolder = (/\bmktemp\b/.test(command) && command.includes("aska-panel-")) || /\bruns\s+new\b/.test(command);
  if (makesFolder && status === "completed" && typeof detail.output === "string") {
    const folder = folderInOutput(detail.output);
    if (folder) return { kind: "runFolder", callId: item.callId, dir: folder };
  }
  return undefined;
}

export interface LiveRun {
  dir: string | null;
  panelists: PanelistRow[];
  reportCallId: string | null;
  judgmentsSaved: string[];
}

function collectPanelists(rows: readonly (Recognized | undefined)[]): PanelistRow[] {
  const panelists = new Map<string, PanelistRow>();
  for (const row of rows) {
    if (row?.kind === "panelist") panelists.set(row.callId, row);
  }
  return [...panelists.values()];
}

function collectJudgments(rows: readonly (Recognized | undefined)[], dir: string | null): string[] {
  const names: string[] = [];
  for (const row of rows) {
    if (row?.kind === "judgmentSaved" && (dir === null || row.dir === dir) && !names.includes(row.name)) names.push(row.name);
  }
  return names;
}

// The latest run in a timeline: everything after the last recognised run folder.
export function assembleRun(items: readonly unknown[]): LiveRun | null {
  const rows = items.map(recognize);

  let folderStart = -1;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i]?.kind === "runFolder") {
      folderStart = i;
      break;
    }
  }

  if (folderStart !== -1) {
    const dir = (rows[folderStart] as RunFolderRow).dir;
    let reportCallId: string | null = null;
    for (const row of rows.slice(folderStart)) {
      if (row?.kind === "report" && row.dir === dir) reportCallId = row.callId;
    }
    return { dir, panelists: collectPanelists(rows.slice(folderStart)), reportCallId, judgmentsSaved: collectJudgments(rows.slice(folderStart), dir) };
  }

  // No run folder recognised: fall back to the reports. Without any report, there's no way to
  // tell which panelists belong to the latest run, so keep today's behaviour of showing them all.
  const reportIndices: number[] = [];
  for (let i = 0; i < rows.length; i++) if (rows[i]?.kind === "report") reportIndices.push(i);
  if (reportIndices.length === 0) {
    const panelists = collectPanelists(rows);
    return panelists.length === 0 ? null : { dir: null, panelists, reportCallId: null, judgmentsSaved: collectJudgments(rows, null) };
  }

  // The latest report pins the run's folder; the window starts right after the last earlier
  // report for a *different* folder, so panelists from an older run don't bleed in.
  const lastReportIdx = reportIndices[reportIndices.length - 1]!;
  const dir = (rows[lastReportIdx] as ReportRow).dir;
  let windowStart = 0;
  for (let j = reportIndices.length - 2; j >= 0; j--) {
    const idx = reportIndices[j]!;
    if ((rows[idx] as ReportRow).dir !== dir) {
      windowStart = idx + 1;
      break;
    }
  }
  return {
    dir,
    panelists: collectPanelists(rows.slice(windowStart)),
    reportCallId: (rows[lastReportIdx] as ReportRow).callId,
    judgmentsSaved: collectJudgments(rows.slice(windowStart), dir),
  };
}
