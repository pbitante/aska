// The Flow's camera: screen = world × scale + (x, y). Pure, so the viewport's gestures and its
// follow rule can be tested without rendering.

export interface Camera {
  x: number;
  y: number;
  scale: number;
}
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Viewport {
  width: number;
  height: number;
}
export interface XY {
  x: number;
  y: number;
}
export interface Limits {
  min: number;
  max: number;
}
export interface FollowState {
  camera: Camera;
  follow: boolean;
}
// "world": the layout or the viewport changed, carrying the world's origin shift (normalise's
// dx/dy) since the last fit. "user": a pan, pinch, wheel zoom or −/+ press, with the camera it
// produced. "fit": the Fit button. "mode": Map ↔ Tracks. "jump": a replay jump, also carrying the
// origin shift.
export type FollowEvent = { kind: "world"; shift: XY } | { kind: "user"; camera: Camera } | { kind: "fit" } | { kind: "mode" } | { kind: "jump"; shift: XY };
// What the viewport last fitted against. `chosen` is true for the modes the user picks (Map, Tracks).
// `origin` is the layout's normalise shift, so a world or jump event can tell how far it moved.
export interface ViewKey {
  bounds: Bounds;
  viewport: Viewport;
  mode: string;
  chosen: boolean;
  jump: number;
  origin: XY;
}
export type Gesture = { kind: "pan"; start: Camera; from: XY } | { kind: "pinch"; start: Camera; a0: XY; b0: XY } | null;

export const FIT_PAD = 16;
export const KEEP = 48;
export const MIN_SCALE = 0.5;
export const MAX_SCALE = 2.5;
export const ZOOM_STEP = 1.25;
export const SLOP = 4;
export const CAPTION_MIN_SCALE = 0.6;

const clamp = (v: number, lo: number, hi: number): number => (hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));

// The scale that shows all of `bounds` inside the padded viewport, never above 1:1.
export function fitScale(bounds: Bounds, viewport: Viewport): number {
  const w = Math.max(1, viewport.width - 2 * FIT_PAD);
  const h = Math.max(1, viewport.height - 2 * FIT_PAD);
  const sx = bounds.width > 0 ? w / bounds.width : 1;
  const sy = bounds.height > 0 ? h / bounds.height : 1;
  return Math.min(sx, sy, 1);
}

export function fit(bounds: Bounds, viewport: Viewport): Camera {
  const scale = fitScale(bounds, viewport);
  return {
    x: viewport.width / 2 - (bounds.x + bounds.width / 2) * scale,
    y: viewport.height / 2 - (bounds.y + bounds.height / 2) * scale,
    scale,
  };
}

// The floor is never above the fit scale, so the whole run is always reachable.
export function scaleLimits(bounds: Bounds, viewport: Viewport): Limits {
  return { min: Math.min(fitScale(bounds, viewport), MIN_SCALE), max: MAX_SCALE };
}

// ctrl/⌘ + wheel: deltaY in pixels (deltaMode 0), lines (1) or pages (2). A trackpad pinch sends
// small pixel deltas, which keep exp(−px × WHEEL_GAIN); a mouse notch (~100 px, or 3 lines) is
// clamped to one ZOOM_STEP, like the + and − buttons.
export const WHEEL_GAIN = 0.01;
export const WHEEL_LINE_PX = 16;

export function wheelFactor(deltaY: number, deltaMode: number, pageHeight: number): number {
  const px = deltaY * (deltaMode === 1 ? WHEEL_LINE_PX : deltaMode === 2 ? pageHeight : 1);
  if (!Number.isFinite(px)) return 1;
  return clamp(Math.exp(-px * WHEEL_GAIN), 1 / ZOOM_STEP, ZOOM_STEP);
}

// Scales about a screen point, keeping the world point under it fixed.
export function zoomAt(cam: Camera, factor: number, point: XY, limits: Limits): Camera {
  const scale = clamp(cam.scale * factor, limits.min, limits.max);
  const wx = (point.x - cam.x) / cam.scale;
  const wy = (point.y - cam.y) / cam.scale;
  return { x: point.x - wx * scale, y: point.y - wy * scale, scale };
}

export const pan = (cam: Camera, dx: number, dy: number): Camera => ({ x: cam.x + dx, y: cam.y + dy, scale: cam.scale });

