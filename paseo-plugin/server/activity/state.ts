import type { ActivityEntry, ActivityKind, RunActivity, SubagentActivity } from "../../shared/activity";
import { isObj } from "../../shared/guards";

export const ACTIVITY_CAP = 200;
export const PARENT_CAP = 50;
export const IDLE_MS = 6 * 60 * 60 * 1000;

const STATUSES = ["running", "completed", "failed", "canceled"] as const;
type Status = SubagentActivity["status"];

interface Entry extends ActivityEntry {
  rev: number;
}
interface Sub {
  id: string;
  status: Status;
  description: string | null;
  createdAt: string;
  endedAt: string | null;
  rev: number;
  activity: Entry[];
}
interface Parent {
  lastEventAt: number;
  subs: Map<string, Sub>;
}
export interface ActivityState {
  epoch: string;
  up: boolean;
  startedAt: string | null;
  rev: number;
  skipped: number;
  parents: Map<string, Parent>;
}

export function emptyState(epoch: string): ActivityState {
  return { epoch, up: false, startedAt: null, rev: 0, skipped: 0, parents: new Map() };
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

function parentOf(state: ActivityState, agentId: string, nowMs: number): Parent {
  let p = state.parents.get(agentId);
  if (!p) {
    p = { lastEventAt: nowMs, subs: new Map() };
    state.parents.set(agentId, p);
    if (state.parents.size > PARENT_CAP) {
      let oldest: string | null = null;
      let at = Infinity;
      for (const [id, q] of state.parents) {
        if (id !== agentId && q.lastEventAt < at) {
          at = q.lastEventAt;
          oldest = id;
        }
      }
      if (oldest !== null) state.parents.delete(oldest);
    }
  }
  p.lastEventAt = nowMs;
  return p;
}

function subOf(p: Parent, id: string, createdAt: string, rev: number): Sub {
  let s = p.subs.get(id);
  if (!s) {
    s = { id, status: "running", description: null, createdAt, endedAt: null, rev, activity: [] };
    p.subs.set(id, s);
  }
  return s;
}

function entryFor(item: Record<string, unknown>): { callId: string; kind: ActivityKind; target: string | null } | null {
  if (item.type !== "tool_call") return null;
  const callId = str(item.callId);
  if (callId === null) return null;
  const d = isObj(item.detail) ? item.detail : {};
  if (d.type === "read") return { callId, kind: "read", target: str(d.filePath) };
  if (d.type === "search") return { callId, kind: "search", target: str(d.query) };
  return { callId, kind: "other", target: null };
}

export function applyUpdate(state: ActivityState, message: unknown, nowMs: number): "applied" | "ignored" | "skipped" {
  if (!isObj(message) || message.type !== "agent.provider_subagents.update") return "ignored";
  const p = message.payload;
  const skip = () => {
    state.skipped++;
    return "skipped" as const;
  };
  if (!isObj(p)) return skip();
  if (p.kind === "upsert") {
    const s = p.subagent;
    if (!isObj(s)) return skip();
    const id = str(s.id);
    const parentId = str(s.parentAgentId);
    const createdAt = str(s.createdAt);
    const status = STATUSES.find((x) => x === s.status);
    if (id === null || parentId === null || createdAt === null || status === undefined) return skip();
    const rev = ++state.rev;
    const sub = subOf(parentOf(state, parentId, nowMs), id, createdAt, rev);
    sub.status = status;
    // The first terminal status wins: a later upsert for a finished sub-agent doesn't move its end.
    if (status !== "running" && sub.endedAt === null) sub.endedAt = str(s.updatedAt) ?? new Date(nowMs).toISOString();
    sub.description = str(s.description);
    sub.createdAt = createdAt;
    sub.rev = rev;
    return "applied";
  }
  if (p.kind === "timeline") {
    const parentId = str(p.parentAgentId);
    const id = str(p.subagentId);
    const at = str(p.timestamp);
    if (parentId === null || id === null || at === null || typeof p.seq !== "number" || !isObj(p.item)) return skip();
    const parent = parentOf(state, parentId, nowMs);
    const e = entryFor(p.item);
    const rev = ++state.rev;
    const sub = subOf(parent, id, at, rev);
    if (e === null) return "applied";
    const existing = sub.activity.find((a) => a.callId === e.callId);
    if (existing) {
      if (existing.target === null && e.target !== null) {
        existing.target = e.target;
        existing.rev = rev;
        sub.rev = rev;
      }
      return "applied";
    }
    sub.activity.push({ seq: p.seq, callId: e.callId, kind: e.kind, target: e.target, at, rev });
    if (sub.activity.length > ACTIVITY_CAP) sub.activity.splice(0, sub.activity.length - ACTIVITY_CAP);
    sub.rev = rev;
    return "applied";
  }
  if (p.kind === "remove") {
    const parentId = str(p.parentAgentId);
    const id = str(p.subagentId);
    if (parentId === null || id === null) return skip();
    state.parents.get(parentId)?.subs.delete(id);
    state.rev++;
    return "applied";
  }
  return skip();
}

export function evictIdle(state: ActivityState, nowMs: number): void {
  for (const [id, p] of state.parents) if (nowMs - p.lastEventAt > IDLE_MS) state.parents.delete(id);
}

export function dropParent(state: ActivityState, agentId: string): void {
  if (state.parents.delete(agentId)) state.rev++;
}

export function snapshot(state: ActivityState, agentId: string, since?: number): RunActivity {
  const p = state.parents.get(agentId);
  const base = { epoch: state.epoch, cursor: state.rev, watchingSince: state.startedAt };
  if (!p) return { ...base, complete: false, subagents: [] };
  const all = [...p.subs.values()];
  const watching = state.startedAt === null ? Infinity : Date.parse(state.startedAt);
  const complete = state.up && all.every((s) => Date.parse(s.createdAt) >= watching);
  const changed = since === undefined ? all : all.filter((s) => s.rev > since);
  const subagents = changed.map((s) => ({
    id: s.id,
    status: s.status,
    description: s.description,
    createdAt: s.createdAt,
    endedAt: s.endedAt,
    activity: s.activity.filter((a) => since === undefined || a.rev > since).map(({ rev: _rev, ...a }) => a),
  }));
  return { ...base, complete, subagents };
}
