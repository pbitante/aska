import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Platform, Pressable, Text, View, type GestureResponderEvent } from "react-native";
import { useControlStyles } from "../../controls";
import {
  CAPTION_MIN_SCALE,
  followStep,
  gestureMove,
  scaleLimits,
  SLOP,
  viewEvent,
  ZOOM_STEP,
  zoomAt,
  type Bounds,
  type Camera,
  type FollowEvent,
  type FollowState,
  type Gesture,
  type ViewKey,
  type XY,
} from "../../logic/flow/camera";
import type { FlowMode } from "../../logic/flow/layout";
import {
  idleSettle,
  rebasePage,
  settleLand,
  settleStart,
  settleTimeout,
  SETTLE_TIMEOUT_MS,
  type SettleState,
} from "../../logic/flow/viewport";
import type { Theme } from "../../styles";

const FIT_MS = 300;

// On web, react-native-web's View ref is the element itself. React registers its own wheel
// listener as passive, so preventDefault() there is ignored; this one is added non-passive.
type WheelEventLike = { deltaY: number; ctrlKey: boolean; metaKey: boolean; clientX: number; clientY: number; preventDefault: () => void };
type WheelTarget = {
  addEventListener: (type: "wheel", fn: (e: WheelEventLike) => void, opts: { passive: false }) => void;
  removeEventListener: (type: "wheel", fn: (e: WheelEventLike) => void) => void;
  getBoundingClientRect: () => { left: number; top: number };
};

