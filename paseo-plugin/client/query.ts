import type { OpenTarget } from "./logic/catalog";

export const keys = {
  status: ["aska-editor", "status"] as const,
  catalog: (workspaceId: string | undefined) => ["aska-editor", "catalog", workspaceId ?? null] as const,
  file: (workspaceId: string | undefined, t: OpenTarget) => ["aska-editor", "file", workspaceId ?? null, t.kind, t.scope, t.canonical] as const,
  runsPrefix: ["aska-editor", "runs"] as const,
  runReport: (dir: string, callId: string | null, judgments = 0) => ["aska-editor", "runs", "report", dir, callId, judgments] as const,
  runStatus: (dir: string) => ["aska-editor", "runs", "status", dir] as const,
  runArchived: (id: string) => ["aska-editor", "runs", "archived", id] as const,
  runsList: (workspaceId: string | undefined) => ["aska-editor", "runs", "list", workspaceId ?? null] as const,
};

export { errorText } from "../shared/guards";
