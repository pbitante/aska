import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { captionFrame, edgeBox, LABEL_H, LABEL_W, type FlowLayout, type LayoutEdge, type LayoutNode } from "../../logic/flow/layout";
import type { Tone } from "../../logic/catalog";
import { toneColor, type Theme } from "../../styles";
import { DotFace } from "./DotFace";
import { TrackAxis } from "./Track";

export type NodeBadge = "done" | "reask" | null;

// The camera transform isn't committed to Fabric's shadow tree, so Pressability measures
// these Pressables at a stale position; an unbounded retention offset stops that staleness
// from cancelling the press, leaving the viewport's own drag detection to end it instead.
const PRESS_RETENTION_OFFSET = { top: 10000, left: 10000, right: 10000, bottom: 10000 };

export interface Point {
  x: number;
  y: number;
}
export interface Particle {
  id: string;
  from: Point;
  to: Point;
  tone: Tone;
}

function EdgeLine({ theme, a, b, edge, reduce }: { theme: Theme; a: Point; b: Point; edge: LayoutEdge; reduce: boolean }) {
  const box = edgeBox(a, b);
  const t = edge.weight + 0.5;
  const opacity = useState(() => new Animated.Value(reduce ? 0.7 : 0))[0];
  useEffect(() => {
    if (reduce) {
      opacity.setValue(0.7);
      return;
    }
    Animated.timing(opacity, { toValue: 0.7, duration: 300, useNativeDriver: true }).start();
  }, [reduce, opacity]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: box.left,
        top: box.top - t / 2,
        width: box.length,
        height: 0,
        borderTopWidth: t,
        borderStyle: edge.style,
        borderColor: toneColor(theme, edge.tone),
        opacity,
        transform: [{ rotate: `${box.angle}rad` }],
      }}
    />
  );
}

function AnimatedNode({
  theme,
  node,
  start,
  reduce,
  pulse,
  flash,
  badge,
  caption,
  label,
  locked,
  onPress,
}: {
  theme: Theme;
  node: LayoutNode;
  start: Point;
  reduce: boolean;
  pulse: boolean;
  flash: number;
  badge: NodeBadge;
  caption: string;
  label: string;
  locked: boolean;
  onPress: () => void;
}) {
  const [pos] = useState(() => new Animated.ValueXY(start));
  const [fade] = useState(() => new Animated.Value(reduce ? 1 : 0));
  const [scale] = useState(() => new Animated.Value(1));
  const [flashScale] = useState(() => new Animated.Value(1));
  const firstFlash = useRef(true);
  useEffect(() => {
    if (firstFlash.current) {
      firstFlash.current = false;
      return;
    }
    if (reduce) {
      fade.setValue(0.5);
      Animated.timing(fade, { toValue: node.faded ? 0.3 : 1, duration: 600, useNativeDriver: true }).start();
      return;
    }
    Animated.sequence([
      Animated.timing(flashScale, { toValue: 1.25, duration: 150, useNativeDriver: true }),
      Animated.timing(flashScale, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [flash]);
  useEffect(() => {
    if (reduce) {
      pos.setValue({ x: node.x, y: node.y });
      return;
    }
    Animated.spring(pos, { toValue: { x: node.x, y: node.y }, useNativeDriver: true, friction: 8, tension: 50 }).start();
  }, [node.x, node.y, reduce, pos]);
  useEffect(() => {
    Animated.timing(fade, { toValue: node.faded ? 0.3 : 1, duration: reduce ? 0 : 400, useNativeDriver: true }).start();
  }, [node.faded, reduce, fade]);
  useEffect(() => {
    if (!pulse || reduce) {
      scale.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.12, duration: 700, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduce, scale]);
  const d = node.r * 2;
  const isDot = node.kind === "dot";
  const inner = node.kind === "panelist" ? node.label : "";
  const frame = captionFrame(node.r);
  return (
    <Animated.View
      pointerEvents={locked ? "none" : "auto"}
      style={{ position: "absolute", left: -node.r, top: -node.r, opacity: fade, transform: [{ translateX: pos.x }, { translateY: pos.y }, { scale: Animated.multiply(scale, flashScale) }] }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={10}
        pressRetentionOffset={PRESS_RETENTION_OFFSET}
        onPress={onPress}
        style={
          isDot
            ? undefined
            : {
                width: d,
                height: d,
                borderRadius: node.r,
                backgroundColor: theme.colors.surface1,
                borderWidth: node.ring ? 3 : 1.5 + 2 * node.emphasis,
                borderColor: node.ring ? toneColor(theme, node.ring) : node.emphasis >= 0.5 ? theme.colors.foreground : toneColor(theme, node.tone),
                alignItems: "center",
                justifyContent: "center",
              }
        }
      >
        {isDot ? (
          <DotFace theme={theme} r={node.r} tone={node.tone} label={node.label} />
        ) : inner ? (
          <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontSize: 11 }}>
            {inner}
          </Text>
        ) : null}
      </Pressable>
      {badge ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: d - 10,
            top: -4,
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: theme.colors.surface1,
            borderWidth: 1,
            borderColor: theme.colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 9, color: badge === "done" ? toneColor(theme, "ok") : theme.colors.foregroundMuted }}>{badge === "done" ? "✓" : "↻"}</Text>
        </View>
      ) : null}
      {caption ? (
        // The box sets the caption's width. On web a one-line Text gets maxWidth: 100% of its
        // containing block, which for an absolutely positioned Text is this node, only 2r wide.
        <View pointerEvents="none" style={{ position: "absolute", left: frame.left, top: frame.top, width: frame.width }}>
          <Text numberOfLines={1} ellipsizeMode="tail" style={{ textAlign: "center", fontSize: 11, color: theme.colors.foregroundMuted }}>
            {caption}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

function ParticleDot({ theme, particle, onDone }: { theme: Theme; particle: Particle; onDone: (id: string) => void }) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 900, useNativeDriver: true }).start(() => onDone(particle.id));
  }, [t, particle.id, onDone]);
  const x = t.interpolate({ inputRange: [0, 1], outputRange: [particle.from.x, particle.to.x] });
  const y = t.interpolate({ inputRange: [0, 1], outputRange: [particle.from.y, particle.to.y] });
  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: "absolute", left: -3, top: -3, width: 6, height: 6, borderRadius: 3, backgroundColor: toneColor(theme, particle.tone), transform: [{ translateX: x }, { translateY: y }] }}
    />
  );
}

