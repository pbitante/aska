import { describe, expect, it } from "vitest";
import { assembleRun, expandShellVars, personaFromDescription, recognize, reportDir } from "../../shared/recognize";

const tool = (callId: string, detail: Record<string, unknown>, status = "completed", error: unknown = null) => ({
  type: "tool_call",
  callId,
  name: detail.type === "shell" ? "Bash" : "Task",
  status,
  error,
  detail,
});
const panelist = (callId: string, description: string, status = "running", error: unknown = null) =>
  tool(callId, { type: "sub_agent", subAgentType: "aska:panelist", description, log: "" }, status, error);
const mktemp = (callId: string, dir: string) => tool(callId, { type: "shell", command: "mktemp -d -t aska-panel-XXXXXX", output: `${dir}\n` });
const compare = (callId: string, dir: string, status = "completed") =>
  tool(callId, { type: "shell", command: `node /p/skills/operator/scripts/persona.mjs compare --file ${dir}/panel-result.json --json`, output: "{}" }, status);
const write = (callId: string, filePath: string, status = "completed") => tool(callId, { type: "write", filePath, content: "{}" }, status);

const A = "/tmp/aska-panel-Ab12Cd";
const B = "/tmp/aska-panel-Zz99Yy";

describe("personaFromDescription", () => {
  it("reads today's and the future description styles", () => {
    expect(personaFromDescription("guardian panelist judgment")).toBe("guardian");
    expect(personaFromDescription("guardian panelist re-ask")).toBe("guardian");
    expect(personaFromDescription("panelist aska:guardian")).toBe("aska:guardian");
    expect(personaFromDescription("panelist aska:guardian re-ask")).toBe("aska:guardian");
    expect(personaFromDescription("Review the change")).toBe("Review the change");
    expect(personaFromDescription("  ")).toBe("panelist");
  });
});

describe("expandShellVars", () => {
  it("expands a simple assignment and leaves other text alone", () => {
    expect(expandShellVars("R=/tmp/x; echo $R")).toBe("R=/tmp/x; echo /tmp/x");
  });
  it("accepts quoting, ${NAME}, and chained &&", () => {
    expect(expandShellVars("R='/tmp/x'; echo $R && echo ${R}")).toBe("R='/tmp/x'; echo /tmp/x && echo /tmp/x");
    expect(expandShellVars('R="/tmp/x"; echo $R')).toBe('R="/tmp/x"; echo /tmp/x');
  });
  it("expands earlier variables when reading a later assignment", () => {
    expect(expandShellVars('B=/a/b; C="node $B/persona.mjs"; echo $C')).toBe('B=/a/b; C="node /a/b/persona.mjs"; echo node /a/b/persona.mjs');
  });
  it("leaves a variable used before its assignment literal", () => {
    expect(expandShellVars("echo $R; R=/tmp/x")).toBe("echo $R; R=/tmp/x");
  });
  it("ignores $(...) values: the variable stays unassigned", () => {
    expect(expandShellVars("R=$(mktemp); echo $R")).toBe("R=$(mktemp); echo $R");
  });
  it("ignores unquoted values with spaces and backtick values", () => {
    expect(expandShellVars("R=`pwd`; echo $R")).toBe("R=`pwd`; echo $R");
  });
  it("lets a later assignment to the same name win from that point on", () => {
    expect(expandShellVars("R=/a; echo $R; R=/b; echo $R")).toBe("R=/a; echo /a; R=/b; echo /b");
  });
  it("leaves unknown variables and positional parameters alone", () => {
    expect(expandShellVars("echo $UNKNOWN $1")).toBe("echo $UNKNOWN $1");
  });
});

