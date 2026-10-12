import { Modal, ScrollView } from "@getpaseo/plugin/client/react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Comparison } from "../../shared/runs";
import { useControlStyles } from "../controls";
import { gridRows, shortPersona, type CellView, type UnitRowView } from "../logic/report";
import { toneColor, type Layout, type Theme } from "../styles";

type Picked = { unit: string; cell: CellView } | null;

const CLASS_LABEL: Record<UnitRowView["cls"], string> = { split: "split", "single-voice": "single voice", "all-flag": "all flag", none: "quiet" };
const CELL_WIDTH = 104;

function Cell({ theme, row, cell, onPick }: { theme: Theme; row: UnitRowView; cell: CellView; onPick: (p: Picked) => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.unit}, ${shortPersona(cell.persona)}: ${cell.label}`}
      onPress={() => onPick({ unit: row.unit, cell })}
      style={{ width: CELL_WIDTH, paddingVertical: 6, paddingHorizontal: 4 }}
    >
      <Text style={{ color: toneColor(theme, cell.tone), fontSize: 13 }}>{cell.label}</Text>
    </Pressable>
  );
}

function Table({ theme, rows, personas, onPick }: { theme: Theme; rows: readonly UnitRowView[]; personas: readonly string[]; onPick: (p: Picked) => void }) {
  const s = useControlStyles(theme);
  return (
    <ScrollView horizontal style={{ flexGrow: 0 }}>
      <View>
        <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
          <Text style={[s.label, { width: 180, paddingVertical: 6 }]}>unit</Text>
          {personas.map((p) => (
            <Text key={p} style={[s.label, { width: CELL_WIDTH, paddingVertical: 6 }]}>
              {shortPersona(p)}
            </Text>
          ))}
        </View>
        {rows.map((row) => (
          <View key={row.unit} style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
            <View style={{ width: 180, paddingVertical: 6 }}>
              <Text style={s.text}>{shortPersona(row.unit)}</Text>
              <Text style={s.muted}>{CLASS_LABEL[row.cls]}</Text>
            </View>
            {row.cells.map((cell) => (
              <Cell key={cell.persona} theme={theme} row={row} cell={cell} onPick={onPick} />
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// `personas` is unused here; it keeps the props identical to Table's so either can render as Body.
function Cards({ theme, rows, onPick }: { theme: Theme; rows: readonly UnitRowView[]; personas: readonly string[]; onPick: (p: Picked) => void }) {
  const s = useControlStyles(theme);
  return (
    <View style={{ gap: 8 }}>
      {rows.map((row) => (
        <View key={row.unit} style={[s.entry, { gap: 4 }]}>
          <Text style={s.text}>
            {shortPersona(row.unit)} · <Text style={s.muted}>{CLASS_LABEL[row.cls]}</Text>
          </Text>
          {row.cells.map((cell) => (
            <Pressable key={cell.persona} accessibilityRole="button" accessibilityLabel={`${shortPersona(cell.persona)}: ${cell.label}`} onPress={() => onPick({ unit: row.unit, cell })}>
              <Text style={s.muted}>
                {shortPersona(cell.persona)}: <Text style={{ color: toneColor(theme, cell.tone) }}>{cell.label}</Text>
              </Text>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

export function UnitsTab({ theme, layout, comparison }: { theme: Theme; layout: Layout; comparison: Comparison }) {
  const s = useControlStyles(theme);
  const [picked, setPicked] = useState<Picked>(null);
  const [showQuiet, setShowQuiet] = useState(false);
  const { rows, quiet } = gridRows(comparison);
  const personas = comparison.verdicts.map((v) => v.persona);
  const Body = layout.compact ? Cards : Table;
  return (
    <View style={{ gap: 12 }}>
      {rows.length > 0 ? <Body theme={theme} rows={rows} personas={personas} onPick={setPicked} /> : <Text style={s.muted}>No unit was raised by anyone.</Text>}
      {quiet.length > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => setShowQuiet((v) => !v)}>
          <Text style={s.muted}>
            {showQuiet ? "▾" : "▸"} {quiet.length} unit{quiet.length === 1 ? "" : "s"} nobody raised
          </Text>
        </Pressable>
      ) : null}
      {showQuiet ? <Body theme={theme} rows={quiet} personas={personas} onPick={setPicked} /> : null}
      <Modal title={picked ? `${shortPersona(picked.unit)} · ${shortPersona(picked.cell.persona)}` : ""} open={picked !== null} onOpenChange={(open) => (open ? undefined : setPicked(null))}>
        <Modal.Content>
          <Text style={{ color: picked ? toneColor(theme, picked.cell.tone) : theme.colors.foreground }}>{picked?.cell.label}</Text>
          {picked?.cell.claim ? <Text style={s.text}>{picked.cell.claim}</Text> : null}
          {picked?.cell.why ? <Text style={s.muted}>{picked.cell.why}</Text> : null}
        </Modal.Content>
      </Modal>
    </View>
  );
}
