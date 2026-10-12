import { describe, expect, it } from "vitest";
import {
  CAPTION_MIN_SCALE,
  FIT_PAD,
  fit,
  fitScale,
  followStep,
  gestureMove,
  KEEP,
  keepInView,
  MAX_SCALE,
  MIN_SCALE,
  pan,
  pinch,
  scaleLimits,
  viewEvent,
  zoomAt,
  type Bounds,
  type Camera,
  type FollowState,
  type ViewKey,
  type Viewport,
  type XY,
} from "../../client/logic/flow/camera";

const VP: Viewport = { width: 400, height: 300 };
const WIDE: Bounds = { x: -500, y: -200, width: 1000, height: 400 };
const SMALL: Bounds = { x: -50, y: -40, width: 100, height: 80 };
const LIMITS = { min: 0.25, max: MAX_SCALE };
const toScreen = (c: Camera, p: XY): XY => ({ x: p.x * c.scale + c.x, y: p.y * c.scale + c.y });
const toWorld = (c: Camera, p: XY): XY => ({ x: (p.x - c.x) / c.scale, y: (p.y - c.y) / c.scale });

describe("fit", () => {
  it("contains the bounds inside the padding, centred", () => {
    const c = fit(WIDE, VP);
    const tl = toScreen(c, { x: WIDE.x, y: WIDE.y });
    const br = toScreen(c, { x: WIDE.x + WIDE.width, y: WIDE.y + WIDE.height });
    expect(tl.x).toBeGreaterThanOrEqual(FIT_PAD - 1e-9);
    expect(tl.y).toBeGreaterThanOrEqual(FIT_PAD - 1e-9);
    expect(br.x).toBeLessThanOrEqual(VP.width - FIT_PAD + 1e-9);
    expect(br.y).toBeLessThanOrEqual(VP.height - FIT_PAD + 1e-9);
    expect((tl.x + br.x) / 2).toBeCloseTo(VP.width / 2);
    expect((tl.y + br.y) / 2).toBeCloseTo(VP.height / 2);
    expect(c.scale).toBeCloseTo((VP.width - 2 * FIT_PAD) / WIDE.width);
  });
  it("never zooms in past 1:1", () => {
    expect(fit(SMALL, VP).scale).toBe(1);
    expect(toScreen(fit(SMALL, VP), { x: 0, y: 0 })).toEqual({ x: 200, y: 150 });
  });
  it("gives a zero-size world scale 1, centred", () => {
    const c = fit({ x: 10, y: 20, width: 0, height: 0 }, VP);
    expect(c.scale).toBe(1);
    expect(toScreen(c, { x: 10, y: 20 })).toEqual({ x: 200, y: 150 });
  });
});

describe("zoom and limits", () => {
  it("keeps the world point under the cursor fixed", () => {
    const start: Camera = { x: 30, y: -20, scale: 0.8 };
    const point = { x: 120, y: 90 };
    const before = toWorld(start, point);
    const after = zoomAt(start, 1.5, point, LIMITS);
    expect(after.scale).toBeCloseTo(1.2);
    expect(toWorld(after, point).x).toBeCloseTo(before.x);
    expect(toWorld(after, point).y).toBeCloseTo(before.y);
  });
  it("clamps the scale to the limits", () => {
    expect(zoomAt({ x: 0, y: 0, scale: 2 }, 10, { x: 0, y: 0 }, LIMITS).scale).toBe(MAX_SCALE);
    expect(zoomAt({ x: 0, y: 0, scale: 0.3 }, 0.1, { x: 0, y: 0 }, LIMITS).scale).toBe(0.25);
  });
  it("puts the floor at the fit scale or MIN_SCALE, whichever is lower", () => {
    expect(scaleLimits(SMALL, VP)).toEqual({ min: MIN_SCALE, max: MAX_SCALE });
    const huge: Bounds = { x: 0, y: 0, width: 8000, height: 8000 };
    expect(scaleLimits(huge, VP).min).toBeCloseTo(fitScale(huge, VP));
    expect(scaleLimits(huge, VP).min).toBeLessThan(MIN_SCALE);
  });
  it("pans by a screen delta", () => {
    expect(pan({ x: 1, y: 2, scale: 3 }, 10, -5)).toEqual({ x: 11, y: -3, scale: 3 });
  });
  it("hides captions below a 0.6 scale", () => {
    expect(CAPTION_MIN_SCALE).toBe(0.6);
  });
});

