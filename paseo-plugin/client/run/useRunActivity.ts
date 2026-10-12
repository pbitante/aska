import { useRpc } from "@getpaseo/plugin/client";
import { useEffect, useRef, useState } from "react";
import { runActivityRpc, type RunActivity } from "../../shared/activity";
import { mergeActivity } from "../logic/flow/activity";

const POLL_MS = 1500;
type Activity = RunActivity | null;
type Cursor = { agentId: string; epoch: string; cursor: number } | null;

// Fetches the run's sub-agent activity at mount, then every POLL_MS while `active`, and once more
// when it stops. A new collector epoch (plugin or daemon restart) triggers a full refetch.
export function useRunActivity(agentId: string, active: boolean): RunActivity | null {
  const call = useRpc(runActivityRpc);
  const callRef = useRef(call);
  callRef.current = call;
  const [data, setData] = useState<Activity>(null);
  const last = useRef<Cursor>(null);
  useEffect(() => {
    // No timer handle (its type would trip the mobile audit): a pending tick just sees `cancelled`.
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const prev = last.current && last.current.agentId === agentId ? last.current : null;
      const input = prev ? { agentId, since: prev.cursor } : { agentId };
      callRef.current(input).then(
        (next) => {
          if (cancelled) return;
          if (prev && next.epoch !== prev.epoch) {
            last.current = null;
            tick();
            return;
          }
          last.current = { agentId, epoch: next.epoch, cursor: next.cursor };
          setData((cur) => mergeActivity(prev ? cur : null, next, prev !== null));
          if (active) setTimeout(tick, POLL_MS);
        },
        () => {
          if (!cancelled && active) setTimeout(tick, POLL_MS);
        },
      );
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [agentId, active]);
  return data;
}
