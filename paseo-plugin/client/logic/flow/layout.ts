import type { Tone } from "../catalog";
import type { Bounds, XY } from "./camera";
import { TRACK_STOPS, type FlowCell, type FlowModel, type FlowUnit, type TrackStop } from "./model";

export type FlowMode = "live" | "map" | "tracks" | "compact";
export type NodeKind = "chair" | "panelist" | "evidence" | "unit" | "dot";
export interface LayoutNode {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  r: number;
  tone: Tone;
  ring: Tone | null;
  label: string;
  faded: boolean;
  spawnFrom: string | null;
  ref: string | null;
  emphasis: number;
}
export interface LayoutEdge {
  id: string;
  from: string;
  to: string;
  style: "solid" | "dashed";
  tone: Tone;
  weight: number;
}
// A Tracks row: its unit, and its label's left edge (x) and centre line (y).
export interface TrackRow {
  unit: string;
  label: string;
  x: number;
  y: number;
  quiet: boolean;
}
export interface StopX {
  stop: TrackStop;
  x: number;
}
// World coordinates are px at zoom 1, shifted so that `bounds` starts at (0, 0): nothing sits at
// negative coordinates. `origin` is that shift (normalise's dx/dy), so a held camera can tell how
// far the world moved under it as the layout changes.
export interface FlowLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  rows: TrackRow[];
  stops: StopX[];
  dotR: number;
  bounds: Bounds;
  origin: XY;
}

const MIN_SPACING = 8;
export const CAPTION_W = 120;
const CAPTION_H = 16;
export const CAPTION_GAP = 2;
export const CAPTION_PITCH = CAPTION_W + 12;
export const INNER_MIN = 100;
export const RING_GAP = CAPTION_PITCH;
const LABEL_X = 4;
// A Tracks row's unit marker sits at the left of the label column, and the label starts after it.
const MARKER_R = 4;
export const MARKER_GAP = 4;
const ROW_LABEL_X = LABEL_X + 2 * MARKER_R + MARKER_GAP;
export const LABEL_W = 200;
export const LABEL_H = 24;
const ROW_H = 40;
export const DOT_R = 9;
const STOP_MIN = 60;
const MARGIN = 20;
const QUIET_ROW = 48;
const TRACKS_TOP = 64;
const STOP_LABEL_W = 60;
const STOP_LABEL_ABOVE = 30;
const STOP_LABEL_H = 14;
const SETTLE_STEPS = 4000;
const CLASS_ORDER: Record<FlowUnit["cls"], number> = { split: 0, "single-voice": 1, "all-flag": 2, none: 3 };
const SEVERITY_WEIGHT: Record<TrackStop, number> = { high: 3, medium: 2, low: 1, cleared: 0.5, "not-raised": 0 };

export function verdictTone(status: string | null, verdict: string | null): Tone | null {
  if (status !== null && status !== "ok") return "error";
  if (verdict === null) return null;
  if (verdict === "proceed") return "ok";
  if (verdict === "proceed-with-conditions") return "warning";
  if (verdict === "stop") return "error";
  return "muted";
}

function stateTone(state: string): Tone {
  if (state === "running") return "warning";
  if (state === "done") return "ok";
  if (state === "failed") return "error";
  return "muted";
}

export function stopTone(stop: TrackStop): Tone {
  if (stop === "high") return "error";
  if (stop === "medium") return "warning";
  if (stop === "cleared") return "ok";
  return "muted";
}

export function stopPositions(left: number, right: number): StopX[] {
  return TRACK_STOPS.map((stop, i) => ({ stop, x: left + ((right - left) * i) / (TRACK_STOPS.length - 1) }));
}

// Dots on one track; dots that share a stop are spread side by side, centred on the stop.
export function trackDots(cells: readonly FlowCell[], stops: readonly StopX[], r: number): { panelist: string; position: TrackStop; x: number }[] {
  const placed = cells.filter((c): c is FlowCell & { position: TrackStop } => c.position !== null);
  return placed.map((c) => {
    const same = placed.filter((o) => o.position === c.position);
    const k = same.indexOf(c);
    const base = stops.find((s) => s.stop === c.position)!.x;
    return { panelist: c.panelist, position: c.position, x: base + (k - (same.length - 1) / 2) * (2 * r + 2) };
  });
}

