import { Modal } from "@getpaseo/plugin/client/react-native";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useControlStyles } from "../../controls";
import type { FlowPanelist, FlowUnit } from "../../logic/flow/model";
import type { Theme } from "../../styles";
import { STOP_LABEL, Track } from "./Track";

const CLASS_LABEL: Record<FlowUnit["cls"], string> = { split: "split", "single-voice": "single voice", "all-flag": "all flag", none: "quiet" };
type Picked = string | null;

export function UnitDrawer({ theme, unit, panelists, onClose }: { theme: Theme; unit: FlowUnit | null; panelists: readonly FlowPanelist[]; onClose: () => void }) {
  const s = useControlStyles(theme);
  const [width, setWidth] = useState(300);
  const [picked, setPicked] = useState<Picked>(null);
  useEffect(() => {
    setPicked(null);
  }, [unit?.id]);
  const nameOf = (id: string) => panelists.find((p) => p.id === id)?.persona ?? id;
  return (
    <Modal title={unit ? `${unit.label} · ${CLASS_LABEL[unit.cls]}` : ""} open={unit !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <Modal.Content>
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {unit ? <Track theme={theme} unit={unit} panelists={panelists} width={width} onPickDot={setPicked} /> : null}
        </View>
        {unit?.cells.map((c) => (
          <View key={c.panelist} style={{ gap: 2 }}>
            <Text style={[s.text, c.panelist === picked ? { fontWeight: "700" as const } : null]}>
              {nameOf(c.panelist)}: <Text style={s.muted}>{c.position ? STOP_LABEL[c.position] : "not held"}</Text>
            </Text>
            {c.claim ? (
              <Text selectable style={s.text}>
                {c.claim}
              </Text>
            ) : null}
            {c.why ? <Text style={s.muted}>{c.why}</Text> : null}
          </View>
        ))}
      </Modal.Content>
    </Modal>
  );
}
