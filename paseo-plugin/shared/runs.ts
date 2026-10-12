import { defineRpc, type RpcOutput } from "@getpaseo/plugin";
import { z } from "zod";

// A temp run folder made by today's panel skill, and the name of a run in aska's persistent store
// (and of an archive entry).
export const RUN_DIR_NAME = /^aska-panel-[A-Za-z0-9]{6}$/;
export const RUN_ID = /^\d{8}T\d{6}Z-[A-Za-z0-9]{6}$/;

const persona = z.string();

const verdictRowSchema = z.looseObject({
  persona,
  status: z.enum(["ok", "malformed", "timeout", "error"]),
  verdict: z.string().nullable(),
  reason: z.string().nullable(),
});
export type VerdictRow = z.infer<typeof verdictRowSchema>;

export const unitCellSchema = z.looseObject({
  persona,
  tier: z.enum(["primary", "secondary", "deprioritized", "none"]),
  status: z.enum(["flagged", "cleared", "not-applicable", "not-raised"]),
  severity: z.string().nullable(),
  claim: z.string().nullable(),
  why: z.string().nullable(),
});
export type UnitCell = z.infer<typeof unitCellSchema>;

export const unitComparisonSchema = z.looseObject({
  unit: z.string(),
  class: z.enum(["all-flag", "split", "single-voice", "none"]),
  cells: z.array(unitCellSchema),
});
export type UnitComparison = z.infer<typeof unitComparisonSchema>;

const investigateEntrySchema = z.looseObject({ persona, what: z.string(), why: z.string(), tools: z.array(z.string()) });

const followUpSchema = z.union([
  z.looseObject({ type: z.literal("rerun"), persona, reason: z.string() }),
  investigateEntrySchema.extend({ type: z.literal("investigate") }),
]);
export type FollowUp = z.infer<typeof followUpSchema>;

const attributed = z.looseObject({ persona, text: z.string() });

// The output of `persona.mjs compare --json`.
export const comparisonSchema = z.looseObject({
  question: z.string(),
  panel: z.string().nullable(),
  verdicts: z.array(verdictRowSchema),
  units: z.array(unitComparisonSchema),
  outsideScope: z.array(z.looseObject({ persona, severity: z.string(), claim: z.string(), evidence: z.string() })),
  merged: z.looseObject({
    conditions: z.array(attributed),
    missing: z.array(attributed),
    investigate: z.array(investigateEntrySchema),
    sections: z.array(z.looseObject({ persona, name: z.string(), text: z.string() })),
  }),
  followUps: z.array(followUpSchema),
  ok: z.boolean(),
});
export type Comparison = z.infer<typeof comparisonSchema>;

// Lenient on purpose: it renders whatever a panelist said, valid or not.
export const judgmentSchema = z.looseObject({
  verdict: z.string().optional(),
  conditions: z.array(z.string()).optional(),
  missing: z.array(z.string()).optional(),
  findings: z
    .array(z.looseObject({ unit: z.string(), severity: z.string(), claim: z.string(), evidence: z.string().optional(), suggestion: z.string().optional() }))
    .optional(),
  cleared: z.array(z.string()).optional(),
  not_applicable: z.array(z.looseObject({ unit: z.string(), reason: z.string() })).optional(),
  sections: z.record(z.string(), z.string()).optional(),
});
export type Judgment = z.infer<typeof judgmentSchema>;

export const panelResultSchema = z.looseObject({
  question: z.string(),
  panel: z.string().nullable(),
  panelists: z.array(
    z.looseObject({
      persona: z.string(),
      status: z.string(),
      judgment: z.unknown().optional(),
      violations: z.array(z.string()).optional(),
      reason: z.string().optional(),
    }),
  ),
});
export type PanelResult = z.infer<typeof panelResultSchema>;

// timeline.json in an archive entry: when each panelist started, read, searched and finished,
// when each judgment was saved, and when the outcome landed. Paths and patterns only.
const timelineKindSchema = z.enum(["panelist-start", "read", "search", "judgment", "panelist-end", "outcome"]);
export type TimelineKind = z.infer<typeof timelineKindSchema>;

