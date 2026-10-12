import { ScrollView } from "@getpaseo/plugin/client/react-native";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import type { Listing } from "../shared/schemas";
import { Button, Segmented } from "./controls";
import { cardsFor, scopeFilters, type OpenTarget, type ScopeFilter } from "./logic/catalog";
import type { LibraryTab } from "./logic/runs";
import { RunsList } from "./run/RunsList";
import { toneColor, useScreenStyles, type Layout, type Theme } from "./styles";

const TABS: readonly { value: LibraryTab; label: string }[] = [
  { value: "persona", label: "Personas" },
  { value: "unit", label: "Units" },
  { value: "panel", label: "Panels" },
  { value: "runs", label: "Runs" },
];

export function Library({
  theme,
  layout,
  listing,
  tab,
  onTab,
  filter,
  onFilter,
  onOpen,
  onNew,
  workspaceId,
  onOpenRun,
}: {
  theme: Theme;
  layout: Layout;
  listing: Listing;
  tab: LibraryTab;
  onTab: (tab: LibraryTab) => void;
  filter: ScopeFilter;
  onFilter: (filter: ScopeFilter) => void;
  onOpen: (target: OpenTarget) => void;
  onNew: () => void;
  workspaceId?: string;
  onOpenRun: (id: string) => void;
}) {
  const s = useScreenStyles(theme, layout);
  const cards = useMemo(() => (tab === "runs" ? [] : cardsFor(listing, tab, filter)), [listing, tab, filter]);
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <View style={[s.row, { justifyContent: "space-between" }]}>
        <Segmented theme={theme} label="Kind" options={TABS} value={tab} onChange={onTab} />
        {tab !== "runs" ? <Button theme={theme} variant="primary" label="+ New" onPress={onNew} /> : null}
      </View>
      {tab === "runs" ? (
        <RunsList theme={theme} layout={layout} workspaceId={workspaceId} onOpen={onOpenRun} />
      ) : (
        <>
          <Segmented theme={theme} label="Scope" options={scopeFilters(workspaceId !== undefined)} value={filter} onChange={onFilter} />
          <View style={s.grid}>
            {cards.map((card) => (
              <Pressable
                key={card.key}
                accessibilityRole="button"
                accessibilityLabel={`${card.name}, ${card.scopeLabel}, ${card.status.label}`}
                onPress={() => onOpen({ kind: card.kind, name: card.name, canonical: card.canonical, scope: card.scope, creating: false })}
                style={s.card}
              >
                <Text style={s.text}>{card.name}</Text>
                <Text style={s.muted}>
                  {card.scopeLabel}
                  {card.readOnly ? " · read-only" : ""}
                </Text>
                {card.description ? (
                  <Text style={s.muted} numberOfLines={3}>
                    {card.description}
                  </Text>
                ) : null}
                <Text style={{ color: toneColor(theme, card.status.tone), fontSize: 13 }}>{card.status.label}</Text>
              </Pressable>
            ))}
          </View>
          {cards.length === 0 ? <Text style={s.muted}>Nothing here yet.</Text> : null}
        </>
      )}
    </ScrollView>
  );
}