function ZoomButton({
  theme,
  label,
  accessibilityLabel,
  target,
  selected = false,
  onPress,
}: {
  theme: Theme;
  label: string;
  accessibilityLabel: string;
  target: number;
  selected?: boolean;
  onPress: () => void;
}) {
  const s = useControlStyles(theme);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[s.button, selected && s.primary, { minWidth: target, minHeight: target, paddingHorizontal: 8, paddingVertical: 0, alignItems: "center", justifyContent: "center" }]}
    >
      <Text style={{ color: selected ? theme.colors.accentForeground : theme.colors.foreground, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

// A window onto the Flow's world. Drag to pan, pinch to zoom, or use −, + and Fit. It opens
// fitted and re-fits as the world changes, until you pan or zoom; Fit hands control back.
export function FlowViewport({
  theme,
  compact,
  bounds,
  origin,
  modeKey,
  jump,
  reduce,
  children,
}: {
  theme: Theme;
  compact: boolean;
  bounds: Bounds;
  origin: XY;
  modeKey: FlowMode;
  jump: number;
  reduce: boolean;
  children: (captions: boolean) => ReactNode;
}) {
  const box = useRef<View>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [ready, setReady] = useState(false);
  const [captions, setCaptions] = useState(true);
  const [following, setFollowing] = useState(true);
  const [tx] = useState(() => new Animated.Value(0));
  const [ty] = useState(() => new Animated.Value(0));
  const [sc] = useState(() => new Animated.Value(1));
  // The camera's Animated values drive the view; this mirror feeds the pure maths.
  const state = useRef<FollowState>({ camera: { x: 0, y: 0, scale: 1 }, follow: true });
  const gesture = useRef<Gesture>(null);
  const page = useRef<XY>({ x: 0, y: 0 });
  const down = useRef<XY>({ x: 0, y: 0 });
  const seen = useRef<ViewKey | null>(null);
  const fitting = useRef(false);
  const epoch = useRef(0);
  const settleState = useRef<SettleState>(idleSettle);
  const timer = useRef<NodeJS.Timeout | null>(null);
  const mounted = useRef(true);

  // The timer outlives any single settle(); clear it on unmount so a late timeout can't fire (and
  // run an action) against an unmounted component.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  const runActions = (actions: readonly (() => void)[]) => {
    if (!mounted.current) return;
    for (const fn of actions) fn();
  };

  // After a wait finishes or times out: run `run` now, or — when `reWait` says a Fit press or a
  // follow re-fit started a new animation mid-wait — re-submit it through `settle()` instead, so
  // the first one waits on the new animation's real stopped camera and the rest queue behind it,
  // rather than running against that animation's mid-flight target.
  const afterSettle = (run: readonly (() => void)[], reWait: boolean) => {
    if (!mounted.current) return;
    if (reWait) {
      for (const fn of run) settle(fn);
    } else {
      for (const fn of run) fn();
    }
  };

  const show = (camera: Camera, animate: boolean) => {
    tx.stopAnimation();
    ty.stopAnimation();
    sc.stopAnimation();
    fitting.current = animate;
    if (animate) {
      Animated.parallel([
        Animated.timing(tx, { toValue: camera.x, duration: FIT_MS, useNativeDriver: true }),
        Animated.timing(ty, { toValue: camera.y, duration: FIT_MS, useNativeDriver: true }),
        Animated.timing(sc, { toValue: camera.scale, duration: FIT_MS, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) fitting.current = false;
      });
    } else {
      tx.setValue(camera.x);
      ty.setValue(camera.y);
      sc.setValue(camera.scale);
    }
    setCaptions(camera.scale >= CAPTION_MIN_SCALE);
  };
  const commit = (event: FollowEvent, animate: boolean) => {
    epoch.current += 1;
    const next = followStep(state.current, event, bounds, size);
    state.current = next;
    setFollowing(next.follow);
    show(next.camera, animate && next.follow && !reduce);
  };

  // Stops a running follow-fit and reads the camera from where it stopped, so a gesture or a button
  // press carries on from what's on screen instead of jumping to the fit's target. On the native
  // driver the stopped values arrive asynchronously; moves are ignored until they do. A call that
  // arrives while an earlier one is still settling is queued, rather than running early against a
  // stale camera that the earlier settle would otherwise overwrite. If the callbacks haven't all
  // landed after SETTLE_TIMEOUT_MS, a timer fires the same action/queue from the last known camera
  // instead of hanging forever; a Fit press, a follow re-fit or a jump that commits while settling
  // bumps `epoch`, so stale stopped values that land after it are discarded — and if that commit
  // started a new animation (a Fit press or a follow re-fit), `afterSettle` re-waits on it instead
  // of running against its mid-flight target.
  const settle = (then: () => void) => {
    const started = settleStart(settleState.current, fitting.current, epoch.current, then);
    settleState.current = started.state;
    if (!started.begin) {
      runActions(started.run);
      return;
    }
    fitting.current = false;
    const session = settleState.current.session;
    const got = { ...state.current.camera };
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      const result = settleTimeout(settleState.current, fitting.current);
      settleState.current = result.state;
      if (!result.timedOut) return;
      console.warn("FlowViewport: settle() timed out waiting for the camera to stop; continuing from the last known camera.");
      afterSettle(result.run, result.reWait);
    }, SETTLE_TIMEOUT_MS);
    const land = (axis: "x" | "y" | "scale") => (v: number) => {
      got[axis] = v;
      const result = settleLand(settleState.current, session, epoch.current, fitting.current);
      settleState.current = result.state;
      if (result.run.length === 0) return;
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      if (result.apply) state.current = { ...state.current, camera: got };
      afterSettle(result.run, result.reWait);
    };
    tx.stopAnimation(land("x"));
    ty.stopAnimation(land("y"));
    sc.stopAnimation(land("scale"));
  };

  // The world, the viewport, the mode or a replay jump changed. A follow-fit animates, except on
  // the first fit, under reduce-motion, and on a jump, which snaps.
  useEffect(() => {
    if (size.width === 0 || size.height === 0) return;
    const first = seen.current === null;
    const next: ViewKey = { bounds, viewport: size, mode: modeKey, chosen: modeKey === "map" || modeKey === "tracks", jump, origin };
    const event = viewEvent(seen.current, next);
    seen.current = next;
    if (event === null) return;
    commit(event, !first && event.kind !== "jump");
    if (first) setReady(true);
  }, [bounds.x, bounds.y, bounds.width, bounds.height, size.width, size.height, modeKey, jump, origin.x, origin.y]);

  // ctrl/⌘ + wheel, which includes a trackpad pinch, zooms at the cursor. A plain wheel is left
  // alone, so the panel still scrolls. Web only: iOS and Android have no wheel. Re-added when the
  // world or the viewport changes, so the handler never reads a stale bounds or size.
  useEffect(() => {
    if (Platform.OS !== "web" || !ready) return;
    const node = box.current as unknown as WheelTarget | null;
    if (node === null || typeof node.addEventListener !== "function") return;
    const onWheel = (e: WheelEventLike) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = node.getBoundingClientRect();
      const at = { x: e.clientX - r.left, y: e.clientY - r.top };
      settle(() => commit({ kind: "user", camera: zoomAt(state.current.camera, Math.exp(-e.deltaY * 0.01), at, scaleLimits(bounds, size)) }, false));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [ready, bounds.x, bounds.y, bounds.width, bounds.height, size.width, size.height]);

  // `measure()` is asynchronous, so a page offset it reads can land after a gesture already started
  // from the previous (possibly stale) offset — e.g. after scrolling the panel that holds the Flow.
  // When that happens mid-gesture, re-base it: the next move starts a fresh gesture from the
  // current camera, using the corrected offset, instead of jumping by the offset's change.
  const measure = () => {
    box.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
      const rebased = rebasePage(page.current, { x: pageX, y: pageY }, gesture.current);
      page.current = rebased.page;
      gesture.current = rebased.gesture;
    });
  };
  const points = (e: GestureResponderEvent): XY[] => {
    const n = e.nativeEvent;
    const touches = n.touches.length > 0 ? n.touches : [n];
    return touches.map((t) => ({ x: t.pageX - page.current.x, y: t.pageY - page.current.y }));
  };
  const move = (e: GestureResponderEvent) => {
    if (settleState.current.settling) return;
    const step = gestureMove(gesture.current, points(e), state.current.camera, scaleLimits(bounds, size));
    gesture.current = step.gesture;
    if (step.camera !== state.current.camera) commit({ kind: "user", camera: step.camera }, false);
  };
  const zoomBy = (factor: number) => {
    const centre = { x: size.width / 2, y: size.height / 2 };
    settle(() => commit({ kind: "user", camera: zoomAt(state.current.camera, factor, centre, scaleLimits(bounds, size)) }, false));
  };
  const end = () => {
    gesture.current = null;
  };
  const target = compact ? 44 : 28;

  return (
    <View
      ref={box}
      onLayout={(e) => {
        setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });
        measure();
      }}
      // Taps reach the nodes. A touch that moves past SLOP, or a second finger, becomes a pan or
      // pinch, even when it started on a node. Granting returns true, which blocks the native
      // responder on Android, and refusing termination keeps the panel's ScrollView out.
      onStartShouldSetResponder={() => false}
      onStartShouldSetResponderCapture={(e) => {
        down.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        return false;
      }}
      onMoveShouldSetResponderCapture={(e) =>
        e.nativeEvent.touches.length >= 2 || Math.hypot(e.nativeEvent.pageX - down.current.x, e.nativeEvent.pageY - down.current.y) > SLOP
      }
      onResponderGrant={(e) => {
        measure();
        gesture.current = null;
        settle(() => {
          commit({ kind: "user", camera: state.current.camera }, false);
          move(e);
        });
        return true;
      }}
      onResponderStart={(e) => {
        // A second finger landed: the page offset may have moved since grant.
        if (e.nativeEvent.touches.length >= 2) measure();
      }}
      onResponderMove={move}
      onResponderRelease={end}
      onResponderTerminate={end}
      onResponderTerminationRequest={() => false}
      style={{ height: compact ? 320 : 420, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface0, overflow: "hidden" }}
    >
      {ready && size.width > 0 && size.height > 0 ? (
        // Sized to the world, which starts at (0, 0): Android only delivers touches inside a parent's box.
        <Animated.View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: bounds.width,
            height: bounds.height,
            transformOrigin: "left top",
            transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }],
          }}
        >
          {children(captions)}
        </Animated.View>
      ) : null}
      <View style={{ position: "absolute", top: 8, right: 8, flexDirection: "row", gap: 6 }}>
        <ZoomButton theme={theme} label="−" accessibilityLabel="Zoom out" target={target} onPress={() => zoomBy(1 / ZOOM_STEP)} />
        <ZoomButton theme={theme} label="+" accessibilityLabel="Zoom in" target={target} onPress={() => zoomBy(ZOOM_STEP)} />
        <ZoomButton
          theme={theme}
          label="Fit"
          accessibilityLabel="Fit to view"
          target={target}
          selected={following}
          onPress={() => settle(() => commit({ kind: "fit" }, true))}
        />
      </View>
    </View>
  );
}
