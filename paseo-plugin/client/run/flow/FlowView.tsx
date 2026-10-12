import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import type { RunActivity } from "../../../shared/activity";
import type { LiveRun } from "../../../shared/recognize";
import type { RunReport } from "../../../shared/runs";
import { Segmented, useControlStyles } from "../../controls";
import { caption, liveActivity, type LiveActivity } from "../../logic/flow/activity";
import { flowLayout, liveCaptionRoom, type FlowMode, type LayoutNode } from "../../logic/flow/layout";
import { bumpFlashes, buildFlowModel, diffBase, particleReads, searchFlashes, type FlowModel, type FlowPanelist, type StartTimes } from "../../logic/flow/model";
import { fmtElapsed, verdictPill } from "../../logic/report";
import type { Layout, Theme } from "../../styles";
import { FlowCanvas, type NodeBadge, type Particle, type Point } from "./FlowCanvas";
import { FlowViewport } from "./FlowViewport";
import { STOP_LABEL } from "./Track";
import { UnitDrawer } from "./UnitDrawer";
import { useNow, useReduceMotion } from "./useMotion";

type Choice = "map" | "tracks";
type Selection = { kind: "panelist" | "evidence" | "dot"; ref: string } | null;
type Drawer = string | null;
type Particles = Particle[];
type Positions = Map<string, Point>;
type Flashes = Record<string, number>;

// Set when an archived run is replayed: the replayed activity, the replayed clock, and a counter
// that changes on every jump (a scrub or a prev/next step), so a jump doesn't animate.
export interface ReplayFrame {
  live: LiveActivity | null;
  now: number;
  jump: number;
}

const MAX_PARTICLES = 20;
const CHOICES: readonly { value: Choice; label: string }[] = [
  { value: "map", label: "Map" },
  { value: "tracks", label: "Tracks" },
];

function stateText(p: FlowPanelist, now: number): string {
  if (p.state === "running") return p.startedAt !== null ? `running ${fmtElapsed(now - p.startedAt)}` : "running";
  if (p.state === "done") return "done";
  if (p.state === "failed") return "failed";
  if (p.state === "canceled") return "canceled";
  return "waiting";
}

