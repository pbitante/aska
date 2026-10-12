import { Pressable, Text, View } from "react-native";
import { stopPositions, stopTone, trackDots, type StopX } from "../../logic/flow/layout";
import type { FlowPanelist, FlowUnit, TrackStop } from "../../logic/flow/model";
import type { Theme } from "../../styles";
import { DotFace } from "./DotFace";

const STOP_LABEL: Record<TrackStop, string> = { cleared: "cleared", "not-raised": "not raised", low: "low", medium: "medium", high: "high" };

// The axis of one track: a line across the stops, optionally with the stop labels above it.
export function TrackAxis({ theme, y, stops, labels }: { theme: Theme; y: number; stops: readonly StopX[]; labels: boolean }) {
  const first = stops[0]!.x;
  const last = stops[stops.length - 1]!.x;
  return (
    <>
      <View pointerEvents="none" style={{ position: "absolute", left: first, top: y - 1, width: last - first, height: 2, backgroundColor: theme.colors.border }} />
      {labels
        ? stops.map((s) => (
            <Text key={s.stop} pointerEvents="none" style={{ position: "absolute", left: s.x - 30, width: 60, top: y - 30, textAlign: "center", fontSize: 9, color: theme.colors.foregroundMuted }}>
              {STOP_LABEL[s.stop]}
            </Text>
          ))
        : null}
    </>
  );
}

// One unit's tug-of-war, drawn statically (the drawer, or Tracks mode's standalone preview).
export function Track({
  theme,
  unit,
  panelists,
  width,
  onPickDot,
}: {
  theme: Theme;
  unit: FlowUnit;
  panelists: readonly FlowPanelist[];
  width: number;
  onPickDot?: (panelist: string) => void;
}) {
  const stops = stopPositions(24, Math.max(48, width - 24));
  const y = 44;
  const r = 10;
  const initialOf = new Map(panelists.map((p) => [p.id, p.initial]));
  const personaOf = (id: string) => panelists.find((p) => p.id === id)?.persona ?? id;
  return (
    <View style={{ height: 72, width }}>
      <TrackAxis theme={theme} y={y} stops={stops} labels />
      {trackDots(unit.cells, stops, r).map((d) => (
        <Pressable
          key={d.panelist}
          accessibilityRole="button"
          accessibilityLabel={`${personaOf(d.panelist)}, ${unit.label}, ${STOP_LABEL[d.position]}`}
          onPress={() => onPickDot?.(d.panelist)}
          style={{ position: "absolute", left: d.x - r, top: y - r }}
        >
          <DotFace theme={theme} r={r} tone={stopTone(d.position)} label={initialOf.get(d.panelist) ?? "?"} />
        </Pressable>
      ))}
    </View>
  );
}

export { STOP_LABEL };
