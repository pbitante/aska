import { Text, View } from "react-native";
import { useControlStyles } from "../controls";
import { shortPersona, type PanelistSection } from "../logic/report";
import type { Theme } from "../styles";
import { Pills } from "./Pills";

function List({ theme, title, items }: { theme: Theme; title: string; items: readonly string[] }) {
  const s = useControlStyles(theme);
  if (items.length === 0) return null;
  return (
    <View style={{ gap: 2 }}>
      <Text style={s.label}>{title}</Text>
      {items.map((t, i) => (
        <Text key={i} selectable style={s.text}>
          • {t}
        </Text>
      ))}
    </View>
  );
}

export function PanelistsTab({ theme, sections }: { theme: Theme; sections: readonly PanelistSection[] }) {
  const s = useControlStyles(theme);
  if (sections.length === 0) return <Text style={s.muted}>No judgments yet.</Text>;
  return (
    <View style={{ gap: 16 }}>
      {sections.map((p) => (
        <View key={p.persona} style={[s.entry, { gap: 8 }]}>
          <Text style={s.text}>{shortPersona(p.persona)}</Text>
          <Pills theme={theme} pills={[p.pill]} />
          {p.reason ? <Text style={s.muted}>{p.reason}</Text> : null}
          {p.unreadable ? <Text style={{ color: theme.colors.statusDanger }}>This judgment isn't readable JSON.</Text> : null}
          <List theme={theme} title="Violations" items={p.violations} />
          {p.findings.length > 0 ? (
            <View style={{ gap: 6 }}>
              <Text style={s.label}>Findings</Text>
              {p.findings.map((f, i) => (
                <View key={i} style={{ gap: 2 }}>
                  <Text selectable style={s.text}>
                    {shortPersona(f.unit)} · {f.severity}: {f.claim}
                  </Text>
                  {f.evidence ? <Text selectable style={s.muted}>evidence: {f.evidence}</Text> : null}
                  {f.suggestion ? <Text selectable style={s.muted}>suggestion: {f.suggestion}</Text> : null}
                </View>
              ))}
            </View>
          ) : null}
          <List theme={theme} title="Conditions" items={p.conditions} />
          <List theme={theme} title="Missing information" items={p.missing} />
          <List theme={theme} title="Cleared" items={p.cleared.map(shortPersona)} />
          <List theme={theme} title="Not applicable" items={p.notApplicable.map((n) => `${shortPersona(n.unit)}: ${n.reason}`)} />
          {p.sections.map((sec) => (
            <View key={sec.name} style={{ gap: 2 }}>
              <Text style={s.label}>{sec.name}</Text>
              <Text selectable style={s.text}>
                {sec.text}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