const mid = (a: XY, b: XY): XY => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// From the camera and the two points when the second finger landed (a0, b0) to the current points
// (a1, b1): scales about the starting midpoint, then follows the midpoint.
export function pinch(start: Camera, a0: XY, b0: XY, a1: XY, b1: XY, limits: Limits): Camera {
  const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y);
  const d1 = Math.hypot(a1.x - b1.x, a1.y - b1.y);
  const m0 = mid(a0, b0);
  const m1 = mid(a1, b1);
  if (d0 === d1 && m0.x === m1.x && m0.y === m1.y) return start;
  const zoomed = zoomAt(start, d0 > 0 ? d1 / d0 : 1, m0, limits);
  return pan(zoomed, m1.x - m0.x, m1.y - m0.y);
}

// On each axis, keeps at least min(KEEP, content size) of the content on screen.
export function keepInView(cam: Camera, bounds: Bounds, viewport: Viewport): Camera {
  const axis = (t: number, lo: number, size: number, view: number): number => {
    const keep = Math.min(KEEP, size * cam.scale);
    return clamp(t, keep - (lo + size) * cam.scale, view - keep - lo * cam.scale);
  };
  return { x: axis(cam.x, bounds.x, bounds.width, viewport.width), y: axis(cam.y, bounds.y, bounds.height, viewport.height), scale: cam.scale };
}

// Fit, then follow until the user touches it; Fit (or a mode switch) hands control back. A world
// or jump event while not following pans by the origin's change × scale first, so a physical point
// stays under the held camera instead of sliding as normalise's shift moves it.
export function followStep(state: FollowState, event: FollowEvent, bounds: Bounds, viewport: Viewport): FollowState {
  if (event.kind === "fit" || event.kind === "mode") return { camera: fit(bounds, viewport), follow: true };
  if (event.kind === "user") return { camera: keepInView(event.camera, bounds, viewport), follow: false };
  if (state.follow) return { camera: fit(bounds, viewport), follow: true };
  const held = pan(state.camera, -event.shift.x * state.camera.scale, -event.shift.y * state.camera.scale);
  return { camera: keepInView(held, bounds, viewport), follow: false };
}

const sameBox = (a: Bounds, b: Bounds): boolean => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

// What changed since the viewport's last fit, as a follow event, or null for nothing. Only a switch
// between two chosen modes (Map ↔ Tracks) is a mode switch; any other mode change, such as the
// outcome replacing the live ring, is a change of world. A jump wins over a world change.
export function viewEvent(prev: ViewKey | null, next: ViewKey): FollowEvent | null {
  if (prev === null) return { kind: "mode" };
  if (prev.mode !== next.mode && prev.chosen && next.chosen) return { kind: "mode" };
  const shift: XY = { x: next.origin.x - prev.origin.x, y: next.origin.y - prev.origin.y };
  if (prev.jump !== next.jump) return { kind: "jump", shift };
  const resized = prev.viewport.width !== next.viewport.width || prev.viewport.height !== next.viewport.height;
  const originMoved = shift.x !== 0 || shift.y !== 0;
  if (prev.mode !== next.mode || resized || originMoved || !sameBox(prev.bounds, next.bounds)) return { kind: "world", shift };
  return null;
}

// One step of a drag or pinch. A change in the number of touches starts (or re-bases) the gesture
// from the current camera, so going from two fingers to one carries on as a fresh pan.
export function gestureMove(gesture: Gesture, touches: readonly XY[], cam: Camera, limits: Limits): { gesture: Gesture; camera: Camera } {
  const [a, b] = touches;
  if (a === undefined) return { gesture: null, camera: cam };
  if (b !== undefined) {
    if (gesture?.kind !== "pinch") return { gesture: { kind: "pinch", start: cam, a0: a, b0: b }, camera: cam };
    return { gesture, camera: pinch(gesture.start, gesture.a0, gesture.b0, a, b, limits) };
  }
  if (gesture?.kind !== "pan") return { gesture: { kind: "pan", start: cam, from: a }, camera: cam };
  return { gesture, camera: pan(gesture.start, a.x - gesture.from.x, a.y - gesture.from.y) };
}
