import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Bounds } from "../../client/logic/flow/camera";
import {
  CAPTION_PITCH,
  CAPTION_W,
  captionBoxes,
  captionFrame,
  DOT_R,
  edgeBox,
  evidenceRings,
  flowLayout,
  INNER_MIN,
  LABEL_H,
  LABEL_W,
  liveCaptionRoom,
  MARKER_GAP,
  panelistRadius,
  RING_GAP,
  ringCapacity,
  stopPositions,
  trackDots,
  verdictTone,
  type FlowLayout,
  type FlowMode,
} from "../../client/logic/flow/layout";
import { fit } from "../../client/logic/flow/camera";
import { buildFlowModel, type FlowModel, type FlowUnit } from "../../client/logic/flow/model";
import type { LiveRun, PanelistRow } from "../../shared/recognize";
import { comparisonSchema, panelResultSchema, type RunReport } from "../../shared/runs";

function fixtureModel(runName: string): FlowModel {
  const fx = (f: string) => JSON.parse(readFileSync(join(__dirname, "../fixtures/runs", runName, f), "utf8")) as unknown;
  const result = panelResultSchema.parse(fx("panel-result.json"));
  const comparison = comparisonSchema.parse(fx("comparison.json"));
  const report: RunReport = {
    source: "live",
    dir: "/tmp/aska-panel-Ab12Cd",
    brief: readFileSync(join(__dirname, "../fixtures/runs", runName, "brief.md"), "utf8"),
    result,
    comparison,
    judgments: result.panelists.map((p) => ({ persona: p.persona, judgment: p.judgment })),
    meta: null,
    compareError: null,
    timeline: null,
  };
  return buildFlowModel({ dir: "/tmp/aska-panel-Ab12Cd", panelists: [], reportCallId: "r1", judgmentsSaved: [] }, report, {});
}
const row = (callId: string, persona: string, state: PanelistRow["state"] = "running", reask = false): PanelistRow => ({ kind: "panelist", callId, state, persona, reask, error: null });
const run = (panelists: PanelistRow[]): LiveRun => ({ dir: null, panelists, reportCallId: null, judgmentsSaved: [] });

const trio = fixtureModel("plan-trio");
const five = fixtureModel("code-five");
const live: FlowModel = { ...five, phase: "collecting", units: [] };
const MODES: FlowMode[] = ["live", "map", "tracks", "compact"];

const POSITIONS = ["high", "cleared", "low", "medium", null] as const;
// `p` panelists, `e` evidence files and `u` units; every third unit is quiet.
function synth(p: number, e: number, u: number): FlowModel {
  const panelists = Array.from({ length: p }, (_, i) => ({ ...five.panelists[0]!, id: `p${i}`, key: `p${i}`, persona: `aska:persona-number-${i}`, initial: `P${i}`, evidence: [] }));
  const items = Array.from({ length: e }, (_, j) => ({ id: `src/deep/folder/file-${j}.ts`, label: `file-${j}.ts`, citedBy: [`p${j % Math.max(1, p)}`], count: 1 }));
  const units: FlowUnit[] = Array.from({ length: u }, (_, k) => ({
    id: `u${k}`,
    label: `aska:unit-with-a-long-name-${k}`,
    cls: k % 3 === 2 ? "none" : (["split", "single-voice", "all-flag"] as const)[k % 3]!,
    cells: panelists.map((x, i) => ({ panelist: x.id, position: k % 3 === 2 ? null : POSITIONS[(i + k) % POSITIONS.length]!, claim: null, why: null })),
  }));
  return { phase: "outcome", panelists, evidence: { items, byPanelist: {} }, units, live: null };
}

const overlap = (a: Bounds, b: Bounds) =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.5;
// Inside [0, width] × [0, height] of the layout's bounds, which start at the origin.
const within = (l: FlowLayout, b: Bounds) => b.x >= -0.5 && b.y >= -0.5 && b.x + b.width <= l.bounds.width + 0.5 && b.y + b.height <= l.bounds.height + 0.5;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const byId = (l: FlowLayout, id: string) => l.nodes.find((n) => n.id === id)!;

