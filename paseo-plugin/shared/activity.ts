import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const activityKindSchema = z.enum(["read", "search", "other"]);
export type ActivityKind = z.infer<typeof activityKindSchema>;

export const activityEntrySchema = z.object({
  seq: z.number(),
  callId: z.string(),
  kind: activityKindSchema,
  target: z.string().nullable(),
  at: z.string(),
});
export type ActivityEntry = z.infer<typeof activityEntrySchema>;

export const subagentActivitySchema = z.object({
  id: z.string(),
  status: z.enum(["running", "completed", "failed", "canceled"]),
  description: z.string().nullable(),
  createdAt: z.string(),
  endedAt: z.string().nullable().optional(), // when the collector first saw it finish
  activity: z.array(activityEntrySchema),
});
export type SubagentActivity = z.infer<typeof subagentActivitySchema>;

export const runActivitySchema = z.object({
  epoch: z.string(),
  cursor: z.number(),
  complete: z.boolean(),
  watchingSince: z.string().nullable(),
  subagents: z.array(subagentActivitySchema),
});
export type RunActivity = z.infer<typeof runActivitySchema>;

// The panelists' live tool activity, collected by the server from Paseo's provider-sub-agent stream.
export const runActivityRpc = defineRpc({
  name: "run.activity",
  input: z.object({ agentId: z.string().min(1), since: z.number().int().nonnegative().optional() }),
  output: runActivitySchema,
});
