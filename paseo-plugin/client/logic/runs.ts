import type { ImportCounts, RunMeta } from "../../shared/runs";

export type LibraryTab = "persona" | "unit" | "panel" | "runs";
export const UNKNOWN_PROJECT = "unknown";

const lastSegment = (path: string): string => path.split("/").filter((s) => s !== "").pop() ?? path;

export function projectFilters(runs: readonly RunMeta[]): { value: string; label: string }[] {
  const projects = [...new Set(runs.map((r) => r.projectPath).filter((p): p is string => p !== null))].sort();
  return [
    { value: "all", label: "All" },
    ...projects.map((p) => ({ value: p, label: lastSegment(p) })),
    ...(runs.some((r) => r.projectPath === null) ? [{ value: UNKNOWN_PROJECT, label: "Unknown project" }] : []),
  ];
}

export function filterRuns(runs: readonly RunMeta[], filter: string): RunMeta[] {
  if (filter === "all") return [...runs];
  if (filter === UNKNOWN_PROJECT) return runs.filter((r) => r.projectPath === null);
  return runs.filter((r) => r.projectPath === filter);
}

export function importToastMessage(counts: ImportCounts): string {
  const parts = [`Imported ${counts.imported} run${counts.imported === 1 ? "" : "s"}`];
  if (counts.alreadyArchived > 0) parts.push(`${counts.alreadyArchived} already archived`);
  if (counts.skipped > 0) parts.push(`${counts.skipped} skipped`);
  return parts.join(" · ");
}
