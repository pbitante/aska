import { useRpc } from "@getpaseo/plugin/client";
import { ScrollView, useToast } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Text, View } from "react-native";
import { runReportRpc, runsDeleteRpc } from "../../shared/runs";
import { Button, ChoiceModal } from "../controls";
import { errorText, keys } from "../query";
import { useScreenStyles, type Layout, type Theme } from "../styles";
import { ReportView } from "./ReportView";

export function RunScreen({ theme, layout, id, onBack }: { theme: Theme; layout: Layout; id: string; onBack: () => void }) {
  const s = useScreenStyles(theme, layout);
  const toast = useToast();
  const queryClient = useQueryClient();
  const reportRpc = useRpc(runReportRpc);
  const deleteRpc = useRpc(runsDeleteRpc);
  const [confirming, setConfirming] = useState(false);
  const report = useQuery({ queryKey: keys.runArchived(id), queryFn: () => reportRpc({ id }) });
  const remove = useMutation({
    mutationFn: () => deleteRpc({ id }),
    onSuccess: async (r) => {
      setConfirming(false);
      toast.show(r.deleted ? "Run deleted" : "That run was already gone", { variant: r.deleted ? "success" : "info" });
      await queryClient.invalidateQueries({ queryKey: keys.runsPrefix });
      onBack();
    },
    onError: (e) => {
      setConfirming(false);
      toast.error(errorText(e));
    },
  });
  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.row}>
          <Button theme={theme} label="← Back" onPress={onBack} />
          <Button theme={theme} variant="danger" label="Delete" onPress={() => setConfirming(true)} />
        </View>
        {report.isPending ? <Text style={s.muted}>Loading…</Text> : null}
        {report.isError ? <Text style={{ color: theme.colors.statusDanger }}>{errorText(report.error)}</Text> : null}
        {report.data ? <ReportView theme={theme} layout={layout} report={report.data} agentId={null} /> : null}
      </ScrollView>
      <ChoiceModal
        theme={theme}
        open={confirming}
        title="Delete this run?"
        message="This removes it from the archive, and it isn't imported again unless the panel runs again in its folder. The original temp folder, if it still exists, is left alone."
        onClose={() => setConfirming(false)}
        actions={[
          { label: "Cancel", onPress: () => setConfirming(false) },
          { label: "Delete", variant: "danger", disabled: remove.isPending, onPress: () => remove.mutate() },
        ]}
      />
    </View>
  );
}
