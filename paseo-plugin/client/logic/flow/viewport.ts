// Pure helpers behind FlowViewport's two trickiest bits: re-basing a gesture when a late
// `measure()` lands, and `settle()`'s queue of calls waiting on a running fit to stop. Kept pure so
// both can be unit-tested without Animated, a real gesture, or a timer.

import type { Gesture, XY } from "./camera";

export const SETTLE_TIMEOUT_MS = 250;
// tx, ty and sc each get their own `stopAnimation` callback (FlowViewport.tsx's three calls).
export const STOP_ANIMATION_CALLBACKS = 3;

// `measure()` resolves after a gesture may already have started from a stale page offset (e.g. the
// panel holding the Flow scrolled mid-gesture). When the freshly measured offset differs from the
// one the gesture started from, drop the gesture so the next move re-bases from the current camera
// instead of jumping by the offset's change.
export function rebasePage(current: XY, measured: XY, gesture: Gesture): { page: XY; gesture: Gesture } {
  const moved = measured.x !== current.x || measured.y !== current.y;
  return { page: measured, gesture: moved ? null : gesture };
}

export type SettleAction = () => void;

// `settle(then)`'s state: idle, or waiting on a stopped fit's three `stopAnimation` callbacks.
// `session` tags each wait so a late callback belonging to a wait that already finished or timed
// out is ignored, even once a new wait has started. `epoch` is the commit count when the wait
// began, so a commit landing mid-wait (a Fit press, a follow re-fit, a jump) is detected and its
// camera isn't overwritten by the stale stopped values once they land.
export interface SettleState {
  readonly settling: boolean;
  readonly session: number;
  readonly epoch: number;
  readonly remaining: number;
  readonly action: SettleAction | null;
  readonly queue: readonly SettleAction[];
}

export const idleSettle: SettleState = { settling: false, session: 0, epoch: 0, remaining: 0, action: null, queue: [] };

function drained(state: SettleState): SettleState {
  return { ...state, settling: false, remaining: 0, action: null, queue: [] };
}

function actionsOf(state: SettleState): SettleAction[] {
  return [state.action, ...state.queue].filter((a): a is SettleAction => a !== null);
}

export interface SettleStartResult {
  state: SettleState;
  run: readonly SettleAction[];
  begin: boolean;
}

// Runs `then` now when nothing is fitting; queues it behind a wait already running, so it can't run
// early against a camera the running wait would otherwise overwrite; otherwise starts a new wait
// (the caller stops the animation and registers its three callbacks with `settleLand`).
export function settleStart(state: SettleState, fitting: boolean, epoch: number, then: SettleAction): SettleStartResult {
  if (state.settling) return { state: { ...state, queue: [...state.queue, then] }, run: [], begin: false };
  if (!fitting) return { state, run: [then], begin: false };
  return { state: { settling: true, session: state.session + 1, epoch, remaining: STOP_ANIMATION_CALLBACKS, action: then, queue: [] }, run: [], begin: true };
}

export interface SettleLandResult {
  state: SettleState;
  apply: boolean;
  reWait: boolean;
  run: readonly SettleAction[];
}

// One of the three `stopAnimation` callbacks landed. Ignored (an empty `run`) when it belongs to a
// wait that already finished or timed out. Once all three have landed, `apply` says whether the
// stopped camera is still current — false when a commit ran mid-wait. When that commit didn't
// animate (a jump, or a world event while not following), `state.current.camera` already holds its
// target, so the caller can run `action`/`queue` against it right away. When it did animate (a Fit
// press or a follow re-fit, reported via `fitting`), that target is mid-flight, not on screen; the
// caller must not read it, so `reWait` says to re-submit `action`/`queue` through `settle()` instead
// — the first re-starts a wait on the new animation, and the rest queue behind it.
export function settleLand(state: SettleState, session: number, currentEpoch: number, fitting: boolean): SettleLandResult {
  if (!state.settling || session !== state.session) return { state, apply: false, reWait: false, run: [] };
  if (state.remaining > 1) return { state: { ...state, remaining: state.remaining - 1 }, apply: false, reWait: false, run: [] };
  const apply = currentEpoch === state.epoch;
  return { state: drained(state), apply, reWait: !apply && fitting, run: actionsOf(state) };
}

export interface SettleTimeoutResult {
  state: SettleState;
  reWait: boolean;
  run: readonly SettleAction[];
  timedOut: boolean;
}

// The ~250ms fallback, fired from a `setTimeout`: if the callbacks haven't all landed, stop waiting
// and run `action`/`queue` against the last known camera (the mirror) instead of hanging forever. A
// no-op if the wait already finished or timed out (the timer fired after `settleLand` or a previous
// timeout already drained it). Same hazard as `settleLand`'s: if a Fit press or a follow re-fit
// started a new animation before the timer fired (`fitting`), the mirror is that fit's target, not
// what's on screen — `reWait` asks the caller to re-submit `action`/`queue` through `settle()`
// instead of running them directly.
export function settleTimeout(state: SettleState, fitting: boolean): SettleTimeoutResult {
  if (!state.settling) return { state, reWait: false, run: [], timedOut: false };
  return { state: drained(state), reWait: fitting, run: actionsOf(state), timedOut: true };
}
