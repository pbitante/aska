import { ScrollView } from "@getpaseo/plugin/client/react-native";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import type { RunActivity } from "../../shared/activity";
import type { LiveRun } from "../../shared/recognize";
import type { RunReport } from "../../shared/runs";
import { Segmented, useControlStyles } from "../controls";
import type { StartTimes } from "../logic/flow/model";
import { followUpLines, panelistSections, questionFromBrief, shortPersona, verdictPills } from "../logic/report";
import { useScreenStyles, type Layout, type Theme } from "../styles";
import { FollowUpList } from "./FollowUpList";
import { FlowView } from "./flow/FlowView";
import { ReplayFlow } from "./flow/ReplayFlow";
import { PanelistsTab } from "./PanelistsTab";
import { Pills } from "./Pills";
import { UnitsTab } from "./UnitsTab";

type Tab = "overview" | "units" | "panelists" | "followups" | "brief" | "flow";
const TABS: readonly { value: Tab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "units", label: "Units" },
  { value: "panelists", label: "Panelists" },
  { value: "followups", label: "Follow-ups" },
  { value: "brief", label: "Brief" },
];
const FLOW_TAB = { value: "flow" as const, label: "Flow" };

function Attributed({ theme, title, items }: { theme: Theme; title: string; items: readonly { persona: string; text: string }[] }) {
  const s = useControlStyles(theme);
  if (items.length === 0) return null;
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.label}>{title}</Text>
      {items.map((it, i) => (
        <Text key={i} selectable style={s.text}>
          <Text style={s.muted}>{shortPersona(it.persona)}: </Text>
          {it.text}
        </Text>
      ))}
    </View>
  );
}

// The full report: an archived run (agentId null, follow-ups read-only) or the live one.
export function ReportView({
  theme,
  layout,
  report,
  agentId,
  live = null,
}: {
  theme: Theme;
  layout: Layout;
  report: RunReport;
  agentId: string | null;
  live?: { run: LiveRun; startedAt: StartTimes; activity: RunActivity | null; replay?: RunReport | null } | null;
}) {
  const s = useScreenStyles(theme, layout);
  const c = report.comparison;
  const archived = report.source === "archive";
  const liveFlow = live !== null && report.source === "live";
  // Archived runs get the Flow tab too (replayable when they have a timeline) but still open on
  // the overview, as before.
  const tabs = liveFlow || archived ? [FLOW_TAB, ...TABS] : TABS;
  const [tab, setTab] = useState<Tab>(liveFlow ? "flow" : "overview");
  const sections = useMemo(() => panelistSections(report.result, report.judgments, c), [report, c]);
  const question = c?.question ?? report.result?.question ?? (report.brief ? questionFromBrief(report.brief) : null) ?? "Panel run";
  const panel = c?.panel ?? report.result?.panel ?? null;
  const when = report.meta ? new Date(report.meta.startedAt).toLocaleString() : null;
  return (
    <View style={s.section}>
      <Text style={s.title} selectable>
        {question}
      </Text>
      <Text style={s.muted}>
        {panel ?? "ad-hoc"} · {report.source === "archive" ? "archived" : "live"}
        {when ? ` · ${when}` : ""}
      </Text>
      {c && !c.ok ? <Text style={{ color: theme.colors.statusWarning }}>Fewer than two panelists produced a valid judgment.</Text> : null}
      {report.compareError ? <Text style={s.muted}>{report.compareError}</Text> : null}
      <ScrollView horizontal style={{ flexGrow: 0 }}>
        <Segmented theme={theme} label="Report section" options={tabs} value={tab} onChange={setTab} />
      </ScrollView>
      {tab === "flow" && liveFlow && live?.replay ? <ReplayFlow theme={theme} layout={layout} report={live.replay} /> : null}
      {tab === "flow" && liveFlow && live && !live.replay ? <FlowView theme={theme} layout={layout} run={live.run} report={report} startedAt={live.startedAt} activity={live.activity} /> : null}
      {tab === "flow" && archived ? <ReplayFlow theme={theme} layout={layout} report={report} /> : null}
      {tab === "overview" ? (
        <View style={{ gap: 12 }}>
          {c ? <Pills theme={theme} pills={verdictPills(c)} /> : <Text style={s.muted}>No comparison yet.</Text>}
          {c?.verdicts
            .filter((v) => v.reason)
            .map((v) => (
              <Text key={v.persona} style={s.muted}>
                {shortPersona(v.persona)}: {v.reason}
              </Text>
            ))}
          {c ? <Attributed theme={theme} title="Conditions" items={c.merged.conditions} /> : null}
          {c ? <Attributed theme={theme} title="Missing information" items={c.merged.missing} /> : null}
          {c ? (
            <Attributed theme={theme} title="Outside their scope" items={c.outsideScope.map((o) => ({ persona: o.persona, text: `${o.severity}: ${o.claim}` }))} />
          ) : null}
          {c ? <Attributed theme={theme} title="Persona sections" items={c.merged.sections.map((x) => ({ persona: x.persona, text: `${x.name}: ${x.text}` }))} /> : null}
          {report.meta && report.meta.skipped.length > 0 ? <Text style={s.muted}>Not archived: {report.meta.skipped.join(", ")}</Text> : null}
        </View>
      ) : null}
      {tab === "units" ? c ? <UnitsTab theme={theme} layout={layout} comparison={c} /> : <Text style={s.muted}>No comparison yet.</Text> : null}
      {tab === "panelists" ? <PanelistsTab theme={theme} sections={sections} /> : null}
      {tab === "followups" ? (
        c ? (
          <>
            <FollowUpList theme={theme} lines={followUpLines(c)} agentId={archived ? null : agentId} disabled={archived} />
            {archived ? <Text style={s.muted}>Archived: the run folder is gone, so follow-ups can't run.</Text> : null}
          </>
        ) : (
          <Text style={s.muted}>No comparison yet.</Text>
        )
      ) : null}
      {tab === "brief" ? (
        <Text selectable style={s.text}>
          {report.brief ?? "No brief.md in this run."}
        </Text>
      ) : null}
    </View>
  );
}
