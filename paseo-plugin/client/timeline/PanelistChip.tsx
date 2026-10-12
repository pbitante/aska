import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { fmtElapsed, shortPersona } from "../logic/report";
import { toneColor } from "../styles";
import type { PanelistData } from "./transform";
import { useRunPill, type ShowRunPill } from "./useRunPill";

type Elapsed = number | null;

function line(d: PanelistData, now: number, start: number, ranFor: Elapsed): { text: string; tone: "ok" | "warning" | "error" | "muted" } {
  if (d.state === "running") return { text: `⏳ running ${fmtElapsed(now - start)}`, tone: "warning" };
  if (d.state === "done") return { text: ranFor !== null ? `✓ done ${fmtElapsed(ranFor)}` : "✓ done", tone: "ok" };
  if (d.state === "failed") return { text: `✗ failed: ${d.error ?? "failed"}`, tone: "error" };
  return { text: "– canceled", tone: "muted" };
}

export function makePanelistChip(showRunPill: ShowRunPill) {
  return function PanelistChip({ item, timestamp, theme, agentId }: PluginTimelineItemProps<PanelistData>) {
    useRunPill(agentId, showRunPill);
    const d = item.data;
    const start = timestamp.getTime();
    const [now, setNow] = useState(() => Date.now());
    const [ranFor, setRanFor] = useState<Elapsed>(null);
    const sawRunning = useRef(d.state === "running");
    useEffect(() => {
      if (d.state === "running") {
        sawRunning.current = true;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
      }
      if (sawRunning.current) {
        sawRunning.current = false;
        setRanFor(Date.now() - start);
      }
      return undefined;
    }, [d.state, start]);
    const { text, tone } = line(d, now, start, ranFor);
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, paddingVertical: 2 }} accessibilityLabel={`Panelist ${shortPersona(d.persona)} ${text}`}>
        <Text style={{ color: theme.colors.foreground, fontSize: 13 }}>
          {shortPersona(d.persona)}
          {d.reask ? " (re-ask)" : ""} ·
        </Text>
        <Text style={{ color: toneColor(theme, tone), fontSize: 13 }}>{text}</Text>
      </View>
    );
  };
}
