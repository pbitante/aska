import type { AgentSeen, RunPills } from "./runPills";
import { errorText, isObj } from "../../shared/guards";

type Observer = { snapshot(s: unknown): void; update(m: unknown): void; error?(e: unknown): void };

// The slice of the Paseo client this needs (PaseoApi is assignable to it).
export interface AgentFeed {
  agents: {
    list(options: { subscribe: {}; signal: AbortSignal }): Promise<{ subscription?: { subscribe(observer: Observer): () => void } }>;
  };
}

const asAgent = (v: unknown): AgentSeen | null => (isObj(v) && typeof v.id === "string" ? (v as unknown as AgentSeen) : null);

// Keeps the run pills in step with the agent list: an owned subscription delivers the agents, then
// updates, and a fresh snapshot after a reconnect (when the host has dropped every pill).
export function followAgents(feed: AgentFeed, pills: RunPills, log: (message: string) => void): () => void {
  const lifetime = new AbortController();
  feed.agents
    .list({ subscribe: {}, signal: lifetime.signal })
    .then(({ subscription }) => {
      subscription?.subscribe({
        snapshot: (s) => {
          const entries = isObj(s) && Array.isArray(s.entries) ? s.entries : [];
          pills.sync(entries.map((e) => asAgent(isObj(e) ? e.agent : null)).filter((a): a is AgentSeen => a !== null));
        },
        update: (m) => {
          if (!isObj(m) || m.type !== "agent_update" || !isObj(m.payload)) return;
          const p = m.payload;
          const agent = asAgent(p.agent);
          if (p.kind === "upsert" && agent) pills.upsert(agent);
          else if (p.kind === "remove" && typeof p.agentId === "string") pills.drop(p.agentId);
        },
      });
    })
    .catch((e: unknown) => {
      if (!lifetime.signal.aborted) log(`aska-editor: couldn't follow agents for the run pills: ${errorText(e)}`);
    });
  return () => lifetime.abort();
}