export function FlowView({
  theme,
  layout,
  run,
  report,
  startedAt,
  activity,
  replay = null,
}: {
  theme: Theme;
  layout: Layout;
  run: LiveRun;
  report: RunReport | null;
  startedAt: StartTimes;
  activity: RunActivity | null;
  replay?: ReplayFrame | null;
}) {
  const s = useControlStyles(theme);
  const reduce = useReduceMotion();
  const computed = useMemo(() => liveActivity(run, activity, report?.brief ?? null), [run, activity, report]);
  const live = replay ? replay.live : computed;
  const model = useMemo(() => buildFlowModel(run, report, startedAt, live), [run, report, startedAt, live]);
  const [choice, setChoice] = useState<Choice>(layout.compact ? "tracks" : "map");
  const outcome = model.phase === "outcome";
  const mode: FlowMode = outcome ? choice : layout.compact ? "compact" : "live";
  const flow = useMemo(() => flowLayout(model, mode, layout.compact), [model, mode, layout.compact]);
  const ticking = useNow(replay === null && model.panelists.some((p) => p.state === "running"));
  const now = replay ? replay.now : ticking;
  const [selected, setSelected] = useState<Selection>(null);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [particles, setParticles] = useState<Particles>([]);
  const [flashes, setFlashes] = useState<Flashes>({});
  const flash = useCallback((ids: string[], nodeIds: string[]) => setFlashes((cur) => bumpFlashes(cur, ids, nodeIds)), []);

  // Positions from the previous layout: nodes spring from there (or from their spawnFrom node).
  // Shifted by the change in the world's origin, so a node doesn't spring across the distance
  // normalise's shift moved everything by (e.g. as live evidence arrives).
  const previous = useRef<Positions>(new Map());
  const lastFlow = useRef(flow);
  if (lastFlow.current !== flow) {
    const dx = flow.origin.x - lastFlow.current.origin.x;
    const dy = flow.origin.y - lastFlow.current.origin.y;
    previous.current = new Map(lastFlow.current.nodes.map((n) => [n.id, { x: n.x + dx, y: n.y + dy }]));
    lastFlow.current = flow;
  }

  // Particles: panelist → newly cited evidence (or newly read file, once live), and panelist → chair
  // when it finishes. Under reduce-motion, particles are discarded but reads still flash their node.
  const lastModel = useRef(model);
  const jump = replay?.jump ?? 0;
  const lastJump = useRef(jump);
  useEffect(() => {
    const jumped = lastJump.current !== jump;
    lastJump.current = jump;
    const before = diffBase(lastModel.current, model, jumped);
    lastModel.current = model;
    const pos = new Map(flow.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    const fresh: Particle[] = [];
    const flashIds: string[] = [];
    for (const p of model.panelists) {
      const old = before.panelists.find((o) => o.id === p.id);
      const from = pos.get(`p:${p.id}`);
      if (from) {
        if (model.live === null) {
          for (const eid of p.evidence) {
            const to = pos.get(`e:${eid}`);
            if (to && !(old?.evidence ?? []).includes(eid)) fresh.push({ id: `c:${p.id}|${eid}|${Date.now()}`, from, to, tone: "ok" });
          }
        }
        const chair = pos.get("chair");
        if (chair && old?.state === "running" && p.state === "done") fresh.push({ id: `f:${p.id}|${Date.now()}`, from, to: chair, tone: "ok" });
      }
    }
    for (const id of searchFlashes(before, model)) flashIds.push(`p:${id}`);
    if (model.live !== null) {
      for (const { panelist, ref } of particleReads(before, model)) {
        const from = pos.get(`p:${panelist}`);
        // A read with no evidence node (compact mode has no ring) is dropped.
        const to = ref !== null ? pos.get(`e:${ref}`) : undefined;
        if (!from || !to) continue;
        if (reduce) flashIds.push(`e:${ref}`);
        else fresh.push({ id: `r:${panelist}|${ref}|${Date.now()}|${fresh.length}`, from, to, tone: "ok" });
      }
    }
    if (flashIds.length > 0) flash(flashIds, [...pos.keys()]);
    if (!reduce && fresh.length > 0) setParticles((cur) => [...cur, ...fresh].slice(0, MAX_PARTICLES));
  }, [model, flow, reduce, flash, jump]);
  const onParticleDone = useCallback((id: string) => setParticles((cur) => cur.filter((p) => p.id !== id)), []);
  useEffect(() => {
    if (reduce) setParticles([]);
  }, [reduce]);

  const room = liveCaptionRoom(mode, layout.compact);
  const panelistOf = (id: string) => model.panelists.find((p) => p.id === id);
  const captionOf = (node: LayoutNode): string => {
    if (node.kind === "panelist") {
      const p = panelistOf(node.ref ?? "");
      if (!p) return "";
      if (mode === "tracks") return p.persona;
      const liveText = room && p.live ? caption(p.live, p.state === "running", now) : null;
      return `${p.persona} · ${liveText ?? stateText(p, now)}`;
    }
    if (node.kind === "unit") return mode === "tracks" ? "" : node.label;
    if (node.kind === "evidence") {
      const item = model.evidence.items.find((e) => e.id === node.ref);
      return node.label + (item?.readBy ? ` · read ${item.readBy}` : "");
    }
    return "";
  };
  const badgeOf = (node: LayoutNode): NodeBadge => {
    if (node.kind !== "panelist") return null;
    const p = panelistOf(node.ref ?? "");
    if (!p) return null;
    if (p.reask && p.state === "running") return "reask";
    if (p.state === "done") return "done";
    return null;
  };
  const labelOf = (node: LayoutNode): string => {
    if (node.kind === "panelist") {
      const p = panelistOf(node.ref ?? "");
      return p ? `${p.persona}, ${stateText(p, now)}${p.verdict ? `, ${verdictPill(p.persona, p.status ?? "ok", p.verdict).label}` : ""}` : node.label;
    }
    if (node.kind === "dot") {
      const [unitId, panelistId] = (node.ref ?? "").split("|");
      const unit = model.units.find((u) => u.id === unitId);
      const cell = unit?.cells.find((c) => c.panelist === panelistId);
      const p = panelistOf(panelistId ?? "");
      return `${p?.persona ?? panelistId ?? ""}, ${unit?.label ?? ""}, ${cell?.position ? STOP_LABEL[cell.position] : "not held"}`;
    }
    return node.label;
  };
  const onPress = (node: LayoutNode) => {
    if (!node.ref) return;
    if (node.kind === "unit") setDrawer(node.ref);
    else if (node.kind === "panelist" || node.kind === "evidence" || node.kind === "dot") setSelected({ kind: node.kind, ref: node.ref });
  };

  const done = model.panelists.filter((p) => p.state === "done").length;
  const status =
    model.phase === "running"
      ? `${done} of ${model.panelists.length} panelists done`
      : model.phase === "collecting"
        ? `${run.judgmentsSaved.length} of ${model.panelists.length} judgments in`
        : `${model.units.filter((u) => u.cls !== "none").length} contested units`;

  return (
    <View style={{ gap: 8 }}>
      {outcome ? <Segmented theme={theme} label="Flow layout" options={CHOICES} value={choice} onChange={setChoice} /> : null}
      <FlowViewport theme={theme} compact={layout.compact} bounds={flow.bounds} origin={flow.origin} modeKey={mode} jump={jump} reduce={reduce}>
        {(captions) => (
          <FlowCanvas
            theme={theme}
            flow={flow}
            previous={previous.current}
            reduce={reduce}
            captions={captions}
            pulsing={(n) => n.kind === "panelist" && panelistOf(n.ref ?? "")?.state === "running"}
            flashOf={(n) => flashes[n.id] ?? 0}
            badgeOf={badgeOf}
            captionOf={captionOf}
            labelOf={labelOf}
            particles={particles}
            onParticleDone={onParticleDone}
            onPress={onPress}
          />
        )}
      </FlowViewport>
      <Text style={s.muted}>{status}</Text>
      {model.live && !model.live.complete && model.live.watchingSince && model.panelists.some((p) => p.live && p.live.recent.length > 0) ? (
        <Text style={s.muted}>activity since {new Date(model.live.watchingSince).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
      ) : null}
      {selected ? <Detail theme={theme} selection={selected} model={model} now={now} onClose={() => setSelected(null)} /> : null}
      <UnitDrawer theme={theme} unit={model.units.find((u) => u.id === drawer) ?? null} panelists={model.panelists} onClose={() => setDrawer(null)} />
    </View>
  );
}

function Detail({
  theme,
  selection,
  model,
  now,
  onClose,
}: {
  theme: Theme;
  selection: NonNullable<Selection>;
  model: FlowModel;
  now: number;
  onClose: () => void;
}) {
  const s = useControlStyles(theme);
  let lines: string[] = [];
  if (selection.kind === "panelist") {
    const p = model.panelists.find((x) => x.id === selection.ref);
    if (p) {
      lines = [
        `${p.persona} · ${stateText(p, now)}`,
        p.verdict || p.status ? `verdict: ${verdictPill(p.persona, p.status ?? "ok", p.verdict).label}` : "",
        p.error ? `error: ${p.error}` : "",
        p.evidence.length > 0 ? `cites: ${p.evidence.map((id) => model.evidence.items.find((e) => e.id === id)?.label ?? id).join(", ")}` : "",
        p.live ? `${p.live.counts.reads} reads · ${p.live.counts.searches} searches` : "",
        p.live && p.live.recent.length > 0 ? "Recent activity" : "",
        ...(p.live?.recent ?? [])
          .slice()
          .reverse()
          .map((r) => `${r.kind === "read" ? "read" : r.kind === "search" ? "search" : "tool"} ${r.kind === "search" ? `'${r.target ?? ""}'` : (r.target ?? "").split("/").pop() ?? ""} · ${fmtElapsed(Math.max(0, now - r.at))} ago`),
      ];
    }
  } else if (selection.kind === "evidence") {
    const e = model.evidence.items.find((x) => x.id === selection.ref);
    if (e) lines = [e.id, `cited by ${e.citedBy.join(", ")} (${e.count}×)`];
  } else {
    const [unitId, panelistId] = selection.ref.split("|");
    const unit = model.units.find((u) => u.id === unitId);
    const cell = unit?.cells.find((c) => c.panelist === panelistId);
    if (unit && cell) lines = [`${unit.label} · ${model.panelists.find((p) => p.id === cell.panelist)?.persona ?? cell.panelist}: ${cell.position ? STOP_LABEL[cell.position] : "not held"}`, cell.claim ?? "", cell.why ?? ""];
  }
  return (
    <View style={[s.entry, { gap: 4 }]}>
      {lines
        .filter((l) => l !== "")
        .map((l, i) => (
          <Text key={i} selectable style={i === 0 ? s.text : s.muted}>
            {l}
          </Text>
        ))}
      <Text accessibilityRole="button" onPress={onClose} style={s.muted}>
        Close
      </Text>
    </View>
  );
}
