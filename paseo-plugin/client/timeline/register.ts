import type { PluginClientContext } from "@getpaseo/plugin/client";
import { followAgents } from "../logic/agentFeed";
import { createRunPills, RUN_PANEL_ID } from "../logic/runPills";
import { makePanelistChip } from "./PanelistChip";
import { makeReportCard } from "./ReportCard";
import { PANELIST_KIND, REPORT_KIND, panelistDataSchema, reportDataSchema, transformToolCall } from "./transform";

export function registerTimeline(client: PluginClientContext): (() => void)[] {
  const openRunPanel = (workspaceId: string, agentId: string) => client.openPanel(RUN_PANEL_ID, { workspaceId, agentId });
  const pills = createRunPills(client);
  const stopFollowing = followAgents(client.paseo, pills, (message) => console.error(message));
  return [
    client.addTimelineTransformer({ id: "aska-panel-run", query: { itemType: "tool_call" }, transform: ({ item }) => transformToolCall(item) }),
    client.addTimelineRenderer({ kind: PANELIST_KIND, version: 1, schema: panelistDataSchema, Component: makePanelistChip(pills.show) }),
    client.addTimelineRenderer({ kind: REPORT_KIND, version: 1, schema: reportDataSchema, Component: makeReportCard(openRunPanel, pills.show) }),
    stopFollowing,
    pills.dispose,
  ];
}