describe("recognize: panelists", () => {
  it("maps state, persona and re-asks", () => {
    expect(recognize(panelist("c1", "guardian panelist judgment"))).toEqual({ kind: "panelist", callId: "c1", state: "running", persona: "guardian", reask: false, error: null });
    expect(recognize(panelist("c2", "guardian panelist re-ask", "completed"))).toMatchObject({ state: "done", reask: true });
    expect(recognize(panelist("c3", "panelist aska:tester", "canceled"))).toMatchObject({ state: "canceled", persona: "aska:tester" });
  });
  it("carries a failure's message", () => {
    expect(recognize(panelist("c4", "tester panelist judgment", "failed", { message: "timed out after 10 min" }))).toMatchObject({ state: "failed", error: "timed out after 10 min" });
    expect(recognize(panelist("c5", "tester panelist judgment", "failed", null))).toMatchObject({ state: "failed", error: "failed" });
  });
  it("ignores other sub-agents and anything that isn't a tool call", () => {
    expect(recognize(tool("c6", { type: "sub_agent", subAgentType: "general-purpose", description: "x" }))).toBeUndefined();
    expect(recognize({ type: "assistant_message", text: "hi" })).toBeUndefined();
    expect(recognize(null)).toBeUndefined();
    expect(recognize("tool_call")).toBeUndefined();
  });
});

describe("recognize: run folders", () => {
  it("finds today's mktemp folder", () => {
    expect(recognize(mktemp("m1", A))).toEqual({ kind: "runFolder", callId: "m1", dir: A });
  });
  it("finds a future `runs new` folder", () => {
    const dir = "/home/u/.claude/aska/runs/20261009T201512Z-Ab12Cd";
    expect(recognize(tool("m2", { type: "shell", command: "node /p/persona.mjs runs new --json", output: dir }))).toEqual({ kind: "runFolder", callId: "m2", dir });
  });
  it("ignores other temp folders and unfinished calls", () => {
    expect(recognize(tool("m3", { type: "shell", command: "mktemp -d -t other-XXXXXX", output: "/tmp/other-Ab12Cd" }))).toBeUndefined();
    expect(recognize(tool("m4", { type: "shell", command: "mktemp -d -t aska-panel-XXXXXX" }, "running"))).toBeUndefined();
  });
});

describe("recognize: reports", () => {
  it("finds compare whether the call completed or failed (exit 1)", () => {
    expect(recognize(compare("r1", A))).toEqual({ kind: "report", callId: "r1", dir: A });
    expect(recognize(compare("r2", A, "failed"))).toEqual({ kind: "report", callId: "r2", dir: A });
    expect(recognize(compare("r3", A, "running"))).toBeUndefined();
  });
  it("accepts quoting, --file= and a trailing --record", () => {
    expect(reportDir(`node /p/persona.mjs compare --file "${A}/panel-result.json" --json`)).toBe(A);
    expect(reportDir(`node /p/persona.mjs compare --file=${A}/panel-result.json --json --record`)).toBe(A);
  });
  it("leaves variables, relative paths and other commands alone", () => {
    expect(reportDir('node /p/persona.mjs compare --file "$D/panel-result.json" --json')).toBeNull();
    expect(reportDir("node /p/persona.mjs compare --file aska-panel-Ab12Cd/panel-result.json --json")).toBeNull();
    expect(reportDir(`node /p/persona.mjs compare --file ${A}/other.json --json`)).toBeNull();
    expect(reportDir(`node /p/persona.mjs list --json --file ${A}/panel-result.json`)).toBeNull();
  });
  it("accepts a run dir anywhere absolute, not just under /tmp", () => {
    expect(reportDir(`node /p/persona.mjs compare --file /home/u/aska-panel-Ab12Cd/panel-result.json --json`)).toBe("/home/u/aska-panel-Ab12Cd");
    const macTmp = "/var/folders/ab/xyz/T/aska-panel-Ab12Cd";
    expect(reportDir(`node /p/persona.mjs compare --file ${macTmp}/panel-result.json --json`)).toBe(macTmp);
    expect(recognize(compare("r4", macTmp))).toEqual({ kind: "report", callId: "r4", dir: macTmp });
    expect(recognize(mktemp("m5", macTmp))).toEqual({ kind: "runFolder", callId: "m5", dir: macTmp });
  });
});

