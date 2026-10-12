import { useRpc, useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsInput, SettingsRow, SettingsSection } from "@getpaseo/plugin/client/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Text } from "react-native";
import { askaStatusRpc } from "../shared/rpc";
import { askaSettings } from "../shared/settings";
import { keys } from "./query";

type Draft = string | null;

export function SettingsScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(askaSettings);
  const statusRpc = useRpc(askaStatusRpc);
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: keys.status, queryFn: () => statusRpc({}) });
  const [draft, setDraft] = useState<Draft>(null);

  if (settings.status === "loading") return <Text style={{ color: theme.colors.foregroundMuted }}>Loading…</Text>;
  if (settings.status !== "ready") {
    return (
      <SettingsSection title="aska CLI">
        <SettingsCard>
          <SettingsRow label="Settings unavailable" error={settings.error} />
          {settings.status === "invalid" ? <SettingsAction label="Reset to defaults" actionLabel="Reset" onPress={() => void settings.reset()} /> : null}
        </SettingsCard>
      </SettingsSection>
    );
  }

  const current = settings.values.askaCliPath;
  const statusHint = status.data
    ? status.data.ok
      ? `aska ${status.data.version} at ${status.data.cliPath}`
      : (status.data.reason ?? "aska not found")
    : "Checking…";
  const savePath = async () => {
    if (await settings.save({ askaCliPath: (draft ?? "").trim() }, settings.revision)) {
      setDraft(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.status }),
        queryClient.invalidateQueries({ queryKey: ["aska-editor", "catalog"] }),
      ]);
    }
  };

  return (
    <SettingsSection title="aska CLI">
      <SettingsCard>
        <SettingsInput
          label="Path to persona.mjs"
          hint="Leave empty to use the installed aska plugin. Set it to develop against an aska checkout."
          initialValue={current}
          placeholder="/path/to/aska/skills/operator/scripts/persona.mjs"
          onChangeText={setDraft}
        />
        <SettingsAction
          label="Save the path"
          actionLabel={settings.saving ? "Saving…" : "Save"}
          disabled={settings.saving || draft === null || draft.trim() === current}
          error={settings.saveError}
          onPress={() => void savePath()}
        />
        <SettingsRow label="Status" hint={statusHint} />
      </SettingsCard>
    </SettingsSection>
  );
}
