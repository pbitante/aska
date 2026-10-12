import { z } from "zod";

const KINDS = ["unit", "persona", "panel"] as const;
export const kindSchema = z.enum(KINDS);
export type Kind = z.infer<typeof kindSchema>;

export const writeScopeSchema = z.enum(["project", "user"]);
export type WriteScope = z.infer<typeof writeScopeSchema>;
export const readScopeSchema = z.enum(["project", "user", "plugin"]);
export type ReadScope = z.infer<typeof readScopeSchema>;

export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const severitySchema = z.enum(SEVERITIES);
export type Severity = z.infer<typeof severitySchema>;

export const TIERS = ["primary", "secondary", "deprioritized"] as const;
export type Tier = (typeof TIERS)[number];

// aska's own rules (src/parse/fields.ts): a name is kebab-case; a ref may carry a plugin namespace.
export const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REF_PATTERN = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*:)?[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const nameSchema = z.string().regex(NAME_PATTERN);
export const refSchema = z.string().regex(REF_PATTERN);
export const expectHashSchema = z.union([z.literal("none"), z.string().regex(/^[0-9a-f]{64}$/)]);

export const diagnosticSchema = z.looseObject({
  level: z.enum(["error", "warning"]),
  code: z.string(),
  message: z.string(),
  file: z.string().nullable().optional(),
  line: z.number().nullable().optional(),
  fix: z.string().nullable().optional(),
});
export type Diagnostic = z.infer<typeof diagnosticSchema>;

export const unitBriefSchema = z.looseObject({ canonical: z.string(), description: z.string(), threshold: z.string() });
export type UnitBrief = z.infer<typeof unitBriefSchema>;
export const unitsByTierSchema = z.looseObject({
  primary: z.array(unitBriefSchema),
  secondary: z.array(unitBriefSchema),
  deprioritized: z.array(unitBriefSchema),
});
export type UnitsByTier = z.infer<typeof unitsByTierSchema>;

const rowBase = {
  canonical: z.string(),
  name: z.string(),
  scope: readScopeSchema,
  plugin: z.string().nullable(),
  path: z.string(),
  description: z.string().nullable(),
  shadowedBy: z.string().nullable(),
  valid: z.boolean(),
  errorCount: z.number(),
  warningCount: z.number().optional(),
};
export const listingSchema = z.looseObject({
  units: z.array(z.looseObject({ ...rowBase, threshold: z.string().nullable(), appliesWhen: z.string().nullable() })),
  personas: z.array(z.looseObject({ ...rowBase, extends: z.string().nullable(), units: unitsByTierSchema.nullable() })),
  panels: z.array(z.looseObject({ ...rowBase, personas: z.array(z.string()) })),
  warnings: z.array(z.looseObject({ level: z.string(), code: z.string(), message: z.string() })).default([]),
});
export type Listing = z.infer<typeof listingSchema>;

// `show` of an unknown name prints only { diagnostics } and exits 1, so everything else is optional.
export const showSchema = z.looseObject({
  kind: kindSchema.optional(),
  name: z.string().optional(),
  canonical: z.string().optional(),
  scope: readScopeSchema.optional(),
  plugin: z.string().nullable().optional(),
  path: z.string().optional(),
  hash: z.string().optional(),
  raw: z.string().optional(),
  fields: z.record(z.string(), z.unknown()).optional(),
  sections: z.record(z.string(), z.string()).optional(),
  diagnostics: z.array(diagnosticSchema),
});
export type ShowResult = z.infer<typeof showSchema>;

export const writeSchema = z.looseObject({
  written: z.boolean(),
  path: z.string().nullable(),
  hash: z.string().nullable(),
  diagnostics: z.array(diagnosticSchema),
});
export type WriteResult = z.infer<typeof writeSchema>;

export const deleteSchema = z.looseObject({
  deleted: z.boolean(),
  path: z.string().nullable(),
  dependents: z.array(z.looseObject({ kind: kindSchema.nullable(), name: z.string().nullable(), path: z.string().nullable(), message: z.string() })),
  diagnostics: z.array(diagnosticSchema).default([]),
});
export type DeleteResult = z.infer<typeof deleteSchema>;

export const statusSchema = z.object({
  ok: z.boolean(),
  version: z.string().optional(),
  cliPath: z.string().optional(),
  reason: z.string().optional(),
});
export type AskaStatus = z.infer<typeof statusSchema>;

export const patchSchema = z.object({
  set: z.record(z.string(), z.unknown()).optional(),
  unset: z.array(z.string()).optional(),
  sections: z.record(z.string(), z.string()).optional(),
});
export type Patch = z.infer<typeof patchSchema>;
