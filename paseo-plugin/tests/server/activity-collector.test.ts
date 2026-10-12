import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ActivityCollector, type ActivityEvents } from "../../server/activity/collector";

const fx = JSON.parse(readFileSync(join(__dirname, "../fixtures/activity/events.json"), "utf8")) as { parentAgentId: string; explore: unknown[]; guardian: unknown[] };

type Observer = { snapshot(s: unknown): void; update(m: unknown): void; error?(e: unknown): void };

function fakePaseo(opts: { fail?: boolean; hang?: boolean } = {}) {
  const observers: Observer[] = [];
  let calls = 0;
  let released = 0;
  const paseo: ActivityEvents = {
    observeEvents() {
      calls++;
      return {
        ready: opts.hang ? new Promise(() => {}) : opts.fail ? Promise.reject(new Error("no events for you")) : Promise.resolve({}),
        subscribe(o: Observer) {
          observers.push(o);
          return () => {};
        },
        release: async () => {
          released++;
        },
      };
    },
  };
  return { paseo, emit: (m: unknown) => observers.forEach((o) => o.update(m)), fail: (e: unknown) => observers.forEach((o) => o.error?.(e)), calls: () => calls, released: () => released };
}

const make = () => {
  const logs: string[] = [];
  const c = new ActivityCollector({ now: () => Date.parse("2026-10-10T20:00:00.000Z"), log: (m) => logs.push(m), epoch: "ep" });
  return { c, logs };
};

describe("ActivityCollector", () => {
  it("subscribes once and serves replayed events through read()", async () => {
    const { c } = make();
    const f = fakePaseo();
    await c.ensure(f.paseo);
    await c.ensure(f.paseo);
    expect(f.calls()).toBe(1);
    for (const m of [...fx.explore, ...fx.guardian]) f.emit(m);
    const r = c.read(fx.parentAgentId);
    expect(r.epoch).toBe("ep");
    expect(r.subagents).toHaveLength(2);
    expect(r.watchingSince).toBe("2026-10-10T20:00:00.000Z");
  });

  it("logs once and retries on the next ensure when the subscription fails", async () => {
    const { c, logs } = make();
    const bad = fakePaseo({ fail: true });
    await c.ensure(bad.paseo);
    await c.ensure(bad.paseo);
    expect(bad.calls()).toBe(2);
    expect(logs.filter((l) => l.includes("no events for you"))).toHaveLength(1);
    expect(c.read("x").complete).toBe(false);
    const good = fakePaseo();
    await c.ensure(good.paseo);
    expect(c.state.up).toBe(true);
  });

  it("marks itself down on a subscription error, and the next ensure releases the old subscription and resubscribes", async () => {
    const { c } = make();
    const f = fakePaseo();
    await c.ensure(f.paseo);
    f.fail(new Error("dropped"));
    expect(c.state.up).toBe(false);
    await c.ensure(f.paseo);
    expect(f.calls()).toBe(2);
    expect(f.released()).toBe(1);
    expect(c.state.up).toBe(true);
  });

  it("logs the first malformed payload only", async () => {
    const { c, logs } = make();
    const f = fakePaseo();
    await c.ensure(f.paseo);
    f.emit({ type: "agent.provider_subagents.update", payload: { kind: "timeline" } });
    f.emit({ type: "agent.provider_subagents.update", payload: { kind: "timeline" } });
    expect(logs.filter((l) => l.includes("unexpected sub-agent event"))).toHaveLength(1);
  });

  it("drops an archived agent's activity", async () => {
    const { c } = make();
    const f = fakePaseo();
    await c.ensure(f.paseo);
    for (const m of fx.guardian) f.emit(m);
    c.drop(fx.parentAgentId);
    expect(c.read(fx.parentAgentId).subagents).toEqual([]);
  });

  it("releases its subscription on dispose and doesn't resubscribe afterwards", async () => {
    const { c } = make();
    const f = fakePaseo();
    await c.ensure(f.paseo);
    await c.dispose();
    expect(f.released()).toBe(1);
    expect(c.state.up).toBe(false);
    await c.ensure(f.paseo);
    expect(f.calls()).toBe(1);
  });

  it("releases a subscription that was still opening when dispose was called", async () => {
    const { c } = make();
    const f = fakePaseo();
    const opening = c.ensure(f.paseo);
    await c.dispose();
    await opening;
    expect(f.released()).toBe(1);
    expect(c.state.up).toBe(false);
  });

  it("doesn't hang on dispose when the stream never becomes ready", async () => {
    const { c } = make();
    const f = fakePaseo({ hang: true });
    void c.ensure(f.paseo);
    await c.dispose();
    expect(f.released()).toBe(1);
    expect(c.state.up).toBe(false);
  });
});