function problems(l: FlowLayout): string[] {
  const out: string[] = [];
  if (l.bounds.x !== 0 || l.bounds.y !== 0) out.push(`bounds start at (${l.bounds.x}, ${l.bounds.y})`);
  const caps = captionBoxes(l);
  for (let i = 0; i < caps.length; i++) for (let j = i + 1; j < caps.length; j++) if (overlap(caps[i]!, caps[j]!)) out.push(`captions ${i} and ${j} overlap`);
  for (let i = 0; i < l.nodes.length; i++) {
    const a = l.nodes[i]!;
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) out.push(`${a.id} is not finite`);
    if (!within(l, { x: a.x - a.r, y: a.y - a.r, width: 2 * a.r, height: 2 * a.r })) out.push(`${a.id} is outside bounds`);
    for (let j = i + 1; j < l.nodes.length; j++) {
      const b = l.nodes[j]!;
      if (dist(a, b) < a.r + b.r - 0.5) out.push(`${a.id} overlaps ${b.id}`);
    }
  }
  for (const c of caps) if (!within(l, c)) out.push("a caption is outside bounds");
  return out;
}

describe("world layout", () => {
  it("never overlaps captions or nodes, and holds everything inside bounds from (0, 0), across sizes, modes and compact", () => {
    for (const p of [1, 2, 3, 5, 8, 12])
      for (const e of [0, 1, 8, 40, 200])
        for (const u of [0, 1, 7, 30])
          for (const m of MODES)
            for (const compact of [false, true]) {
              const l = flowLayout(synth(p, e, u), m, compact);
              expect(problems(l), `${p}p ${e}e ${u}u ${m}${compact ? " compact" : ""}`).toEqual([]);
            }
  });
  it("holds for the fixture runs and an empty model", () => {
    const empty: FlowModel = { phase: "running", panelists: [], evidence: { items: [], byPanelist: {} }, units: [], live: null };
    for (const model of [trio, five, live, empty]) for (const m of MODES) expect(problems(flowLayout(model, m)), m).toEqual([]);
  });
  it("is deterministic", () => {
    expect(JSON.stringify(flowLayout(synth(8, 40, 30), "map"))).toBe(JSON.stringify(flowLayout(synth(8, 40, 30), "map")));
    expect(JSON.stringify(flowLayout(five, "tracks"))).toBe(JSON.stringify(flowLayout(five, "tracks")));
  });
  it("keeps panelist and unit ids stable across modes", () => {
    const ids = (m: FlowMode, prefix: string) => flowLayout(five, m).nodes.filter((n) => n.id.startsWith(prefix)).map((n) => n.id).sort();
    for (const m of MODES) expect(ids(m, "p:")).toEqual(ids("map", "p:"));
    expect(ids("tracks", "u:")).toEqual(ids("map", "u:"));
  });
  it("gives every unit, contested or quiet, exactly one node, with no chips", () => {
    for (const m of ["map", "tracks"] as const)
      for (const model of [trio, five, synth(5, 8, 30)]) {
        const l = flowLayout(model, m);
        expect(l.nodes.filter((n) => n.kind === "unit").map((n) => n.ref).sort(), m).toEqual(model.units.map((u) => u.id).sort());
        expect(l.nodes.some((n) => n.id.startsWith("chip:"))).toBe(false);
      }
  });
  it("starts every layout at (0, 0), with every node and caption inside [0, width] × [0, height]", () => {
    for (const m of MODES)
      for (const model of [trio, five, synth(12, 40, 30)]) {
        const l = flowLayout(model, m);
        expect(l.bounds, m).toMatchObject({ x: 0, y: 0 });
        expect(Math.min(...l.nodes.map((n) => n.x - n.r)), m).toBeGreaterThanOrEqual(-0.5);
        expect(Math.min(...l.nodes.map((n) => n.y - n.r)), m).toBeGreaterThanOrEqual(-0.5);
        for (const c of captionBoxes(l)) expect(within(l, c), m).toBe(true);
        for (const s of l.stops) expect(s.x).toBeGreaterThan(0);
      }
  });
  it("centres the chair in the rings", () => {
    const l = flowLayout(synth(5, 8, 0), "live");
    const chair = byId(l, "chair");
    const xs = l.nodes.filter((n) => n.kind === "evidence").map((n) => n.x);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(chair.x, 5);
  });
  // Final review #2: `origin` is the shift normalise applied. The ring layouts place the chair at
  // the raw (0, 0), so after the shift its position is exactly that shift.
  it("gives `origin` as the shift normalise applied to reach (0, 0)", () => {
    for (const m of ["live", "map", "compact"] as const) {
      const l = flowLayout(synth(5, 8, 6), m);
      expect(byId(l, "chair")).toMatchObject({ x: l.origin.x, y: l.origin.y });
    }
    // As evidence grows, the raw bounds' min moves, so the shift (and the chair's world position
    // with it) changes between layouts, just as the review's example run showed.
    const a = flowLayout(synth(5, 1, 0), "live");
    const b = flowLayout(synth(5, 30, 0), "live");
    expect(a.origin).not.toEqual(b.origin);
    expect(byId(a, "chair")).toMatchObject({ x: a.origin.x, y: a.origin.y });
    expect(byId(b, "chair")).toMatchObject({ x: b.origin.x, y: b.origin.y });
  });
});