export function FlowCanvas({
  theme,
  flow,
  previous,
  reduce,
  captions,
  pulsing,
  flashOf,
  badgeOf,
  captionOf,
  labelOf,
  particles,
  onParticleDone,
  onPress,
}: {
  theme: Theme;
  flow: FlowLayout;
  previous: ReadonlyMap<string, Point>;
  reduce: boolean;
  captions: boolean;
  pulsing: (node: LayoutNode) => boolean;
  flashOf: (node: LayoutNode) => number;
  badgeOf: (node: LayoutNode) => NodeBadge;
  captionOf: (node: LayoutNode) => string;
  labelOf: (node: LayoutNode) => string;
  particles: readonly Particle[];
  onParticleDone: (id: string) => void;
  onPress: (node: LayoutNode) => void;
}) {
  const at = new Map(flow.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  const nodeById = new Map(flow.nodes.map((n) => [n.id, n]));
  const tracksMode = flow.rows.length > 0;
  const firstTrack = flow.rows.find((r) => !r.quiet);
  return (
    <>
      {flow.rows
        .filter((row) => !row.quiet)
        .map((row) => (
          <TrackAxis key={row.unit} theme={theme} y={row.y} stops={flow.stops} labels={row === firstTrack} />
        ))}
      {(captions ? flow.rows : []).map((row) => {
        const unitNode = nodeById.get(`u:${row.unit}`);
        return (
          <Pressable
            key={`label:${row.unit}`}
            accessibilityRole="button"
            accessibilityLabel={`${row.label}, open details`}
            pressRetentionOffset={PRESS_RETENTION_OFFSET}
            onPress={() => unitNode && onPress(unitNode)}
            style={{ position: "absolute", left: row.x, top: row.y - LABEL_H / 2, width: LABEL_W, height: LABEL_H, justifyContent: "center", opacity: row.quiet ? 0.5 : 1 }}
          >
            <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 11, color: theme.colors.foregroundMuted }}>
              {row.label}
            </Text>
          </Pressable>
        );
      })}
      {flow.edges.map((e) => {
        const a = at.get(e.from);
        const b = at.get(e.to);
        return a && b ? <EdgeLine key={e.id} theme={theme} a={a} b={b} edge={e} reduce={reduce} /> : null;
      })}
      {flow.nodes.map((node) => (
        <AnimatedNode
          key={node.id}
          theme={theme}
          node={node}
          start={previous.get(node.id) ?? (node.spawnFrom ? (previous.get(node.spawnFrom) ?? { x: node.x, y: node.y }) : { x: node.x, y: node.y })}
          reduce={reduce}
          pulse={pulsing(node)}
          flash={flashOf(node)}
          badge={badgeOf(node)}
          caption={captions ? captionOf(node) : ""}
          label={labelOf(node)}
          locked={tracksMode && node.kind === "unit"}
          onPress={() => onPress(node)}
        />
      ))}
      {reduce ? null : particles.map((p) => <ParticleDot key={p.id} theme={theme} particle={p} onDone={onParticleDone} />)}
    </>
  );
}
