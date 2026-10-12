import { Text, View } from "react-native";
import type { Pill } from "../logic/report";
import { shortPersona } from "../logic/report";
import { toneColor, type Theme } from "../styles";

export function Pills({ theme, pills }: { theme: Theme; pills: readonly Pill[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {pills.map((p) => (
        <View key={p.persona} style={{ borderWidth: 1, borderColor: toneColor(theme, p.tone), borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ color: toneColor(theme, p.tone), fontSize: 12 }}>
            {shortPersona(p.persona)}: {p.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