describe("rings", () => {
  it("sizes the panelist ring by the chord, so neighbours are at least a caption pitch apart", () => {
    for (const n of [1, 2, 3, 5, 12, 20]) {
      const l = flowLayout(synth(n, 0, 0), "live");
      const expected = n >= 2 ? Math.max(INNER_MIN, CAPTION_PITCH / (2 * Math.sin(Math.PI / n))) : INNER_MIN;
      expect(panelistRadius(n)).toBeCloseTo(expected, 9);
      const ps = l.nodes.filter((x) => x.kind === "panelist");
      for (const p of ps) expect(dist(p, byId(l, "chair"))).toBeCloseTo(expected, 5);
      if (n >= 2) expect(dist(ps[0]!, ps[1]!)).toBeGreaterThanOrEqual(CAPTION_PITCH - 1e-9);
    }
  });
  it("fills concentric evidence rings inside out, RING_GAP apart, each within its chord capacity", () => {
    const l = flowLayout(synth(3, 200, 0), "live");
    const chair = byId(l, "chair");
    const ev = l.nodes.filter((n) => n.kind === "evidence");
    expect(ev).toHaveLength(200);
    const inner = panelistRadius(3);
    const radii = ev.map((e) => dist(e, chair));
    for (const r of radii) {
      const k = Math.round((r - inner) / RING_GAP);
      expect(k).toBeGreaterThanOrEqual(1);
      expect(r).toBeCloseTo(inner + k * RING_GAP, 5);
    }
    // Rank order runs inside out: a file is never on a ring inside the one before it.
    for (let i = 1; i < radii.length; i++) expect(radii[i]!).toBeGreaterThanOrEqual(radii[i - 1]! - 1e-6);
    for (const ring of evidenceRings(200, inner)) {
      expect(ring.count).toBeLessThanOrEqual(ringCapacity(ring.r));
      expect(radii.filter((r) => Math.abs(r - ring.r) < 1e-6)).toHaveLength(ring.count);
    }
  });
  it("fits 200 files in about 2,200 px, on at most seven rings", () => {
    for (const n of [1, 5, 12]) {
      const l = flowLayout(synth(n, 200, 0), "live");
      expect(evidenceRings(200, panelistRadius(n)).length, `${n}`).toBeLessThanOrEqual(7);
      // About 2,200 px across: 2,207 at n = 1, 2,254 at n = 12 (a wider panelist ring, one ring fewer).
      expect(Math.max(l.bounds.width, l.bounds.height), `${n}`).toBeLessThanOrEqual(2300);
    }
  });
  it("offsets each ring by half a slot from the one inside it", () => {
    const l = flowLayout(synth(3, 40, 0), "live");
    const chair = byId(l, "chair");
    const [first, second] = evidenceRings(40, panelistRadius(3));
    const angleOf = (i: number) => Math.atan2(l.nodes.filter((n) => n.kind === "evidence")[i]!.y - chair.y, l.nodes.filter((n) => n.kind === "evidence")[i]!.x - chair.x);
    expect(angleOf(0)).toBeCloseTo(-Math.PI / 2 + Math.PI / first!.count, 5);
    expect(angleOf(first!.count)).toBeCloseTo(-Math.PI / 2, 5);
    expect(second!.count).toBeGreaterThan(0);
  });
  it("shows the evidence ring live, fades it in the outcome, and drops it in compact mode", () => {
    expect(flowLayout(live, "live").nodes.filter((n) => n.kind === "evidence" && !n.faded)).toHaveLength(live.evidence.items.length);
    expect(flowLayout(five, "map").nodes.filter((n) => n.kind === "evidence").every((n) => n.faded)).toBe(true);
    expect(flowLayout(live, "compact").nodes.some((n) => n.kind === "evidence")).toBe(false);
    expect(flowLayout(five, "map", true).nodes.some((n) => n.kind === "evidence")).toBe(false);
  });
  it("pulls all-flag units in closer than split ones", () => {
    const l = flowLayout(five, "map");
    const chair = byId(l, "chair");
    const mean = (cls: string) => {
      const units = five.units.filter((u) => u.cls === cls);
      return units.reduce((sum, u) => sum + dist(byId(l, `u:${u.id}`), chair), 0) / units.length;
    };
    expect(mean("all-flag")).toBeLessThan(mean("split"));
  });
  it("draws flagged edges solid and cleared ones dashed", () => {
    const l = flowLayout(trio, "map");
    expect(l.edges.find((e) => e.id === "x:aska:rollback-safety|guardian")).toMatchObject({ style: "solid", tone: "error" });
    expect(l.edges.find((e) => e.id === "x:aska:rollback-safety|planner")).toMatchObject({ style: "dashed", tone: "ok" });
  });
  it("lays quiet units in a faded band below the rings, in model order, with no edges", () => {
    for (const compact of [false, true]) {
      const l = flowLayout(trio, "map", compact);
      const quiet = trio.units.filter((u) => u.cls === "none").map((u) => byId(l, `u:${u.id}`));
      expect(quiet).toHaveLength(4);
      const ringBottom = Math.max(...l.nodes.filter((n) => n.kind === "panelist" || n.kind === "evidence").map((n) => n.y + n.r));
      for (const q of quiet) {
        expect(q).toMatchObject({ faded: true, tone: "muted" });
        expect(q.y).toBeGreaterThan(ringBottom);
        expect(l.edges.some((e) => e.to === q.id)).toBe(false);
      }
      const order = quiet.map((q) => [q.y, q.x] as const);
      for (let i = 1; i < order.length; i++) expect(order[i]![0] > order[i - 1]![0] || order[i]![1] > order[i - 1]![1]).toBe(true);
    }
  });
});