describe("assembleRun", () => {
  it("collects the latest folder, its panelists and its report", () => {
    const run = assembleRun([mktemp("m1", A), panelist("p1", "guardian panelist judgment"), panelist("p2", "tester panelist judgment", "completed"), compare("r1", A)]);
    expect(run).toEqual({
      dir: A,
      panelists: [
        { kind: "panelist", callId: "p1", state: "running", persona: "guardian", reask: false, error: null },
        { kind: "panelist", callId: "p2", state: "done", persona: "tester", reask: false, error: null },
      ],
      reportCallId: "r1",
      judgmentsSaved: [],
    });
  });
  it("follows the newest run when a conversation has two", () => {
    const run = assembleRun([mktemp("m1", A), panelist("p1", "guardian panelist judgment"), compare("r1", A), mktemp("m2", B), panelist("p3", "tester panelist judgment")]);
    expect(run?.dir).toBe(B);
    expect(run?.panelists.map((p) => p.callId)).toEqual(["p3"]);
    expect(run?.reportCallId).toBeNull();
  });
  it("keeps the latest state for a repeated call id and the last report for the folder", () => {
    const run = assembleRun([mktemp("m1", A), panelist("p1", "guardian panelist judgment"), panelist("p1", "guardian panelist judgment", "completed"), compare("r1", A), compare("r2", A)]);
    expect(run?.panelists).toHaveLength(1);
    expect(run?.panelists[0]?.state).toBe("done");
    expect(run?.reportCallId).toBe("r2");
  });
  it("takes the folder from the report when the mktemp call wasn't recognisable", () => {
    expect(assembleRun([panelist("p1", "guardian panelist judgment", "completed"), compare("r1", A)])?.dir).toBe(A);
  });
  it("without a run folder, follows the latest report and drops panelists from an earlier one", () => {
    const p1 = panelist("p1", "guardian panelist judgment", "completed");
    const p2 = panelist("p2", "tester panelist judgment", "completed");
    const rA = compare("rA", A);
    const rB = compare("rB", B);
    const run = assembleRun([p1, rA, p2, rB]);
    expect(run?.dir).toBe(B);
    expect(run?.panelists.map((p) => p.callId)).toEqual(["p2"]);
    expect(run?.reportCallId).toBe("rB");
  });
  it("without a run folder, keeps panelists since the last differing report", () => {
    const p1 = panelist("p1", "guardian panelist judgment", "completed");
    const p2 = panelist("p2", "tester panelist judgment", "completed");
    const rA1 = compare("rA1", A);
    const rA2 = compare("rA2", A);
    const run = assembleRun([p1, rA1, p2, rA2]);
    expect(run?.dir).toBe(A);
    expect(run?.panelists.map((p) => p.callId)).toEqual(["p1", "p2"]);
    expect(run?.reportCallId).toBe("rA2");
  });
  it("is null without any run", () => {
    expect(assembleRun([{ type: "user_message", text: "hi" }])).toBeNull();
  });
});

