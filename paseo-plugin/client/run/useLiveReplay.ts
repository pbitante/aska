import { useRpc } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { runReportRpc, runStatusRpc, type RunReport } from "../../shared/runs";
import { liveReplayMode, replayPollDelay } from "../logic/replayMode";
import { keys } from "../query";

type StartedAt = number | null;
type ArchivedId = string | null;

// Once the live run reaches its outcome, looks for the archive that matches its reportCallId so
// the Flow tab can replay it instead of showing the live outcome view forever. Polls on
// replayPollDelay's schedule but never gives up while mounted: the chair's archive can land
// minutes after the compare, at the turn's end. Resets when a new turn starts a different
// reportCallId.
export function useLiveReplay(dir: string | null, reportCallId: string | null, running: boolean, outcome: boolean): RunReport | null {
  const statusRpc = useRpc(runStatusRpc);
  const reportRpc = useRpc(runReportRpc);
  const queryClient = useQueryClient();
  const enabled = outcome && !running && dir !== null;
  const startedAt = useRef<StartedAt>(null);
  useEffect(() => {
    startedAt.current = enabled ? Date.now() : null;
  }, [enabled, reportCallId]);

  const status = useQuery({
    queryKey: keys.runStatus(dir ?? ""),
    queryFn: () => statusRpc({ dir: dir! }),
    enabled,
  });
  const archive = status.data ?? null;
  const matched = archive !== null && archive.archivedId !== null && archive.reportCallId === reportCallId;

  // Keyed on dataUpdatedAt, not status.data: react-query's structural sharing keeps the same data
  // reference across refetches that return an identical result (e.g. still no archive), so a key
  // on the data itself would never re-arm the timer past the first retry.
  useEffect(() => {
    if (!enabled || matched) return;
    const elapsed = Date.now() - (startedAt.current ?? Date.now());
    const timer = setTimeout(() => void status.refetch(), replayPollDelay(elapsed));
    return () => clearTimeout(timer);
  }, [enabled, matched, status.dataUpdatedAt]);

  const invalidatedFor = useRef<ArchivedId>(null);
  useEffect(() => {
    if (matched && archive!.archivedId !== invalidatedFor.current) {
      invalidatedFor.current = archive!.archivedId;
      void queryClient.invalidateQueries({ queryKey: keys.runsPrefix });
    }
  }, [matched, archive, queryClient]);

  const archivedId = matched ? archive!.archivedId : null;
  const archived = useQuery({
    queryKey: keys.runArchived(archivedId ?? ""),
    queryFn: () => reportRpc({ id: archivedId! }),
    enabled: archivedId !== null,
  });

  const timeline = matched ? (archived.data?.timeline ?? null) : null;
  const mode = liveReplayMode({ running, reportCallId, archive, timeline });
  return mode === "replay" ? (archived.data ?? null) : null;
}