describe("tracks", () => {
  it("orders rows split, single-voice, all-flag, then the quiet ones, and puts dots on their stop", () => {
    const l = flowLayout(trio, "tracks");
    const contested = l.rows.filter((r) => !r.quiet).map((r) => r.unit);
    expect(contested).toEqual(["aska:delivery-speed", "aska:rollback-safety", "aska:scope-creep", "aska:plan-executability"]);
    expect(l.rows.slice(contested.length).every((r) => r.quiet)).toBe(true);
    expect(l.rows).toHaveLength(trio.units.length);
    const x = (stop: string) => l.stops.find((s) => s.stop === stop)!.x;
    expect(byId(l, "d:aska:rollback-safety|guardian").x).toBeCloseTo(x("high"));
    expect(byId(l, "d:aska:rollback-safety|planner").x).toBeCloseTo(x("cleared"));
    expect(byId(l, "d:aska:rollback-safety|guardian").spawnFrom).toBe("p:guardian");
    expect(l.nodes.some((n) => n.id === "d:aska:delivery-speed|guardian")).toBe(false);
  });
  it("gives quiet rows a faded unit and no dots", () => {
    const l = flowLayout(trio, "tracks");
    for (const r of l.rows.filter((x) => x.quiet)) {
      expect(byId(l, `u:${r.unit}`).faded).toBe(true);
      expect(l.nodes.some((n) => n.kind === "dot" && n.y === r.y)).toBe(false);
    }
  });
  it("fits every panelist side by side on any one stop, inside the stop's own width", () => {
    for (const n of [1, 3, 8, 12]) {
      const panelists = synth(n, 0, 0).panelists;
      const all: FlowModel = { ...synth(n, 0, 0), units: [{ id: "u", label: "u", cls: "all-flag", cells: panelists.map((p) => ({ panelist: p.id, position: "high", claim: null, why: null })) }] };
      const l = flowLayout(all, "tracks");
      const dots = l.nodes.filter((d) => d.kind === "dot");
      expect(dots).toHaveLength(n);
      const pitch = l.stops[1]!.x - l.stops[0]!.x;
      const high = l.stops.find((s) => s.stop === "high")!.x;
      for (const d of dots) expect(Math.abs(d.x - high) + d.r, `${n}`).toBeLessThanOrEqual(pitch / 2);
      expect(problems(l)).toEqual([]);
    }
  });
  it("keeps every dot clear of the label column", () => {
    for (const l of [flowLayout(trio, "tracks"), flowLayout(synth(12, 0, 30), "tracks")]) {
      const labelRight = l.rows[0]!.x + LABEL_W;
      for (const d of l.nodes.filter((n) => n.kind === "dot")) expect(d.x - d.r).toBeGreaterThanOrEqual(labelRight);
      expect(l.dotR).toBe(DOT_R);
    }
  });
  it("starts every row label clear of its unit marker (#1)", () => {
    for (const l of [flowLayout(trio, "tracks"), flowLayout(synth(12, 0, 30), "tracks")])
      for (const row of l.rows) {
        const marker = byId(l, `u:${row.unit}`);
        expect(marker.y).toBe(row.y);
        expect(row.x).toBeGreaterThanOrEqual(marker.x + marker.r + MARKER_GAP);
      }
  });
  it("holds the last row, quiet or not, inside bounds, and Fit frames it (#1)", () => {
    for (const model of [trio, five, synth(3, 0, 7), synth(12, 0, 30)]) {
      const l = flowLayout(model, "tracks");
      const last = l.rows[l.rows.length - 1]!;
      const marker = byId(l, `u:${last.unit}`);
      expect(last.y + LABEL_H / 2).toBeLessThanOrEqual(l.bounds.y + l.bounds.height);
      expect(marker.y + marker.r).toBeLessThanOrEqual(l.bounds.y + l.bounds.height);
      for (const vp of [{ width: 700, height: 320 }, { width: 1280, height: 420 }, { width: 360, height: 320 }]) {
        const cam = fit(l.bounds, vp);
        expect(cam.y + (last.y + LABEL_H / 2) * cam.scale).toBeLessThanOrEqual(vp.height);
        expect(cam.y + (l.rows[0]!.y - LABEL_H / 2) * cam.scale).toBeGreaterThanOrEqual(0);
      }
    }
  });
  it("spaces the legend at least a caption pitch apart, widening the world", () => {
    const l = flowLayout(synth(12, 0, 3), "tracks");
    const xs = l.nodes.filter((n) => n.kind === "panelist").map((n) => n.x);
    for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeGreaterThanOrEqual(CAPTION_PITCH - 1e-9);
    expect(l.bounds.x + l.bounds.width).toBeGreaterThan(xs[xs.length - 1]! + CAPTION_PITCH / 2);
  });
  it("grows the world downward, one fixed row per unit", () => {
    const l = flowLayout(synth(3, 0, 30), "tracks");
    const ys = l.rows.map((r) => r.y);
    for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!).toBe(40);
    expect(l.bounds.y + l.bounds.height).toBeGreaterThan(ys[ys.length - 1]!);
  });
  it("spreads dots that share a stop", () => {
    const stops = stopPositions(100, 300);
    const dots = trackDots(
      [
        { panelist: "a", position: "high", claim: null, why: null },
        { panelist: "b", position: "high", claim: null, why: null },
        { panelist: "c", position: null, claim: null, why: null },
      ],
      stops,
      9,
    );
    expect(dots.map((d) => d.panelist)).toEqual(["a", "b"]);
    expect(dots[1]!.x - dots[0]!.x).toBeCloseTo(20);
  });
});

