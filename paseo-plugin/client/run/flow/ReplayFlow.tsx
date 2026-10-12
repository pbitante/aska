import { useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import type { RunReport } from "../../../shared/runs";
import { Button, useControlStyles } from "../../controls";
import { moments, nextMoment, prevMoment, replayAt, replayLabel, runSpan, scrubFraction, scrubTime, scrubYields, stepPlayback, TICK_MS } from "../../logic/flow/replay";
import type { Layout, Theme } from "../../styles";
import { FlowView } from "./FlowView";

// An archived run's Flow: it opens on the outcome; with a recorded timeline, it also replays.
export function ReplayFlow({ theme, layout, report }: { theme: Theme; layout: Layout; report: RunReport }) {
  const s = useControlStyles(theme);
  const timeline = report.timeline;
  const span = useMemo(() => (timeline ? runSpan(timeline) : null), [timeline]);
  const marks = useMemo(() => (timeline ? moments(timeline) : []), [timeline]);
  const [t, setT] = useState(() => (timeline ? runSpan(timeline).end : 0));
  const [playing, setPlaying] = useState(false);
  const [jump, setJump] = useState(0);
  const inputs = useMemo(() => replayAt(report, timeline, t), [report, timeline, t]);

  // Advance by wall-clock time since the last tick, so a slow frame doesn't slow the replay.
  useEffect(() => {
    if (!playing || !span) return undefined;
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const elapsed = now - last;
      last = now;
      setT((cur) => stepPlayback(cur, elapsed, span));
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [playing, span]);
  useEffect(() => {
    if (playing && span && t >= span.end) setPlaying(false);
  }, [playing, span, t]);

  const jumpTo = (next: number | null) => {
    if (next === null) return;
    setT(next);
    setJump((j) => j + 1);
  };
  const togglePlay = () => {
    if (!span) return;
    if (playing) {
      setPlaying(false);
      return;
    }
    if (t >= span.end) jumpTo(span.start);
    setPlaying(true);
  };
  const prev = prevMoment(marks, t);
  const next = nextMoment(marks, t);

  return (
    <View style={{ gap: 8 }}>
      <FlowView
        theme={theme}
        layout={layout}
        run={inputs.run}
        report={inputs.report}
        startedAt={inputs.startedAt}
        activity={null}
        replay={{ live: inputs.live, now: t, jump }}
      />
      {span ? (
        <View style={{ gap: 6 }}>
          <Scrubber
            theme={theme}
            fraction={scrubFraction(t, span)}
            onScrub={(x, width) => jumpTo(scrubTime(x, width, span))}
            onStep={(direction) => jumpTo(direction > 0 ? next : prev)}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <Button theme={theme} label="◀" accessibilityLabel="Previous moment" disabled={prev === null} onPress={() => jumpTo(prev)} />
            <Button theme={theme} label={playing ? "Pause" : "Play"} onPress={togglePlay} />
            <Button theme={theme} label="▶" accessibilityLabel="Next moment" disabled={next === null} onPress={() => jumpTo(next)} />
            <Text style={s.muted}>{replayLabel(span, marks, t)}</Text>
          </View>
        </View>
      ) : (
        <Text style={s.muted}>No replay for this run (archived before activity was recorded).</Text>
      )}
    </View>
  );
}

// A track with a thumb. Touch or drag sets the position. Screen readers adjust it moment by moment.
// The children ignore touches, so locationX is always relative to the track itself.
function Scrubber({
  theme,
  fraction,
  onScrub,
  onStep,
}: {
  theme: Theme;
  fraction: number;
  onScrub: (x: number, width: number) => void;
  onStep: (direction: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const start = useRef({ x: 0, y: 0 });
  const scrub = (x: number) => {
    if (width > 0) onScrub(x, width);
  };
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Replay position"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => onStep(e.nativeEvent.actionName === "increment" ? 1 : -1)}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => {
        start.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        scrub(e.nativeEvent.locationX);
      }}
      onResponderMove={(e) => scrub(e.nativeEvent.locationX)}
      // Inside the panel's vertical ScrollView: keep a slightly diagonal drag, but let a vertical
      // swipe go so the panel can still scroll from the strip.
      onResponderTerminationRequest={(e) => scrubYields(start.current, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })}
      // A 44pt touch strip, the minimum comfortable target on a phone.
      style={{ height: 44, justifyContent: "center" }}
    >
      <View pointerEvents="none" style={{ height: 4, borderRadius: 2, backgroundColor: theme.colors.border }} />
      <View
        pointerEvents="none"
        style={{ position: "absolute", left: Math.max(0, fraction * width - 7), width: 14, height: 14, borderRadius: 7, backgroundColor: theme.colors.foreground }}
      />
    </View>
  );
}