describe("pinch", () => {
  const start: Camera = { x: 10, y: 20, scale: 1 };
  const a0 = { x: 100, y: 100 };
  const b0 = { x: 200, y: 100 };
  it("returns start when the fingers haven't moved", () => {
    expect(pinch(start, a0, b0, a0, b0, LIMITS)).toBe(start);
  });
  it("scales by the finger distance about the starting midpoint", () => {
    const c = pinch(start, a0, b0, { x: 50, y: 100 }, { x: 250, y: 100 }, LIMITS);
    expect(c.scale).toBeCloseTo(2);
    const m = { x: 150, y: 100 };
    expect(toWorld(c, m).x).toBeCloseTo(toWorld(start, m).x);
    expect(toWorld(c, m).y).toBeCloseTo(toWorld(start, m).y);
  });
  it("translates by the midpoint's movement", () => {
    const c = pinch(start, a0, b0, { x: 130, y: 60 }, { x: 230, y: 60 }, LIMITS);
    expect(c).toEqual({ x: 40, y: -20, scale: 1 });
  });
  it("clamps the scale", () => {
    expect(pinch(start, a0, b0, { x: 0, y: 100 }, { x: 1000, y: 100 }, LIMITS).scale).toBe(MAX_SCALE);
  });
});

describe("keepInView", () => {
  it("leaves a camera alone when the content is on screen", () => {
    const c: Camera = { x: 200, y: 150, scale: 1 };
    expect(keepInView(c, SMALL, VP)).toEqual(c);
  });
  it("keeps KEEP px of the content on screen on each axis", () => {
    const right = keepInView({ x: 5000, y: 150, scale: 1 }, WIDE, VP);
    expect(toScreen(right, { x: WIDE.x, y: 0 }).x).toBeCloseTo(VP.width - KEEP);
    const up = keepInView({ x: 0, y: -5000, scale: 1 }, WIDE, VP);
    expect(toScreen(up, { x: 0, y: WIDE.y + WIDE.height }).y).toBeCloseTo(KEEP);
  });
  it("keeps all of content smaller than KEEP on screen", () => {
    const tiny: Bounds = { x: 0, y: 0, width: 20, height: 20 };
    const c = keepInView({ x: -1000, y: 1000, scale: 1 }, tiny, VP);
    expect(toScreen(c, { x: 0, y: 0 }).x).toBeCloseTo(0);
    expect(toScreen(c, { x: 0, y: 0 }).y).toBeCloseTo(VP.height - 20);
  });
});

describe("follow", () => {
  const following: FollowState = { camera: fit(WIDE, VP), follow: true };
  const moved: Camera = { x: 50, y: 60, scale: 1.5 };
  const noShift = { x: 0, y: 0 };
  it("re-fits while following when the world changes", () => {
    expect(followStep(following, { kind: "world", shift: noShift }, SMALL, VP)).toEqual({ camera: fit(SMALL, VP), follow: true });
  });
  it("turns follow off on a user move, keeping the moved camera in view", () => {
    const s = followStep(following, { kind: "user", camera: moved }, WIDE, VP);
    expect(s).toEqual({ camera: keepInView(moved, WIDE, VP), follow: false });
  });
  it("only keeps the camera in view when the world changes after a user move", () => {
    const s = followStep({ camera: moved, follow: false }, { kind: "world", shift: noShift }, SMALL, VP);
    expect(s).toEqual({ camera: keepInView(moved, SMALL, VP), follow: false });
  });
  it("re-fits only while following when the viewport resizes", () => {
    const wide: Viewport = { width: 800, height: 300 };
    expect(followStep(following, { kind: "world", shift: noShift }, WIDE, wide)).toEqual({ camera: fit(WIDE, wide), follow: true });
    expect(followStep({ camera: moved, follow: false }, { kind: "world", shift: noShift }, WIDE, wide).camera).toEqual(keepInView(moved, WIDE, wide));
  });
  it("turns follow back on and re-fits on Fit and on a mode switch", () => {
    for (const kind of ["fit", "mode"] as const) expect(followStep({ camera: moved, follow: false }, { kind }, WIDE, VP)).toEqual({ camera: fit(WIDE, VP), follow: true });
  });
  it("leaves follow alone on a replay jump", () => {
    expect(followStep(following, { kind: "jump", shift: noShift }, SMALL, VP).follow).toBe(true);
    expect(followStep({ camera: moved, follow: false }, { kind: "jump", shift: noShift }, SMALL, VP).follow).toBe(false);
  });
});