// Review Focus 4: a run where every unit is quiet.
describe("an all-quiet run", () => {
  const quietOnly = (): FlowModel => {
    const model = synth(3, 4, 0);
    const units: FlowUnit[] = Array.from({ length: 5 }, (_, k) => ({ id: `q${k}`, label: `quiet-${k}`, cls: "none", cells: model.panelists.map((p) => ({ panelist: p.id, position: null, claim: null, why: null })) }));
    return { ...model, units };
  };
  it("gives every quiet unit a node, with no dots, edges or overlaps", () => {
    for (const m of ["map", "tracks"] as const)
      for (const compact of [false, true]) {
        const l = flowLayout(quietOnly(), m, compact);
        expect(l.nodes.filter((n) => n.kind === "unit")).toHaveLength(5);
        expect(l.nodes.some((n) => n.kind === "dot")).toBe(false);
        expect(l.edges.some((e) => e.id.startsWith("x:"))).toBe(false);
        expect(problems(l), `${m} ${compact}`).toEqual([]);
      }
    expect(flowLayout(quietOnly(), "tracks").rows.every((r) => r.quiet)).toBe(true);
  });
});

describe("helpers", () => {
  it("gives a caption its full reserved width at zoom 1, centred under its node (#1)", () => {
    for (const r of [8, 10, 12, 14, 18]) {
      const f = captionFrame(r);
      expect(f.width).toBe(CAPTION_W);
      expect(f.left + f.width / 2).toBe(r);
      expect(f.top).toBeGreaterThan(2 * r);
    }
  });
  it("draws each caption exactly where its reserved caption box is", () => {
    const l = flowLayout(five, "map");
    const boxes = captionBoxes(l);
    for (const n of l.nodes.filter((n) => n.kind !== "chair")) {
      const f = captionFrame(n.r);
      const drawn = { x: n.x - n.r + f.left, y: n.y - n.r + f.top, width: f.width };
      expect(boxes.some((b) => Math.abs(b.x - drawn.x) < 1e-9 && Math.abs(b.y - drawn.y) < 1e-9 && b.width === drawn.width), n.id).toBe(true);
    }
  });
  it("computes an edge box for a rotated line", () => {
    expect(edgeBox({ x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({ left: 0, top: 0, length: 10, angle: 0 });
    const v = edgeBox({ x: 0, y: 0 }, { x: 0, y: 10 });
    expect(v.left).toBeCloseTo(-5);
    expect(v.top).toBeCloseTo(5);
    expect(v.angle).toBeCloseTo(Math.PI / 2);
  });
  it("maps verdicts to ring tones", () => {
    expect(verdictTone("ok", "proceed")).toBe("ok");
    expect(verdictTone("ok", "proceed-with-conditions")).toBe("warning");
    expect(verdictTone("ok", "stop")).toBe("error");
    expect(verdictTone("ok", "insufficient-information")).toBe("muted");
    expect(verdictTone("malformed", null)).toBe("error");
    expect(verdictTone(null, "stop")).toBe("error");
    expect(verdictTone(null, null)).toBeNull();
  });
});

describe("live captions and emphasis", () => {
  it("has room for live captions on every full ring, and never in compact or Tracks", () => {
    for (const n of [1, 2, 6, 12]) {
      const l = flowLayout(synth(n, 8, 0), "live");
      expect(liveCaptionRoom("live", false), `${n}`).toBe(true);
      expect(problems(l)).toEqual([]);
    }
    expect(liveCaptionRoom("map", false)).toBe(true);
    expect(liveCaptionRoom("live", true)).toBe(false);
    expect(liveCaptionRoom("tracks", false)).toBe(false);
  });

  it("gives evidence nodes an emphasis equal to the share of panelists citing or reading them", () => {
    const m = buildFlowModel(run([row("a", "guardian"), row("b", "tester")]), null, {}, {
      byPanelist: {},
      files: [{ path: "x.ts", readers: ["guardian", "tester"], reads: 2, lastAt: 1 }, { path: "y.ts", readers: ["tester"], reads: 1, lastAt: 1 }],
      complete: true,
      watchingSince: null,
    });
    const f = flowLayout(m, "live");
    expect(f.nodes.find((n) => n.id === "e:x.ts")!.emphasis).toBe(1);
    expect(f.nodes.find((n) => n.id === "e:y.ts")!.emphasis).toBe(0.5);
    expect(f.nodes.find((n) => n.id === "chair")!.emphasis).toBe(0);
  });

  it("without activity, every evidence node has emphasis 0 at the collecting and outcome phases", () => {
    const fx = (f: string) => JSON.parse(readFileSync(join(__dirname, "../fixtures/runs/plan-trio", f), "utf8")) as unknown;
    const result = panelResultSchema.parse(fx("panel-result.json"));
    const judgments = result.panelists.map((p) => ({ persona: p.persona, judgment: p.judgment }));
    const brief = readFileSync(join(__dirname, "../fixtures/runs/plan-trio/brief.md"), "utf8");
    const collectingReport: RunReport = { source: "live", dir: "/tmp/aska-panel-Ab12Cd", brief, result: null, comparison: null, judgments, meta: null, compareError: null, timeline: null };
    const collecting = buildFlowModel(
      run([row("c1", "planner", "done"), row("c2", "guardian", "done"), row("c3", "accelerator", "done")]),
      collectingReport,
      {},
    );
    expect(collecting.phase).toBe("collecting");
    const collectingLayout = flowLayout(collecting, "map");
    expect(collectingLayout.nodes.filter((n) => n.kind === "evidence").length).toBeGreaterThan(0);
    expect(collectingLayout.nodes.filter((n) => n.kind === "evidence").every((n) => n.emphasis === 0)).toBe(true);

    const outcomeLayout = flowLayout(trio, "map");
    expect(outcomeLayout.nodes.filter((n) => n.kind === "evidence").length).toBeGreaterThan(0);
    expect(outcomeLayout.nodes.filter((n) => n.kind === "evidence").every((n) => n.emphasis === 0)).toBe(true);
  });

  it("at the outcome with activity, a cited file read by every panelist has emphasis 1", () => {
    const panelists = five.panelists.slice(0, 2);
    const m: FlowModel = {
      ...five,
      panelists,
      live: { complete: true, watchingSince: null },
      evidence: { items: [{ id: "x.ts", label: "x.ts", citedBy: ["a", "b"], count: 2, readBy: 2 }], byPanelist: {} },
    };
    expect(m.phase).toBe("outcome");
    const l = flowLayout(m, "map");
    expect(l.nodes.find((n) => n.id === "e:x.ts")!.emphasis).toBe(1);
  });
});