// A line from a to b as a box centred on its midpoint, rotated by `angle` radians.
export function edgeBox(a: { x: number; y: number }, b: { x: number; y: number }): { left: number; top: number; length: number; angle: number } {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  return { left: (a.x + b.x) / 2 - length / 2, top: (a.y + b.y) / 2, length, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

const clamp = (v: number, lo: number, hi: number): number => (hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));

// Panelists, evidence and Map units have a caption. The chair has none. Tracks dots are named by
// their row label and the legend, and a Tracks unit's caption is its row label.
function hasCaption(node: LayoutNode, tracks: boolean): boolean {
  return node.kind === "panelist" || node.kind === "evidence" || (node.kind === "unit" && !tracks);
}

// The room reserved below a node for its one-line caption, centred on it.
function captionBox(node: LayoutNode): Bounds {
  return { x: node.x - CAPTION_W / 2, y: node.y + node.r + CAPTION_GAP, width: CAPTION_W, height: CAPTION_H };
}

// The same caption box relative to the node's own top-left corner, where FlowCanvas draws it.
export function captionFrame(r: number): { left: number; top: number; width: number; height: number } {
  return { left: r - CAPTION_W / 2, top: 2 * r + CAPTION_GAP, width: CAPTION_W, height: CAPTION_H };
}

// Every caption box in a layout: the nodes' captions, and Tracks' row labels.
export function captionBoxes(flow: Pick<FlowLayout, "nodes" | "rows">): Bounds[] {
  const tracks = flow.rows.length > 0;
  const boxes = flow.nodes.filter((n) => hasCaption(n, tracks)).map(captionBox);
  for (const row of flow.rows) boxes.push({ x: row.x, y: row.y - LABEL_H / 2, width: LABEL_W, height: LABEL_H });
  return boxes;
}

const circleBox = (n: LayoutNode): Bounds => ({ x: n.x - n.r, y: n.y - n.r, width: 2 * n.r, height: 2 * n.r });

function union(boxes: readonly Bounds[]): Bounds {
  if (boxes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, width: Math.max(...boxes.map((b) => b.x + b.width)) - x, height: Math.max(...boxes.map((b) => b.y + b.height)) - y };
}

const grow = (b: Bounds, m: number): Bounds => ({ x: b.x - m, y: b.y - m, width: b.width + 2 * m, height: b.height + 2 * m });

// Shifts a layout so its bounds start at (0, 0). Every node then lies inside the camera's
// transformed view, which is the world's size: Android only delivers touches inside a parent's box.
function normalise(flow: Omit<FlowLayout, "origin">): FlowLayout {
  const dx = -flow.bounds.x;
  const dy = -flow.bounds.y;
  return {
    ...flow,
    nodes: flow.nodes.map((n) => ({ ...n, x: n.x + dx, y: n.y + dy })),
    rows: flow.rows.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy })),
    stops: flow.stops.map((st) => ({ ...st, x: st.x + dx })),
    bounds: { x: 0, y: 0, width: flow.bounds.width, height: flow.bounds.height },
    origin: { x: dx, y: dy },
  };
}

// A ring node's footprint: its circle, plus its caption box when it has one.
const footprint = (n: LayoutNode): Bounds => (hasCaption(n, false) ? union([circleBox(n), captionBox(n)]) : circleBox(n));

function worstTone(u: FlowUnit): Tone {
  const stops = u.cells.map((c) => c.position);
  if (stops.includes("high")) return "error";
  if (stops.includes("medium")) return "warning";
  return "muted";
}

const clear = (a: Bounds, b: Bounds): boolean =>
  a.x >= b.x + b.width + MIN_SPACING || b.x >= a.x + a.width + MIN_SPACING || a.y >= b.y + b.height + MIN_SPACING || b.y >= a.y + a.height + MIN_SPACING;

