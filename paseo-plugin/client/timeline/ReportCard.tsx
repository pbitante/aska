import { useAgent, useRpc, type PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { runReportRpc, runStatusRpc } from "../../shared/runs";
import { Button, useControlStyles } from "../controls";
import { countsLine, followUpLines, isSuperseded, questionFromBrief, verdictPills } from "../logic/report";
import { errorText, keys } from "../query";
import { FollowUpList } from "../run/FollowUpList";
import { Pills } from "../run/Pills";
import type { ReportData } from "./transform";
import { useRunPill, type ShowRunPill } from "./useRunPill";

const IDLE_POLL_WINDOW_MS = 60_000;
const POLL_INTERVAL_MS = 3000;
type IdleSince = number | null;

export function makeReportCard(openRunPanel: (workspaceId: string, agentId: string) => void, showRunPill: ShowRunPill) {
  return function ReportCard({ item, agentId, theme }: PluginTimelineItemProps<ReportData>) {
    const s = useControlStyles(theme);
    const { dir, callId } = item.data;
    const workspaceId = useAgent(agentId, (a) => a.workspaceId);
    const agentStatus = useAgent(agentId, (a) => a.status);
    useRunPill(agentId, showRunPill);
    const agentBusy = agentStatus === "running" || agentStatus === "initializing";
    const [idleSince, setIdleSince] = useState<IdleSince>(null);
    useEffect(() => {
      if (agentBusy) setIdleSince(null);
      else setIdleSince((prev) => prev ?? Date.now());
    }, [agentBusy]);
    const reportRpc = useRpc(runReportRpc);
    const statusRpc = useRpc(runStatusRpc);
    const report = useQuery({
      queryKey: keys.runReport(dir, callId),
      queryFn: () => reportRpc({ dir, ...(workspaceId ? { workspaceId } : {}) }),
      enabled: workspaceId !== null,
      staleTime: Infinity,
    });
    const status = useQuery({
      queryKey: keys.runStatus(dir),
      queryFn: () => statusRpc({ dir }),
      refetchInterval: () => (agentBusy || (idleSince !== null && Date.now() - idleSince < IDLE_POLL_WINDOW_MS) ? POLL_INTERVAL_MS : false),
    });
    const latest = status.data?.reportCallId ?? null;
    const superseded = isSuperseded(latest, callId, agentBusy);
    const archived = report.data?.source === "archive";
    const c = report.data?.comparison ?? null;
    const compareError = report.data?.compareError ?? null;
    const question = c?.question ?? (report.data?.brief ? questionFromBrief(report.data.brief) : null) ?? "Panel run";
    return (
      <View
        style={{
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
          borderRadius: 10,
          padding: 12,
          gap: 8,
          opacity: superseded ? 0.6 : 1,
        }}
      >
        <Text style={s.muted}>aska panel · {c?.panel ?? report.data?.result?.panel ?? "ad-hoc"}</Text>
        <Text style={s.text} numberOfLines={2}>
          {question}
        </Text>
        {superseded ? <Text style={s.muted}>Superseded by a newer report.</Text> : null}
        {workspaceId === null ? <Text style={s.muted}>Open this agent to load its report.</Text> : report.isPending ? <Text style={s.muted}>Loading report…</Text> : null}
        {report.isError ? <Text style={s.muted}>{errorText(report.error)}</Text> : null}
        {compareError ? <Text style={s.muted}>{compareError}</Text> : null}
        {c ? (
          <>
            <Pills theme={theme} pills={verdictPills(c)} />
            <Text style={s.muted}>{countsLine(c)}</Text>
            <FollowUpList theme={theme} lines={followUpLines(c)} agentId={archived ? null : agentId} dir={dir} callId={callId} disabled={superseded} />
            {archived ? <Text style={s.muted}>Archived: the run folder is gone, so follow-ups can't run.</Text> : null}
          </>
        ) : null}
        {workspaceId ? (
          <View style={s.row}>
            <Button theme={theme} label="Open full report" onPress={() => openRunPanel(workspaceId, agentId)} />
          </View>
        ) : null}
      </View>
    );
  };
}
