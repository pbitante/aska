import { useAgent } from "@getpaseo/plugin/client";
import { useEffect } from "react";

export type ShowRunPill = (workspaceId: string, agentId: string) => void;

// A timeline row of a recognised panel run puts the "aska run" pill on its agent's composer.
export function useRunPill(agentId: string, show: ShowRunPill) {
  const workspaceId = useAgent(agentId, (a) => a.workspaceId);
  useEffect(() => {
    if (workspaceId) show(workspaceId, agentId);
  }, [workspaceId, agentId, show]);
}
