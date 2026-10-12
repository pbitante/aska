import { describe, expect, it, vi } from "vitest";
import {
  idleSettle,
  rebasePage,
  settleLand,
  settleStart,
  settleTimeout,
  STOP_ANIMATION_CALLBACKS,
  type SettleState,
} from "../../client/logic/flow/viewport";
import type { Gesture } from "../../client/logic/flow/camera";

describe("rebasePage", () => {
  const PAN: Gesture = { kind: "pan", start: { x: 0, y: 0, scale: 1 }, from: { x: 1, y: 1 } };
  it("keeps the gesture when the measured offset matches the current one", () => {
    expect(rebasePage({ x: 10, y: 20 }, { x: 10, y: 20 }, PAN)).toEqual({ page: { x: 10, y: 20 }, gesture: PAN });
  });
  it("drops the gesture when the measured offset moved", () => {
    expect(rebasePage({ x: 10, y: 20 }, { x: 10, y: 35 }, PAN)).toEqual({ page: { x: 10, y: 35 }, gesture: null });
  });
  it("leaves a null gesture null either way", () => {
    expect(rebasePage({ x: 0, y: 0 }, { x: 5, y: 5 }, null).gesture).toBeNull();
    expect(rebasePage({ x: 5, y: 5 }, { x: 5, y: 5 }, null).gesture).toBeNull();
  });
});

describe("settleStart", () => {
  it("runs the call now when nothing is fitting", () => {
    const then = vi.fn();
    const r = settleStart(idleSettle, false, 0, then);
    expect(r.begin).toBe(false);
    expect(r.run).toEqual([then]);
    expect(r.state).toBe(idleSettle);
  });
  it("begins a wait when a fit is running, counting the three stopAnimation callbacks", () => {
    const then = vi.fn();
    const r = settleStart(idleSettle, true, 7, then);
    expect(r.begin).toBe(true);
    expect(r.run).toEqual([]);
    expect(r.state.settling).toBe(true);
    expect(r.state.epoch).toBe(7);
    expect(r.state.remaining).toBe(STOP_ANIMATION_CALLBACKS);
    expect(r.state.session).toBe(idleSettle.session + 1);
  });
  it("queues a call that arrives while a wait is already running, instead of running it early", () => {
    const first = vi.fn();
    const second = vi.fn();
    const begun = settleStart(idleSettle, true, 0, first).state;
    const r = settleStart(begun, true, 0, second);
    expect(r.begin).toBe(false);
    expect(r.run).toEqual([]);
    expect(r.state.queue).toEqual([second]);
    expect(second).not.toHaveBeenCalled();
  });
});

