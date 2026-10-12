import { useRpc } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { runsImportRpc, runsListRpc } from "../../shared/runs";
import { Button, Segmented } from "../controls";
import { metaPills } from "../logic/report";
import { filterRuns, importToastMessage, projectFilters } from "../logic/runs";
import { errorText, keys } from "../query";
import { useScreenStyles, type Layout, type Theme } from "../styles";
import { Pills } from "./Pills";

const RUNS_POLL_MS = 10_000;

export function RunsList({ theme, layout, workspaceId, onOpen }: { theme: Theme; layout: Layout; workspaceId?: string; onOpen: (id: string) => void }) {
  const s = useScreenStyles(theme, layout);
  const toast = useToast();
  const queryClient = useQueryClient();
  const listRpc = useRpc(runsListRpc);
  const importRpc = useRpc(runsImportRpc);
  const [filter, setFilter] = useState("all");
  const list = useQuery({
    queryKey: keys.runsList(workspaceId),
    queryFn: () => listRpc({ workspaceId }),
    refetchOnMount: "always",
    refetchInterval: RUNS_POLL_MS,
  });
  const importRuns = useMutation({
    mutationFn: () => importRpc({}),
    onSuccess: async (r) => {
      if (r.imported > 0) toast.show(importToastMessage(r), { variant: "success" });
      await queryClient.invalidateQueries({ queryKey: keys.runsPrefix });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const runs = list.data?.runs ?? [];
  const filters = useMemo(() => projectFilters(runs), [runs]);
  const shown = useMemo(() => filterRuns(runs, filter), [runs, filter]);
  return (
    <View style={s.section}>
      <View style={[s.row, { justifyContent: "space-between" }]}>
        {workspaceId === undefined && filters.length > 2 ? <Segmented theme={theme} label="Project" options={filters} value={filter} onChange={setFilter} /> : <View />}
        <Button theme={theme} label={importRuns.isPending ? "Refreshing…" : "Refresh"} disabled={importRuns.isPending} onPress={() => importRuns.mutate()} />
      </View>
      {list.isPending ? <Text style={s.muted}>Loading runs…</Text> : null}
      {list.isError ? <Text style={s.muted}>{errorText(list.error)}</Text> : null}
      {list.isSuccess && shown.length === 0 ? <Text style={s.muted}>No archived panel runs yet. Runs appear here automatically when a panel finishes.</Text> : null}
      <View style={s.grid}>
        {shown.map((m) => (
          <Pressable key={m.id} accessibilityRole="button" accessibilityLabel={`${m.question}, ${new Date(m.startedAt).toLocaleString()}`} onPress={() => onOpen(m.id)} style={s.card}>
            <Text style={s.muted}>
              {new Date(m.startedAt).toLocaleString()} · {m.panel ?? "ad-hoc"}
            </Text>
            <Text style={s.text} numberOfLines={2}>
              {m.question}
            </Text>
            <Pills theme={theme} pills={metaPills(m)} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