// Final review #2: the world's origin moves under a held camera as normalise's shift changes
// (e.g. live evidence arriving). A camera that isn't following should keep the same world point
// under it, not slide by the shift × scale.
describe("origin shift (final review #2)", () => {
  const HUGE: Viewport = { width: 5000, height: 5000 };
  it("keeps the same world point on screen across a world event's origin change, while not following", () => {
    const camera: Camera = { x: 0, y: 0, scale: 1 };
    const shift = { x: 30, y: -10 };
    const after = followStep({ camera, follow: false }, { kind: "world", shift }, WIDE, HUGE);
    expect(after.follow).toBe(false);
    const point = { x: 10, y: 10 };
    // The same physical point now sits at `point + shift` in the new world frame; its screen
    // position should be unchanged from where it was before the shift.
    expect(toScreen(after.camera, { x: point.x + shift.x, y: point.y + shift.y })).toEqual(toScreen(camera, point));
  });
  it("keeps the same world point on screen across a jump's origin change, while not following", () => {
    const camera: Camera = { x: 20, y: -15, scale: 2 };
    const shift = { x: -40, y: 20 };
    const after = followStep({ camera, follow: false }, { kind: "jump", shift }, WIDE, HUGE);
    expect(after.follow).toBe(false);
    const point = { x: -5, y: 5 };
    expect(toScreen(after.camera, { x: point.x + shift.x, y: point.y + shift.y })).toEqual(toScreen(camera, point));
  });
  it("still re-fits on a world or jump event while following, ignoring the shift", () => {
    const following: FollowState = { camera: fit(WIDE, VP), follow: true };
    const shift = { x: 100, y: -50 };
    expect(followStep(following, { kind: "world", shift }, SMALL, VP)).toEqual({ camera: fit(SMALL, VP), follow: true });
    expect(followStep(following, { kind: "jump", shift }, SMALL, VP)).toEqual({ camera: fit(SMALL, VP), follow: true });
  });
});

describe("gestureMove", () => {
  const cam: Camera = { x: 0, y: 0, scale: 1 };
  it("starts a pan on the first touch, then pans from the camera at grant time", () => {
    const g = gestureMove(null, [{ x: 10, y: 10 }], cam, LIMITS);
    expect(g.camera).toBe(cam);
    expect(gestureMove(g.gesture, [{ x: 40, y: 0 }], { x: 999, y: 999, scale: 1 }, LIMITS).camera).toEqual({ x: 30, y: -10, scale: 1 });
  });
  it("starts a pinch when a second finger lands, and pinches from there", () => {
    const one = gestureMove(null, [{ x: 100, y: 100 }], cam, LIMITS);
    const two = gestureMove(one.gesture, [{ x: 100, y: 100 }, { x: 200, y: 100 }], { x: 5, y: 0, scale: 1 }, LIMITS);
    expect(two.gesture?.kind).toBe("pinch");
    expect(two.camera).toEqual({ x: 5, y: 0, scale: 1 });
    expect(gestureMove(two.gesture, [{ x: 50, y: 100 }, { x: 250, y: 100 }], two.camera, LIMITS).camera.scale).toBeCloseTo(2);
  });
  it("re-bases a fresh pan from the current camera when going back to one finger", () => {
    const pinching = gestureMove(null, [{ x: 100, y: 100 }, { x: 200, y: 100 }], cam, LIMITS);
    const current: Camera = { x: -20, y: 7, scale: 1.6 };
    const back = gestureMove(pinching.gesture, [{ x: 200, y: 100 }], current, LIMITS);
    expect(back.gesture).toEqual({ kind: "pan", start: current, from: { x: 200, y: 100 } });
    expect(gestureMove(back.gesture, [{ x: 210, y: 100 }], current, LIMITS).camera).toEqual({ x: -10, y: 7, scale: 1.6 });
  });
  it("ends the gesture when no touches remain", () => {
    expect(gestureMove({ kind: "pan", start: cam, from: { x: 0, y: 0 } }, [], cam, LIMITS)).toEqual({ gesture: null, camera: cam });
  });
});

