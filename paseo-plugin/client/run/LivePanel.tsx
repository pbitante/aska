import { usePaseo, useRpc, type PluginAgentPanelProps } from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { assembleRun, type LiveRun } from "../../shared/recognize";
import { runReportRpc } from "../../shared/runs";
import { startTimes, type StartTimes } from "../logic/flow/model";
import { questionFromBrief } from "../logic/report";
import { errorText, keys } from "../query";
import { useScreenStyles } from "../styles";
import { FlowView } from "./flow/FlowView";
import { ReportView } from "./ReportView";
import { useLiveReplay } from "./useLiveReplay";
import { useRunActivity } from "./useRunActivity";

type Entries = readonly { item: unknown; timestamp: string }[];
type LoadError = string | null;

const REFETCH_EVERY_MS = 1500;

function useAgentTimeline(agentId: string): { entries: Entries; error: LoadError } {
  const paseo = usePaseo();
  const [entries, setEntries] = useState<Entries>([]);
  const [error, setError] = useState<LoadError>(null);
  const pending = useRef(false);
  useEffect(() => {
    let cancelled = false;
    const timeline = paseo.agents.ref(agentId).timeline;
    const load = () => {
      timeline.refetch({ direction: "tail", limit: 500, projection: "projected" }).then(
        (page) => {
          if (!cancelled) {
            setEntries(page.entries.map((e) => ({ item: e.item, timestamp: e.timestamp })));
            setError(null);
          }
        },
        (e: unknown) => {
          if (!cancelled) setError(errorText(e));
        },
      );
    };
    load();
    // At most one refetch per REFETCH_EVERY_MS while events stream in. A refetch that fires
    // after unmount is harmless: `cancelled` stops it from setting state.
    const unsubscribe = timeline.subscribe(() => {
      if (pending.current) return;
      pending.current = true;
      setTimeout(() => {
        pending.current = false;
        if (!cancelled) load();
      }, REFETCH_EVERY_MS);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [paseo, agentId]);
  return { entries, error };
}

function Run({
  theme,
  layout,
  agentId,
  workspaceId,
  run,
  startedAt,
}: Pick<PluginAgentPanelProps, "theme" | "layout" | "agentId" | "workspaceId"> & { run: LiveRun; startedAt: StartTimes }) {
  const s = useScreenStyles(theme, layout);
  const reportRpc = useRpc(runReportRpc);
  const dir = run.dir;
  const report = useQuery({
    queryKey: keys.runReport(dir ?? "", run.reportCallId, run.judgmentsSaved.length),
    queryFn: () => reportRpc({ dir: dir!, workspaceId }),
    enabled: dir !== null,
    placeholderData: (previous) => previous,
  });
  const data = report.data;
  const question = data?.brief ? questionFromBrief(data.brief) : null;
  const running = run.panelists.some((p) => p.state === "running");
  const activity = useRunActivity(agentId, running);
  const replay = useLiveReplay(dir, run.reportCallId, running, (data?.comparison ?? null) !== null);
  if (data) return <ReportView theme={theme} layout={layout} report={data} agentId={agentId} live={{ run, startedAt, activity, replay }} />;
  return (
    <View style={s.section}>
      <Text style={s.title}>{question ?? "Panel run in progress"}</Text>
      <FlowView theme={theme} layout={layout} run={run} report={null} startedAt={startedAt} activity={activity} />
      {report.isError ? <Text style={s.muted}>{errorText(report.error)}</Text> : null}
    </View>
  );
}

export function LivePanel({ theme, layout, agentId, workspaceId }: PluginAgentPanelProps) {
  const s = useScreenStyles(theme, layout);
  const { entries, error } = useAgentTimeline(agentId);
  const items = useMemo(() => entries.map((e) => e.item), [entries]);
  const startedAt = useMemo(() => startTimes(entries), [entries]);
  const run = useMemo(() => assembleRun(items), [items]);
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      {error ? <Text style={s.muted}>Couldn't read this conversation: {error}</Text> : null}
      {run ? (
        <Run
          key={run.dir ?? "none"}
          theme={theme}
          layout={layout}
          agentId={agentId}
          workspaceId={workspaceId}
          run={run}
          startedAt={startedAt}
        />
      ) : (
        <Text style={s.muted}>No panel run in this conversation yet.</Text>
      )}
    </ScrollView>
  );
}