describe("settleLand", () => {
  it("waits for all three callbacks before finishing", () => {
    const then = vi.fn();
    const begun = settleStart(idleSettle, true, 0, then).state;
    const session = begun.session;
    const after1 = settleLand(begun, session, 0, false);
    expect(after1.run).toEqual([]);
    const after2 = settleLand(after1.state, session, 0, false);
    expect(after2.run).toEqual([]);
    const after3 = settleLand(after2.state, session, 0, false);
    expect(after3.run).toEqual([then]);
    expect(after3.apply).toBe(true);
    expect(after3.reWait).toBe(false);
    expect(after3.state.settling).toBe(false);
  });
  it("runs the action that started the wait before the queued ones, in order", () => {
    const action = vi.fn();
    const queuedA = vi.fn();
    const queuedB = vi.fn();
    let state = settleStart(idleSettle, true, 0, action).state;
    state = settleStart(state, true, 0, queuedA).state;
    state = settleStart(state, true, 0, queuedB).state;
    const session = state.session;
    state = settleLand(state, session, 0, false).state;
    state = settleLand(state, session, 0, false).state;
    const last = settleLand(state, session, 0, false);
    expect(last.run).toEqual([action, queuedA, queuedB]);
  });
  // A jump committed directly mid-wait (no animation: `fitting` is false). The stopped camera is
  // stale, but since nothing is animating, state.current.camera already holds the jump's target —
  // safe to run the action/queue against it right away.
  it("discards the stopped camera, but still runs the action right away, when a jump committed mid-wait with no animation running", () => {
    const then = vi.fn();
    const begun = settleStart(idleSettle, true, 5, then).state;
    const session = begun.session;
    let state = begun;
    state = settleLand(state, session, 5, false).state;
    state = settleLand(state, session, 5, false).state;
    const landed = settleLand(state, session, 6, false);
    expect(landed.apply).toBe(false);
    expect(landed.reWait).toBe(false);
    expect(landed.run).toEqual([then]);
  });
  // The tester's edge case: a Fit press or a follow re-fit committed mid-wait and started a new
  // animation (`fitting` is true). Running the action/queue immediately would read the new fit's
  // *target*, not what's on screen — the jump settle() exists to prevent. `reWait` tells the wiring
  // to re-submit `run` through settle() instead, so the first one starts a wait on the new
  // animation and the camera it finally runs against is the one actually on screen.
  it("discards the stopped camera and asks to re-wait, when a Fit press or a follow re-fit started a new animation mid-wait", () => {
    const then = vi.fn();
    const begun = settleStart(idleSettle, true, 5, then).state;
    const session = begun.session;
    let state = begun;
    state = settleLand(state, session, 5, false).state;
    state = settleLand(state, session, 5, false).state;
    const landed = settleLand(state, session, 6, true);
    expect(landed.apply).toBe(false);
    expect(landed.reWait).toBe(true);
    expect(landed.run).toEqual([then]);
  });
  it("ignores a callback when nothing is settling", () => {
    const stale = settleLand(idleSettle, idleSettle.session, 0, false);
    expect(stale.run).toEqual([]);
    expect(stale.apply).toBe(false);
    expect(stale.reWait).toBe(false);
    expect(stale.state).toBe(idleSettle);
  });
  it("ignores a callback that belongs to a wait already finished or timed out", () => {
    const then = vi.fn();
    const begun = settleStart(idleSettle, true, 0, then).state;
    const staleSession = begun.session;
    const timedOut = settleTimeout(begun, false).state;
    // A new wait starts before the first wait's late callback arrives.
    const fresh = settleStart(timedOut, true, 0, vi.fn()).state;
    const stale = settleLand(fresh, staleSession, 0, false);
    expect(stale.run).toEqual([]);
    expect(stale.state).toBe(fresh);
  });
});

describe("settleTimeout", () => {
  it("does nothing when nothing is settling", () => {
    const r = settleTimeout(idleSettle, false);
    expect(r.timedOut).toBe(false);
    expect(r.run).toEqual([]);
    expect(r.reWait).toBe(false);
    expect(r.state).toBe(idleSettle);
  });
  it("clears settling and runs the action/queue from the last known camera when the wait times out with nothing animating", () => {
    const action = vi.fn();
    const queued = vi.fn();
    let state = settleStart(idleSettle, true, 0, action).state;
    state = settleStart(state, true, 0, queued).state;
    const r = settleTimeout(state, false);
    expect(r.timedOut).toBe(true);
    expect(r.reWait).toBe(false);
    expect(r.run).toEqual([action, queued]);
    expect(r.state.settling).toBe(false);
    expect(r.state.queue).toEqual([]);
  });
  // Same hazard as settleLand's: if a Fit press or a follow re-fit started a new animation before
  // the timeout fired, the mirror camera is that fit's target, not what's on screen. `reWait` asks
  // the wiring to re-submit the action/queue through settle() rather than run them against it.
  it("asks to re-wait, instead of running against the mirror, when a fit is now running", () => {
    const action = vi.fn();
    const queued = vi.fn();
    let state = settleStart(idleSettle, true, 0, action).state;
    state = settleStart(state, true, 0, queued).state;
    const r = settleTimeout(state, true);
    expect(r.timedOut).toBe(true);
    expect(r.reWait).toBe(true);
    expect(r.run).toEqual([action, queued]);
  });
  it("is a no-op the second time, so a late callback after the timeout can't run the action twice", () => {
    const action = vi.fn();
    const state = settleStart(idleSettle, true, 0, action).state;
    const first = settleTimeout(state, false);
    const second = settleTimeout(first.state, false);
    expect(second.timedOut).toBe(false);
    expect(second.run).toEqual([]);
  });
});

describe("idleSettle", () => {
  it("starts idle, empty, at session 0", () => {
    const s: SettleState = idleSettle;
    expect(s).toEqual({ settling: false, session: 0, epoch: 0, remaining: 0, action: null, queue: [] });
  });
});