// Moves one unit until its footprint is MIN_SPACING clear of every obstacle. It tries positions
// nearest its start first; each blocked position offers the four pushes that clear the box in the
// way, so the axis of least overlap comes first. Deterministic, and it never clamps.
function settle(unit: LayoutNode, obstacles: readonly Bounds[]): void {
  const start = { x: unit.x, y: unit.y };
  const queue = [{ x: unit.x, y: unit.y, cost: 0 }];
  const seen: Record<string, boolean> = {};
  for (let step = 0; step < SETTLE_STEPS && queue.length > 0; step++) {
    queue.sort((a, b) => a.cost - b.cost || a.y - b.y || a.x - b.x);
    const at = queue.shift()!;
    unit.x = at.x;
    unit.y = at.y;
    const box = footprint(unit);
    const hit = obstacles.find((o) => !clear(box, o));
    if (!hit) return;
    const pushes = [
      { x: at.x + hit.x + hit.width + MIN_SPACING - box.x, y: at.y },
      { x: at.x - (box.x + box.width + MIN_SPACING - hit.x), y: at.y },
      { x: at.x, y: at.y + hit.y + hit.height + MIN_SPACING - box.y },
      { x: at.x, y: at.y - (box.y + box.height + MIN_SPACING - hit.y) },
    ];
    for (const p of pushes) {
      const key = `${Math.round(p.x)},${Math.round(p.y)}`;
      if (seen[key]) continue;
      seen[key] = true;
      queue.push({ ...p, cost: Math.hypot(p.x - start.x, p.y - start.y) });
    }
  }
  // Out of steps: below everything, which is always clear.
  unit.y = Math.max(...obstacles.map((o) => o.y + o.height)) + MIN_SPACING + unit.r;
}

// Settles the contested units one at a time, in model order, against everything placed so far.
// Panelists, evidence, the chair and the quiet band stay put.
function relax(nodes: readonly LayoutNode[], movable: readonly LayoutNode[]): void {
  const obstacles = nodes.filter((n) => !movable.includes(n)).map(footprint);
  for (const unit of movable) {
    settle(unit, obstacles);
    obstacles.push(footprint(unit));
  }
}

// The panelist ring, sized by the chord, so neighbouring captions are at least CAPTION_PITCH apart.
export function panelistRadius(n: number): number {
  return n >= 2 ? Math.max(INNER_MIN, CAPTION_PITCH / (2 * Math.sin(Math.PI / n))) : INNER_MIN;
}

// How many files fit on a ring of radius r, one chord pitch apart.
export function ringCapacity(r: number): number {
  return Math.max(1, Math.floor(Math.PI / Math.asin(Math.min(1, CAPTION_PITCH / (2 * r)))));
}

// Concentric evidence rings, filled inside out: ring k (from 1) is innerR + k × RING_GAP across,
// and the last one holds what's left.
export function evidenceRings(m: number, innerR: number): { r: number; count: number }[] {
  const rings: { r: number; count: number }[] = [];
  for (let left = m, k = 1; left > 0; k++) {
    const r = innerR + k * RING_GAP;
    const count = Math.min(left, ringCapacity(r));
    rings.push({ r, count });
    left -= count;
  }
  return rings;
}

