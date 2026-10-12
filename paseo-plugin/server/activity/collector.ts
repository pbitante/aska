import { randomBytes } from "node:crypto";
import type { RunActivity } from "../../shared/activity";
import { applyUpdate, dropParent, emptyState, evictIdle, snapshot, type ActivityState } from "./state";
import { errorText } from "../../shared/guards";

const EVENT = "agent.provider_subagents.update";

// The slice of PaseoApi the collector uses (PaseoApi.observeEvents is assignable to it).
export interface ActivityEvents {
  observeEvents(events: [typeof EVENT]): {
    ready: Promise<unknown>;
    subscribe(observer: { snapshot(s: unknown): void; update(m: unknown): void; error?(e: unknown): void }): () => void;
    release(): Promise<void>;
  };
}
type Subscription = ReturnType<ActivityEvents["observeEvents"]>;

// One subscription to every agent's provider-sub-agent events, opened lazily with the
// process-wide `paseo` that hooks and RPC handlers receive.
export class ActivityCollector {
  readonly state: ActivityState;
  private sub: Subscription | null = null;
  private starting: Promise<void> | null = null;
  private disposed = false;
  private readonly logged = new Set<string>();

  constructor(private readonly deps: { now: () => number; log: (message: string) => void; epoch?: string }) {
    this.state = emptyState(deps.epoch ?? randomBytes(6).toString("hex"));
  }

  private logOnce(key: string, text: string): void {
    if (this.logged.has(key)) return;
    this.logged.add(key);
    this.deps.log(text);
  }

  ensure(paseo: ActivityEvents): Promise<void> {
    if (this.disposed || this.state.up) return Promise.resolve();
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const old = this.sub;
      this.sub = null;
      if (old) await old.release().catch(() => undefined);
      if (this.disposed) return;
      try {
        const sub = paseo.observeEvents([EVENT]);
        this.sub = sub;
        sub.subscribe({
          snapshot: () => {},
          update: (m) => {
            if (applyUpdate(this.state, m, this.deps.now()) === "skipped") this.logOnce("skipped", "aska-editor: skipped an unexpected sub-agent event payload");
          },
          error: (e) => {
            this.state.up = false;
            this.logOnce("down", `aska-editor: sub-agent activity stream failed: ${errorText(e)}`);
          },
        });
        await sub.ready;
        // Disposed while opening: dispose already released it.
        if (this.disposed) return;
        this.state.up = true;
        this.state.startedAt = new Date(this.deps.now()).toISOString();
        this.logged.delete("down");
      } catch (e) {
        this.state.up = false;
        if (this.disposed) return;
        this.logOnce("down", `aska-editor: sub-agent activity stream failed: ${errorText(e)}`);
      } finally {
        this.starting = null;
      }
    })();
    return this.starting;
  }

  // On plugin unload: release the subscription, even one still opening (its `ready` may never
  // settle, so this doesn't wait for it), and never open another.
  async dispose(): Promise<void> {
    this.disposed = true;
    this.state.up = false;
    const sub = this.sub;
    this.sub = null;
    if (sub) await sub.release().catch(() => undefined);
  }

  read(agentId: string, since?: number): RunActivity {
    evictIdle(this.state, this.deps.now());
    return snapshot(this.state, agentId, since);
  }

  drop(agentId: string): void {
    dropParent(this.state, agentId);
  }
}
