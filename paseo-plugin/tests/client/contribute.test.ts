import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" }, StyleSheet: { create: (s: unknown) => s }, View: "View", Text: "Text", Pressable: "Pressable", TextInput: "TextInput", ScrollView: "ScrollView", Animated: {}, Modal: "Modal", Switch: "Switch", ActivityIndicator: "ActivityIndicator", AccessibilityInfo: {} }));
vi.mock("@getpaseo/plugin/client/react-native", () => ({ ScrollView: "ScrollView" }));
vi.mock("@getpaseo/plugin/client/ui", () => ({ SidebarRow: "SidebarRow" }));

const { default: contribute } = await import("../../index.client");

type Call = { method: string; arg: Record<string, unknown> };

function fakeClient() {
  const calls: Call[] = [];
  let removed = 0;
  const opened: unknown[][] = [];
  let listSignal: AbortSignal | undefined;
  const client = new Proxy(
    {
      openPanel: (...a: unknown[]) => void opened.push(a),
      paseo: { agents: { list: async (o: { signal: AbortSignal }) => ((listSignal = o.signal), { subscription: { subscribe: () => () => {} } }) } },
    } as Record<string, unknown>,
    {
      get(target, prop: string) {
        if (prop in target) return target[prop];
        if (!prop.startsWith("add")) return undefined;
        return (arg: Record<string, unknown>) => {
          calls.push({ method: prop, arg });
          const remove = () => void removed++;
          return prop === "addComposerPill" || prop === "addHeaderButton" ? { update: () => {}, remove } : remove;
        };
      },
    },
  );
  return { client: client as never, calls, opened, removed: () => removed, listSignal: () => listSignal };
}

describe("index.client contribute", () => {
  it("registers the library as a screen with a sidebar header row, not the deprecated aliases", () => {
    const f = fakeClient();
    contribute(f.client);
    const methods = f.calls.map((c) => c.method);
    expect(methods).not.toContain("addSurface");
    expect(methods).not.toContain("addSidebarItem");
    const screen = f.calls.find((c) => c.method === "addScreen")!.arg;
    const row = f.calls.find((c) => c.method === "addSidebarHeaderItem")!.arg;
    expect(screen.id).toBe("library");
    expect(row).toMatchObject({ id: "aska", title: "aska" });
  });

  it("registers /aska-run, which opens the panel-run panel for the agent", () => {
    const f = fakeClient();
    contribute(f.client);
    const slash = f.calls.find((c) => c.method === "addSlashCommand")!.arg as { name: string; context: string; onSubmit(ctx: unknown): void };
    expect(slash).toMatchObject({ name: "aska-run", context: "agent" });
    const openPanel = vi.fn();
    slash.onSubmit({ openPanel, args: "" });
    expect(openPanel).toHaveBeenCalledWith("panel-run");
    const panel = f.calls.find((c) => c.method === "addWorkspacePanel" && c.arg.id === "panel-run")!.arg;
    expect(panel.context).toBe("agent");
  });

  it("removes every registration and stops following agents on cleanup", async () => {
    const f = fakeClient();
    const cleanup = contribute(f.client);
    await new Promise((r) => setTimeout(r, 0));
    cleanup();
    expect(f.removed()).toBe(f.calls.length);
    expect(f.listSignal()?.aborted).toBe(true);
  });
});