describe("recognize: saved judgments", () => {
  it("finds a judgment saved with the Write tool, a shell command, or checked afterwards", () => {
    expect(recognize(write("w1", `${A}/judgments/guardian.json`))).toEqual({ kind: "judgmentSaved", callId: "w1", dir: A, name: "guardian" });
    expect(recognize(tool("w2", { type: "shell", command: `cat > ${A}/judgments/red-team.json <<'EOF'\n{}\nEOF`, output: "" }))).toEqual({
      kind: "judgmentSaved",
      callId: "w2",
      dir: A,
      name: "red-team",
    });
    expect(recognize(tool("w3", { type: "shell", command: `node /p/persona.mjs check-judgment guardian --file ${A}/judgments/guardian.json`, output: "ok" }))).toMatchObject({
      kind: "judgmentSaved",
      name: "guardian",
    });
  });
  it("keys a judgment saved under the row's canonical name by its short name", () => {
    expect(recognize(write("w1", `${A}/judgments/aska:guardian.json`))).toEqual({ kind: "judgmentSaved", callId: "w1", dir: A, name: "guardian" });
    expect(recognize(tool("w2", { type: "shell", command: `cat > '${A}/judgments/acme:red-team.json' <<'EOF'\n{}\nEOF`, output: "" }))).toMatchObject({
      kind: "judgmentSaved",
      name: "red-team",
    });
  });
  it("ignores unfinished writes, folders that aren't runs, and other files", () => {
    expect(recognize(write("w4", `${A}/judgments/guardian.json`, "running"))).toBeUndefined();
    expect(recognize(write("w5", "/home/u/project/judgments/guardian.json"))).toBeUndefined();
    expect(recognize(write("w6", `${A}/brief.md`))).toBeUndefined();
    expect(recognize(write("w7", `${A}/panel-result.json`))).toBeUndefined();
  });
});

describe("assembleRun: saved judgments", () => {
  it("lists distinct judgments saved for the current folder, in order", () => {
    const run = assembleRun([
      mktemp("m1", A),
      write("w1", `${A}/judgments/guardian.json`),
      write("w2", `${B}/judgments/other.json`),
      write("w3", `${A}/judgments/tester.json`),
      write("w4", `${A}/judgments/guardian.json`),
    ]);
    expect(run?.judgmentsSaved).toEqual(["guardian", "tester"]);
  });
  it("is empty before any judgment is saved", () => {
    expect(assembleRun([mktemp("m1", A)])?.judgmentsSaved).toEqual([]);
  });
});

describe("recognize: a chair that uses shell variables", () => {
  const RUN_DIR = "/home/u/.claude/aska/runs/20261011T201003Z-19HsD1";

  it("finds the report behind $P and $R", () => {
    const command = `R=${RUN_DIR}; P=/home/u/project/aska/panel/skills/operator/scripts/persona.mjs; node $P compare --file $R/panel-result.json --json --record`;
    expect(recognize(tool("r1", { type: "shell", command, output: "{}" }))).toEqual({ kind: "report", callId: "r1", dir: RUN_DIR });
  });

  it("finds a judgment saved via a heredoc, with $D naming the run dir", () => {
    const command = `D=${RUN_DIR}; cat > $D/judgments/tester.json <<'JSONEOF'\n{}\nJSONEOF`;
    expect(recognize(tool("w1", { type: "shell", command, output: "" }))).toEqual({ kind: "judgmentSaved", callId: "w1", dir: RUN_DIR, name: "tester" });
  });

  it("finds a judgment saved via a heredoc, with $D naming the judgments dir", () => {
    const command = `D=${RUN_DIR}/judgments\ncat > $D/maintainer.json <<'JSONEOF'\n{}\nJSONEOF`;
    expect(recognize(tool("w2", { type: "shell", command, output: "" }))).toEqual({ kind: "judgmentSaved", callId: "w2", dir: RUN_DIR, name: "maintainer" });
  });

  it("finds a run folder behind a chained $B/$C", () => {
    const command = `B=/home/u/project/aska/panel/skills/panel; C="node $B/../operator/scripts/persona.mjs"; cd /home/u/.claude/skills; $C runs new`;
    expect(recognize(tool("m1", { type: "shell", command, output: `${RUN_DIR}\n` }))).toEqual({ kind: "runFolder", callId: "m1", dir: RUN_DIR });
  });

  it("finds a run folder behind a single $P", () => {
    const command = `P=/home/u/project/aska/panel/skills/operator/scripts/persona.mjs; cd /home/u/.claude/skills; node $P runs new`;
    expect(recognize(tool("m2", { type: "shell", command, output: `${RUN_DIR}\n` }))).toEqual({ kind: "runFolder", callId: "m2", dir: RUN_DIR });
  });
});
