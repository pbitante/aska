import type { PluginClientContext } from "@getpaseo/plugin/client";

export const RUN_PANEL_ID = "panel-run";

export type PillHost = Pick<PluginClientContext, "addComposerPill" | "openPanel">;

type AgentId = string;

export interface AgentSeen {
  id: string;
  workspaceId?: string | null;
  archivedAt?: string | null;
}

export interface RunPills {
  // Idempotent per agent: every timeline row of a recognised run calls it when it renders.
  show(workspaceId: string, agentId: string): void;
  // A full agent snapshot (the first one, or a fresh one after a reconnect, when the host has
  // dropped every pill): re-adds the pill of each listed agent with a run, forgets the others.
  sync(agents: readonly AgentSeen[]): void;
  upsert(agent: AgentSeen): void;
  drop(agentId: string): void;
  dispose(): void;
}

// The composer pill that opens the panel-run panel for an agent with a recognised panel run.
// The phone's new-tab launcher skips agent panels, so this (with /aska-run) is how a phone gets there.
// A pill stays while its agent does: once an agent has had a run, the panel stays worth opening.
export function createRunPills(host: PillHost): RunPills {
  // Agents known to have a run, and the pill currently added for each.
  const withRun = new Set<AgentId>();
  const pills = new Map<string, { workspaceId: string; remove: () => void }>();
  let disposed = false;

  const remove = (agentId: string) => {
    pills.get(agentId)?.remove();
    pills.delete(agentId);
  };
  const add = (workspaceId: string, agentId: string) => {
    remove(agentId);
    const registration = host.addComposerPill({
      id: RUN_PANEL_ID,
      workspaceId,
      agentId,
      button: {
        title: "Open the aska panel run",
        icon: "Scale",
        label: "aska run",
        behavior: { kind: "action", onPress: () => host.openPanel(RUN_PANEL_ID, { workspaceId, agentId }) },
      },
    });
    pills.set(agentId, { workspaceId, remove: () => registration.remove() });
  };
  const forget = (agentId: string) => {
    withRun.delete(agentId);
    remove(agentId);
  };

  return {
    show(workspaceId, agentId) {
      if (disposed) return;
      withRun.add(agentId);
      if (pills.get(agentId)?.workspaceId !== workspaceId) add(workspaceId, agentId);
    },
    sync(agents) {
      if (disposed) return;
      const listed = new Map(agents.filter((a) => !a.archivedAt).map((a) => [a.id, a.workspaceId ?? null]));
      for (const agentId of [...withRun]) {
        const workspaceId = listed.get(agentId);
        if (workspaceId === undefined) forget(agentId);
        else if (workspaceId === null) remove(agentId);
        else add(workspaceId, agentId);
      }
    },
    upsert(agent) {
      if (disposed || !withRun.has(agent.id)) return;
      if (agent.archivedAt) forget(agent.id);
      else if (!agent.workspaceId) remove(agent.id);
      else if (pills.get(agent.id)?.workspaceId !== agent.workspaceId) add(agent.workspaceId, agent.id);
    },
    drop(agentId) {
      if (!disposed) forget(agentId);
    },
    dispose() {
      disposed = true;
      for (const agentId of [...pills.keys()]) remove(agentId);
      withRun.clear();
    },
  };
}