function ringLayout(model: FlowModel, mode: Exclude<FlowMode, "tracks">, compactFlag: boolean): FlowLayout {
  const compact = mode === "compact" || compactFlag;
  const n = model.panelists.length;
  const innerR = panelistRadius(n);
  const pr = compact ? 14 : 18;
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  const base = { faded: false, spawnFrom: null, ring: null, emphasis: 0 } as const;
  nodes.push({ ...base, id: "chair", kind: "chair", x: 0, y: 0, r: 10, tone: "muted", label: "chair", ref: null });

  const at = new Map<string, { x: number; y: number }>();
  model.panelists.forEach((p, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n);
    const x = innerR * Math.cos(a);
    const y = innerR * Math.sin(a);
    at.set(p.id, { x, y });
    nodes.push({ ...base, id: `p:${p.id}`, kind: "panelist", x, y, r: pr, tone: stateTone(p.state), ring: verdictTone(p.status, p.verdict), label: p.initial, ref: p.id });
    edges.push({ id: `s:${p.id}`, from: "chair", to: `p:${p.id}`, style: p.state === "done" ? "solid" : "dashed", tone: "muted", weight: 1 });
  });

  const outcome = model.phase === "outcome";
  let ringR = innerR;
  if (!compact) {
    const items = model.evidence.items;
    const rings = evidenceRings(items.length, innerR);
    if (rings.length > 0) ringR = rings[rings.length - 1]!.r;
    const panelistsN = Math.max(1, n);
    let next = 0;
    rings.forEach((ring, k) => {
      // Each ring is offset by half a slot from the one inside it.
      const offset = k % 2 === 0 ? 0.5 : 0;
      items.slice(next, next + ring.count).forEach((e, j) => {
        const a = -Math.PI / 2 + (2 * Math.PI * (j + offset)) / ring.count;
        const emphasis = model.live === null ? 0 : outcome ? clamp((e.readBy ?? 0) / panelistsN, 0, 1) : clamp(e.citedBy.length / panelistsN, 0, 1);
        nodes.push({ ...base, id: `e:${e.id}`, kind: "evidence", x: ring.r * Math.cos(a), y: ring.r * Math.sin(a), r: 8, tone: "muted", label: e.label, faded: outcome, ref: e.id, emphasis });
      });
      next += ring.count;
    });
    if (!outcome) {
      const shown = new Set(items.map((e) => e.id));
      for (const p of model.panelists) {
        for (const id of p.evidence) {
          if (shown.has(id)) edges.push({ id: `c:${p.id}|${id}`, from: `p:${p.id}`, to: `e:${id}`, style: "solid", tone: "muted", weight: 1 });
        }
      }
    }
  }

  const contested: LayoutNode[] = [];
  if (outcome && mode === "map") {
    // Quiet units: a grid band centred below the outermost ring, one caption pitch apart, in model order.
    const quiet = model.units.filter((u) => u.cls === "none");
    const cols = Math.floor((2 * ringR) / CAPTION_PITCH) + 1;
    const top = ringR + pr + CAPTION_GAP + CAPTION_H + 3 * MIN_SPACING + 10;
    quiet.forEach((u, k) => {
      const row = Math.floor(k / cols);
      const inRow = Math.min(cols, quiet.length - row * cols);
      const x = (k - row * cols - (inRow - 1) / 2) * CAPTION_PITCH;
      nodes.push({ ...base, id: `u:${u.id}`, kind: "unit", x, y: top + row * QUIET_ROW, r: 10, tone: "muted", label: u.label, faded: true, spawnFrom: "chair", ref: u.id });
    });
    for (const u of model.units) {
      if (u.cls === "none") continue;
      let sx = 0;
      let sy = 0;
      let sw = 0;
      for (const cell of u.cells) {
        const p = at.get(cell.panelist);
        const w = cell.position ? SEVERITY_WEIGHT[cell.position] : 0;
        if (!p || w === 0) continue;
        sx += p.x * w;
        sy += p.y * w;
        sw += w;
      }
      const pull = u.cls === "all-flag" ? 0.4 : 1;
      const x = sw > 0 ? (sx / sw) * pull : 0;
      const y = sw > 0 ? (sy / sw) * pull : 0;
      const node: LayoutNode = { ...base, id: `u:${u.id}`, kind: "unit", x, y, r: 10, tone: worstTone(u), label: u.label, spawnFrom: "chair", ref: u.id };
      nodes.push(node);
      contested.push(node);
      for (const cell of u.cells) {
        if (!cell.position || cell.position === "not-raised") continue;
        const cleared = cell.position === "cleared";
        edges.push({
          id: `x:${u.id}|${cell.panelist}`,
          from: `p:${cell.panelist}`,
          to: `u:${u.id}`,
          style: cleared ? "dashed" : "solid",
          tone: stopTone(cell.position),
          weight: cleared ? 1 : 2,
        });
      }
    }
  }

  relax(nodes, contested);
  const bounds = grow(union([...nodes.map(circleBox), ...captionBoxes({ nodes, rows: [] })]), MARGIN);
  return normalise({ nodes, edges, rows: [], stops: [], dotR: 0, bounds });
}

