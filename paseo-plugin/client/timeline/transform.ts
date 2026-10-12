import type { PluginTimelineData, PluginTimelineTransformResult } from "@getpaseo/plugin";
import { z } from "zod";
import { recognize, type PanelistState } from "../../shared/recognize";

// Plain interfaces rather than inferring from the schemas: the mobile audit flags lowercase
// generic arguments, which an inferred type would need here.
export interface PanelistData {
  callId: string;
  state: PanelistState;
  persona: string;
  reask: boolean;
  error: string | null;
}
export interface ReportData {
  callId: string;
  dir: string;
}

export const PANELIST_KIND = "aska-panelist";
export const REPORT_KIND = "aska-report";

export const panelistDataSchema = z.object({
  callId: z.string(),
  state: z.enum(["running", "done", "failed", "canceled"]),
  persona: z.string(),
  reask: z.boolean(),
  error: z.string().nullable(),
});

export const reportDataSchema = z.object({ callId: z.string(), dir: z.string() });

// Panelists become chips and compare calls become report cards; the run-folder row and everything
// else stay as Paseo draws them.
export function transformToolCall(item: unknown): PluginTimelineTransformResult | undefined {
  const row = recognize(item);
  if (row?.kind === "panelist") {
    const data: PanelistData = { callId: row.callId, state: row.state, persona: row.persona, reask: row.reask, error: row.error };
    return { items: [{ type: "plugin", kind: PANELIST_KIND, version: 1, data: data as unknown as PluginTimelineData }] };
  }
  if (row?.kind === "report") {
    const data: ReportData = { callId: row.callId, dir: row.dir };
    return { items: [{ type: "plugin", kind: REPORT_KIND, version: 1, data: data as unknown as PluginTimelineData }] };
  }
  return undefined;
}
