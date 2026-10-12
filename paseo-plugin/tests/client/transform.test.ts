import { describe, expect, it } from "vitest";
import { PANELIST_KIND, REPORT_KIND, panelistDataSchema, reportDataSchema, transformToolCall } from "../../client/timeline/transform";

const call = (callId: string, detail: Record<string, unknown>, status = "completed") => ({ type: "tool_call", callId, name: "x", status, error: null, detail });

describe("transformToolCall", () => {
  it("replaces a panelist sub-agent with a chip", () => {
    const out = transformToolCall(call("p1", { type: "sub_agent", subAgentType: "aska:panelist", description: "guardian panelist judgment", log: "" }, "running"));
    expect(out).toEqual({ items: [{ type: "plugin", kind: PANELIST_KIND, version: 1, data: { callId: "p1", state: "running", persona: "guardian", reask: false, error: null } }] });
    expect(panelistDataSchema.safeParse(out!.items[0]!.data).success).toBe(true);
  });
  it("replaces a compare call with a report card", () => {
    const out = transformToolCall(call("r1", { type: "shell", command: "node /p/persona.mjs compare --file /tmp/aska-panel-Ab12Cd/panel-result.json --json", output: "{}" }));
    expect(out).toEqual({ items: [{ type: "plugin", kind: REPORT_KIND, version: 1, data: { callId: "r1", dir: "/tmp/aska-panel-Ab12Cd" } }] });
    expect(reportDataSchema.safeParse(out!.items[0]!.data).success).toBe(true);
  });
  it("keeps the run-folder row and everything else unchanged", () => {
    expect(transformToolCall(call("m1", { type: "shell", command: "mktemp -d -t aska-panel-XXXXXX", output: "/tmp/aska-panel-Ab12Cd" }))).toBeUndefined();
    expect(transformToolCall(call("x1", { type: "shell", command: "ls", output: "" }))).toBeUndefined();
    expect(transformToolCall({ type: "assistant_message", text: "hi" })).toBeUndefined();
  });
});
