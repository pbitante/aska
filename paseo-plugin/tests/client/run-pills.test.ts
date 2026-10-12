import { describe, expect, it } from "vitest";
import { createRunPills, type PillHost } from "../../client/logic/runPills";

function fakeHost() {
  const added: { id: string; workspaceId: string; agentId: string; press: () => void; removed: boolean }[] = [];
  const opened: { id: string; workspaceId: string; agentId?: string }[] = [];
  const host: PillHost = {
    addComposerPill: ({ id, workspaceId, agentId, button }) => {
      const entry = { id, workspaceId, agentId, press: () => {}, removed: false };
      const behavior = button.behavior;
      entry.press = () => {
        if (behavior.kind === "action") void behavior.onPress();
      };
      added.push(entry);
      return { update: () => {}, remove: () => void (entry.removed = true) };
    },
    openPanel: (id, options) => void opened.push({ id, ...options }),
  };
  return { host, added, opened };
}

describe("createRunPills", () => {
  it("adds one pill per agent that opens the panel-run panel for it", () => {
    const { host, added, opened } = fakeHost();
    const pills = createRunPills(host);
    pills.show("w1", "a1");
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ workspaceId: "w1", agentId: "a1" });
    added[0]!.press();
    expect(opened).toEqual([{ id: "panel-run", workspaceId: "w1", agentId: "a1" }]);
  });

  it("doesn't add a second pill when several timeline rows of the same run show it", () => {
    const { host, added } = fakeHost();
    const pills = createRunPills(host);
    pills.show("w1", "a1");
    pills.show("w1", "a1");
    pills.show("w1", "a2");
    expect(added.map((p) => p.agentId)).toEqual(["a1", "a2"]);
  });

  it("re-adds the pill when the agent moves to another workspace", () => {
    const { host, added } = fakeHost();
    const pills = createRunPills(host);
    pills.show("w1", "a1");
    pills.show("w2", "a1");
    expect(added.map((p) => [p.workspaceId, p.removed])).toEqual([
      ["w1", true],
      ["w2", false],
    ]);
  });

  it("removes every pill on dispose and ignores later shows", () => {
    const { host, added } = fakeHost();
    const pills = createRunPills(host);
    pills.show("w1", "a1");
    pills.dispose();
    pills.show("w1", "a2");
    expect(added.map((p) => [p.agentId, p.removed])).toEqual([["a1", true]]);
  });

  it("re-adds every run pill from a fresh agent snapshot, as after a reconnect", () => {
    const { host, added } = fakeHost();
    const pills = createRunPills(host);
    pills.show("w1", "a1");
    pills.show("w1", "a2");
    pills.sync([{ id: "a1", workspaceId: "w1" }, { id: "a2", workspaceId: "w1" }, { id: "a3", workspaceId: "w1" }]);
    expect(added.filter((p) => !p.removed).map((p) => p.agentId).sort()).toEqual(["a1", "a2"]);
    expect(added).toHaveLength(4);
  });

  it("drops the pill of an agent missing from a snapshot, removed, or archived", () => {
    const { host, added } = fakeHost();
    const pills = createRunPills(host);
    pills.show("w1", "a1");
    pills.show("w1", "a2");
    pills.show("w1", "a3");
    pills.sync([{ id: "a2", workspaceId: "w1" }, { id: "a3", workspaceId: "w1" }]);
    pills.drop("a2");
    pills.upsert({ id: "a3", workspaceId: "w1", archivedAt: "2026-10-12T00:00:00.000Z" });
    expect(added.filter((p) => !p.removed)).toEqual([]);
    pills.sync([{ id: "a1", workspaceId: "w1" }, { id: "a2", workspaceId: "w1" }]);
    expect(added.filter((p) => !p.removed)).toEqual([]);
  });

  it("moves a pill when an upsert puts its agent in another workspace, and ignores agents with no run", () => {
    const { host, added } = fakeHost();
    const pills = createRunPills(host);
    pills.show("w1", "a1");
    pills.upsert({ id: "a1", workspaceId: "w2" });
    pills.upsert({ id: "a9", workspaceId: "w2" });
    expect(added.map((p) => [p.agentId, p.workspaceId, p.removed])).toEqual([
      ["a1", "w1", true],
      ["a1", "w2", false],
    ]);
  });
});

