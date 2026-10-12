import { Text, View } from "react-native";
import type { Tone } from "../../logic/catalog";
import { toneColor, type Theme } from "../../styles";

// The visual face of one track dot: shared by Tracks mode and the unit drawer.
export function DotFace({ theme, r, tone, label }: { theme: Theme; r: number; tone: Tone; label: string }) {
  const d = r * 2;
  return (
    <View
      style={{
        width: d,
        height: d,
        borderRadius: r,
        backgroundColor: theme.colors.surface1,
        borderWidth: 2,
        borderColor: toneColor(theme, tone),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: r <= 10 ? 9 : 11, color: theme.colors.foreground }}>{label}</Text>
    </View>
  );
}
