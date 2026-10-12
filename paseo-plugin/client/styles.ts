import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useMemo } from "react";
import { StyleSheet } from "react-native";
import type { Tone } from "./logic/catalog";

export type Theme = PluginSurfaceProps["theme"];
export type Layout = PluginSurfaceProps["layout"];

export function toneColor(theme: Theme, tone: Tone): string {
  if (tone === "ok") return theme.colors.statusSuccess;
  if (tone === "warning") return theme.colors.statusWarning;
  if (tone === "error") return theme.colors.statusDanger;
  return theme.colors.foregroundMuted;
}

export function useScreenStyles(theme: Theme, layout: Layout) {
  return useMemo(
    () =>
      StyleSheet.create({
        screen: { flex: 1, backgroundColor: theme.colors.surface0 },
        content: { padding: layout.compact ? 16 : 24, gap: layout.compact ? 12 : 16 },
        title: { color: theme.colors.foreground, fontSize: layout.compact ? 18 : 20, fontWeight: "600", flexShrink: 1 },
        text: { color: theme.colors.foreground, fontSize: 15 },
        muted: { color: theme.colors.foregroundMuted, fontSize: 13 },
        row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
        grid: { flexDirection: layout.compact ? "column" : "row", flexWrap: "wrap", gap: 12 },
        card: {
          backgroundColor: theme.colors.surface1,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: 10,
          padding: 12,
          gap: 6,
          ...(layout.compact ? {} : { flexBasis: 260, flexGrow: 1, maxWidth: 380 }),
        },
        chip: { borderColor: theme.colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
        section: { gap: 8 },
      }),
    [theme, layout.compact],
  );
}
