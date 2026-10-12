import { describe, expect, it } from "vitest";
import { followAgents, type AgentFeed } from "../../client/logic/agentFeed";
import type { AgentSeen, RunPills } from "../../client/logic/runPills";

type Observer = { snapshot(s: unknown): void; update(m: unknown): void; error?(e: unknown): void };

function fakeFeed(opts: { fail?: boolean } = {}) {
  let observer: Observer | null = null;
  let signal: AbortSignal | undefined;
  const feed: AgentFeed = {
    agents: {
      list: async (o) => {
        signal = o.signal;
        if (opts.fail) throw new Error("offline");
        return { subscription: { subscribe: (ob: Observer) => ((observer = ob), () => {}) } };
      },
    },
  };
  return { feed, observer: () => observer!, signal: () => signal };
}

function fakePills() {
  const calls: unknown[][] = [];
  const pills: RunPills = {
    show: () => {},
    sync: (agents: readonly AgentSeen[]) => void calls.push(["sync", agents.map((a) => a.id)]),
    upsert: (a: AgentSeen) => void calls.push(["upsert", a.id]),
    drop: (id: string) => void calls.push(["drop", id]),
    dispose: () => {},
  };
  return { pills, calls };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("followAgents", () => {
  it("syncs the pills on every snapshot and passes agent upserts and removals on", async () => {
    const f = fakeFeed();
    const p = fakePills();
    followAgents(f.feed, p.pills, () => {});
    await tick();
    f.observer().snapshot({ entries: [{ agent: { id: "a1", workspaceId: "w1" } }] });
    f.observer().update({ type: "agent_update", payload: { kind: "upsert", agent: { id: "a2", workspaceId: "w1" } } });
    f.observer().update({ type: "agent_update", payload: { kind: "remove", agentId: "a1" } });
    f.observer().update({ type: "something_else", payload: {} });
    f.observer().snapshot({ entries: [{ agent: { id: "a2", workspaceId: "w1" } }] });
    expect(p.calls).toEqual([["sync", ["a1"]], ["upsert", "a2"], ["drop", "a1"], ["sync", ["a2"]]]);
  });

  it("aborts the subscription when stopped", async () => {
    const f = fakeFeed();
    const stop = followAgents(f.feed, fakePills().pills, () => {});
    await tick();
    stop();
    expect(f.signal()?.aborted).toBe(true);
  });

  it("logs a failed subscription instead of throwing, but not one aborted by stop", async () => {
    const logs: string[] = [];
    followAgents(fakeFeed({ fail: true }).feed, fakePills().pills, (m) => logs.push(m));
    await tick();
    expect(logs).toEqual(["aska-editor: couldn't follow agents for the run pills: offline"]);
    const quiet: string[] = [];
    followAgents(fakeFeed({ fail: true }).feed, fakePills().pills, (m) => quiet.push(m))();
    await tick();
    expect(quiet).toEqual([]);
  });
});