// Live captions show on the full ring, whose radius guarantees their room.
export function liveCaptionRoom(mode: FlowMode, compact: boolean): boolean {
  return !compact && mode !== "tracks";
}

function tracksLayout(model: FlowModel): FlowLayout {
  const n = model.panelists.length;
  const pitch = Math.max(STOP_MIN, n * (2 * DOT_R + 2) + 8);
  const first = ROW_LABEL_X + LABEL_W + MIN_SPACING + pitch / 2;
  const last = first + (TRACK_STOPS.length - 1) * pitch;
  const stops = stopPositions(first, last);
  const nodes: LayoutNode[] = [];
  const base = { faded: false, spawnFrom: null, ring: null, emphasis: 0 } as const;
  const legendY = MARGIN;
  nodes.push({ ...base, id: "chair", kind: "chair", x: MARGIN, y: legendY, r: 8, tone: "muted", label: "chair", faded: true, ref: null });
  const spacing = n > 1 ? Math.max((last - first) / (n - 1), CAPTION_PITCH) : 0;
  model.panelists.forEach((p, i) => {
    const x = n === 1 ? (first + last) / 2 : first + spacing * i;
    nodes.push({ ...base, id: `p:${p.id}`, kind: "panelist", x, y: legendY, r: 12, tone: stateTone(p.state), ring: verdictTone(p.status, p.verdict), label: p.initial, ref: p.id });
  });
  const contested = model.units.filter((u) => u.cls !== "none").sort((a, b) => CLASS_ORDER[a.cls] - CLASS_ORDER[b.cls]);
  const quiet = model.units.filter((u) => u.cls === "none");
  const rows: TrackRow[] = [];
  const initialOf = new Map(model.panelists.map((p) => [p.id, p.initial]));
  [...contested, ...quiet].forEach((u, k) => {
    const y = TRACKS_TOP + ROW_H * (k + 0.5);
    const isQuiet = u.cls === "none";
    rows.push({ unit: u.id, label: u.label, x: ROW_LABEL_X, y, quiet: isQuiet });
    nodes.push({ ...base, id: `u:${u.id}`, kind: "unit", x: LABEL_X + MARKER_R, y, r: MARKER_R, faded: true, tone: isQuiet ? "muted" : worstTone(u), label: u.label, ref: u.id });
    if (isQuiet) return;
    for (const d of trackDots(u.cells, stops, DOT_R)) {
      nodes.push({
        ...base,
        id: `d:${u.id}|${d.panelist}`,
        kind: "dot",
        x: d.x,
        y,
        r: DOT_R,
        tone: stopTone(d.position),
        label: initialOf.get(d.panelist) ?? "?",
        spawnFrom: `p:${d.panelist}`,
        ref: `${u.id}|${d.panelist}`,
      });
    }
  });
  const boxes = [...nodes.map(circleBox), ...captionBoxes({ nodes, rows })];
  if (contested.length > 0) {
    // The stop labels above the first track, and each stop's full width.
    const y = TRACKS_TOP + ROW_H / 2 - STOP_LABEL_ABOVE;
    boxes.push({ x: first - pitch / 2, y, width: last - first + pitch, height: STOP_LABEL_H });
    for (const s of stops) boxes.push({ x: s.x - STOP_LABEL_W / 2, y, width: STOP_LABEL_W, height: STOP_LABEL_H });
  }
  return normalise({ nodes, edges: [], rows, stops, dotR: DOT_R, bounds: grow(union(boxes), MARGIN) });
}

export function flowLayout(model: FlowModel, mode: FlowMode, compact = false): FlowLayout {
  return mode === "tracks" ? tracksLayout(model) : ringLayout(model, mode, compact);
}
