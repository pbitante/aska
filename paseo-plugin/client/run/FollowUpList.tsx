import { useAgent, usePaseo, useRpc } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/react-native";
import { useState } from "react";
import { Text, View } from "react-native";
import { runStatusRpc } from "../../shared/runs";
import { Button, useControlStyles } from "../controls";
import { isStaleCall, type FollowUpLine } from "../logic/report";
import { errorText } from "../query";
import type { Theme } from "../styles";

function RunButton({
  theme,
  agentId,
  n,
  dir,
  callId,
  disabled,
}: {
  theme: Theme;
  agentId: string;
  n: number;
  dir?: string;
  callId?: string;
  disabled: boolean;
}) {
  const paseo = usePaseo();
  const toast = useToast();
  const statusRpc = useRpc(runStatusRpc);
  const busy = useAgent(agentId, (a) => a.status === "running" || a.status === "initializing") ?? true;
  const [sending, setSending] = useState(false);
  const send = () => {
    setSending(true);
    const proceed = () =>
      paseo.agents
        .ref(agentId)
        .send(`Run follow-up ${n}`)
        .then(
          () => toast.show(`Sent follow-up ${n}`, { variant: "success" }),
          (e: unknown) => toast.error(errorText(e)),
        )
        .finally(() => setSending(false));
    if (dir === undefined || callId === undefined) {
      proceed();
      return;
    }
    statusRpc({ dir }).then(
      (status) => {
        if (isStaleCall(status.reportCallId, callId)) {
          setSending(false);
          toast.error("This report was superseded; use the newest card");
          return;
        }
        void proceed();
      },
      (e: unknown) => {
        setSending(false);
        toast.error(errorText(e));
      },
    );
  };
  return <Button theme={theme} label={sending ? "Sending…" : "Run"} accessibilityLabel={`Run follow-up ${n}`} disabled={disabled || busy || sending} onPress={send} />;
}

// Numbered follow-ups. With an agent id, each gets a Run button that sends "Run follow-up N".
// dir/callId, when both given, let the button re-check run.status just before sending, so it
// never fires against a report a later one has superseded even if the client's cache is stale.
export function FollowUpList({
  theme,
  lines,
  agentId,
  dir,
  callId,
  disabled = false,
}: {
  theme: Theme;
  lines: readonly FollowUpLine[];
  agentId: string | null;
  dir?: string;
  callId?: string;
  disabled?: boolean;
}) {
  const s = useControlStyles(theme);
  if (lines.length === 0) return <Text style={s.muted}>No follow-ups.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {lines.map((l) => (
        <View key={l.n} style={[s.row, { alignItems: "flex-start" }]}>
          <View style={{ flex: 1, minWidth: 160, gap: 2 }}>
            <Text style={s.text}>
              {l.n}. {l.text}
            </Text>
            {l.tools.length > 0 ? <Text style={s.muted}>tools: {l.tools.join(", ")}</Text> : null}
          </View>
          {agentId ? <RunButton theme={theme} agentId={agentId} n={l.n} dir={dir} callId={callId} disabled={disabled} /> : null}
        </View>
      ))}
    </View>
  );
}