export const timelineEventSchema = z.object({
  at: z.iso.datetime(),
  kind: timelineKindSchema,
  panelist: z.string().nullable(), // short persona key; null for "outcome"
  callId: z.string().nullable(), // the panelist's sub-agent id; null for "judgment" and "outcome"
  status: z.enum(["completed", "failed", "canceled"]).optional(), // panelist-end only
  target: z.string().nullable().optional(), // read: file path; search: pattern
});
export type TimelineEvent = z.infer<typeof timelineEventSchema>;

export const timelineSchema = z.object({
  schemaVersion: z.literal(1),
  complete: z.boolean(), // the collector watched from before the first panelist started
  watchingSince: z.iso.datetime().nullable(),
  events: z.array(timelineEventSchema),
});
export type Timeline = z.infer<typeof timelineSchema>;

export const runMetaSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(RUN_ID),
  source: z.enum(["paseo", "import", "aska"]),
  tmpDir: z.string().nullable(),
  agentId: z.string().nullable(),
  workspaceId: z.string().nullable(),
  projectPath: z.string().nullable(),
  question: z.string(),
  panel: z.string().nullable(),
  panelists: z.array(z.object({ persona: z.string(), status: z.string(), verdict: z.string().nullable() })),
  startedAt: z.string(),
  comparedAt: z.string().nullable(),
  archivedAt: z.string(),
  digest: z.string(),
  reportCallId: z.string().nullable(),
  skipped: z.array(z.string()),
  // The digest of the archived activity (timeline.json without its judgment and outcome events).
  // Optional so metas written before it existed still parse.
  timelineDigest: z.string().nullable().optional(),
});
export type RunMeta = z.infer<typeof runMetaSchema>;

export const runReportSchema = z.object({
  source: z.enum(["live", "archive"]),
  dir: z.string(),
  brief: z.string().nullable(),
  result: panelResultSchema.nullable(),
  comparison: comparisonSchema.nullable(),
  compareError: z.string().nullable(),
  judgments: z.array(z.object({ persona: z.string(), judgment: z.unknown() })),
  meta: runMetaSchema.nullable(),
  timeline: timelineSchema.nullable(),
});
export type RunReport = z.infer<typeof runReportSchema>;

// A change detector, not a security hash: two 32-bit FNV-1a passes (16 hex chars). It avoids
// BigInt so the app bundle can use it too.
function fnv1a(text: string, offset: number): string {
  let h = offset >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
export function digest(text: string): string {
  return fnv1a(text, 0x811c9dc5) + fnv1a(text, 0x050c5d1f);
}

export function runIdFor(startedAt: Date, folderName: string): string {
  const stamp = startedAt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${stamp}-${folderName.slice(-6)}`;
}

const workspaceId = z.string().min(1).optional();

export const runReportRpc = defineRpc({
  name: "run.report",
  input: z
    .object({ workspaceId, dir: z.string().min(1).optional(), id: z.string().regex(RUN_ID).optional() })
    .refine((v) => (v.dir === undefined) !== (v.id === undefined), { message: "give exactly one of dir or id" }),
  output: runReportSchema,
});

export const runStatusRpc = defineRpc({
  name: "run.status",
  input: z.object({ dir: z.string().min(1) }),
  output: z.object({ archivedId: z.string().nullable(), reportCallId: z.string().nullable() }),
});

export const runsListRpc = defineRpc({
  name: "runs.list",
  input: z.object({ workspaceId }),
  output: z.object({ runs: z.array(runMetaSchema) }),
});

export const runsDeleteRpc = defineRpc({
  name: "runs.delete",
  input: z.object({ id: z.string().regex(RUN_ID) }),
  output: z.object({ deleted: z.boolean() }),
});

export const runsImportRpc = defineRpc({
  name: "runs.import",
  input: z.object({}),
  output: z.object({ imported: z.number(), skipped: z.number(), alreadyArchived: z.number() }),
});
export type ImportCounts = RpcOutput<typeof runsImportRpc>;