describe("viewEvent", () => {
  const key = (over: Partial<ViewKey> = {}): ViewKey => ({ bounds: WIDE, viewport: VP, mode: "live", chosen: false, jump: 0, origin: { x: 0, y: 0 }, ...over });
  it("fits on the first layout", () => {
    expect(viewEvent(null, key())).toEqual({ kind: "mode" });
  });
  it("does nothing when nothing changed", () => {
    expect(viewEvent(key(), key({ bounds: { ...WIDE } }))).toBeNull();
  });
  it("treats new bounds and a resize as a change of world", () => {
    expect(viewEvent(key(), key({ bounds: SMALL }))).toEqual({ kind: "world", shift: { x: 0, y: 0 } });
    expect(viewEvent(key(), key({ viewport: { width: 500, height: 300 } }))).toEqual({ kind: "world", shift: { x: 0, y: 0 } });
  });
  it("re-fits on Map ↔ Tracks only", () => {
    expect(viewEvent(key({ mode: "map", chosen: true }), key({ mode: "tracks", chosen: true }))).toEqual({ kind: "mode" });
  });
  it("snaps on a jump, even when the bounds changed with it", () => {
    expect(viewEvent(key(), key({ jump: 1, bounds: SMALL }))).toEqual({ kind: "jump", shift: { x: 0, y: 0 } });
  });
  // Review Focus 1: the outcome arriving while the user has panned away.
  it("treats the outcome replacing the live ring as a change of world, so a user's camera stays theirs", () => {
    const event = viewEvent(key(), key({ mode: "map", chosen: true, bounds: SMALL }));
    expect(event).toEqual({ kind: "world", shift: { x: 0, y: 0 } });
    const moved: Camera = { x: 50, y: 60, scale: 1.5 };
    expect(followStep({ camera: moved, follow: false }, event!, SMALL, VP).follow).toBe(false);
  });
  // Final review #2: the world's origin moving under a held camera (normalise's shift changes as
  // live evidence arrives). A world event carries that shift even when bounds' width/height don't.
  it("carries the origin's change as `shift`, and fires a world event even when only the origin moved", () => {
    expect(viewEvent(key({ origin: { x: 10, y: 5 } }), key({ origin: { x: 40, y: -5 } }))).toEqual({ kind: "world", shift: { x: 30, y: -10 } });
  });
  it("carries the origin's change on a jump too", () => {
    expect(viewEvent(key({ origin: { x: 10, y: 5 } }), key({ jump: 1, origin: { x: 40, y: -5 } }))).toEqual({ kind: "jump", shift: { x: 30, y: -10 } });
  });
});

describe("degenerate input", () => {
  const finite = (c: Camera) => Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.scale) && c.scale > 0;
  // Review Focus 2: a side panel squeezed narrower than the padding.
  it("keeps a finite, positive camera in a viewport smaller than the padding", () => {
    const tiny: Viewport = { width: 20, height: 10 };
    const c = fit(WIDE, tiny);
    expect(finite(c)).toBe(true);
    expect(scaleLimits(WIDE, tiny).min).toBeLessThanOrEqual(c.scale);
    expect(finite(keepInView({ x: 1e6, y: -1e6, scale: c.scale }, WIDE, tiny))).toBe(true);
  });
  // Review Focus 3: two fingers landing on the same point.
  it("pinches without NaN when both fingers start on the same point", () => {
    const p = { x: 100, y: 100 };
    const start: Camera = { x: 0, y: 0, scale: 1 };
    expect(finite(pinch(start, p, p, { x: 90, y: 100 }, { x: 130, y: 100 }, LIMITS))).toBe(true);
    const g = gestureMove(null, [p, p], start, LIMITS);
    expect(finite(gestureMove(g.gesture, [{ x: 80, y: 100 }, { x: 140, y: 100 }], g.camera, LIMITS).camera)).toBe(true);
  });
});
