import { useRpc } from "@getpaseo/plugin/client";
import { copyText, ScrollView, useToast } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Text, View } from "react-native";
import { fileSaveRpc, fileShowRpc } from "../shared/rpc";
import type { Diagnostic } from "../shared/schemas";
import { Button, ChoiceModal, DiagnosticsList, TextField, useControlStyles } from "./controls";
import { hasStale, showName, writeScopeOf, type OpenTarget } from "./logic/catalog";
import { errorText, keys } from "./query";
import { useScreenStyles, type Layout, type Theme } from "./styles";

export interface RawSeed {
  raw: string;
  hash: string;
  // The unsaved form edits, as patch JSON, shown above the text for a manual merge.
  pending?: string;
}
type Checked = readonly Diagnostic[];

export function RawScreen({
  theme,
  layout,
  workspaceId,
  target,
  seed,
  onBack,
  onSaved,
}: {
  theme: Theme;
  layout: Layout;
  workspaceId?: string;
  target: OpenTarget;
  seed: RawSeed;
  onBack: () => void;
  onSaved: () => void;
}) {
  const s = useScreenStyles(theme, layout);
  const c = useControlStyles(theme);
  const toast = useToast();
  const queryClient = useQueryClient();
  const saveFile = useRpc(fileSaveRpc);
  const show = useRpc(fileShowRpc);
  const [text, setText] = useState(seed.raw);
  const [hash, setHash] = useState(seed.hash);
  const [checked, setChecked] = useState<Checked>([]);
  const [stale, setStale] = useState(false);
  const [confirmBack, setConfirmBack] = useState(false);
  const dirty = text !== seed.raw;
  const handleBack = () => {
    if (dirty) setConfirmBack(true);
    else onBack();
  };

  const save = useMutation({
    mutationFn: () => saveFile({ workspaceId, kind: target.kind, name: target.name, scope: writeScopeOf(target), markdown: text, expectHash: hash }),
    onSuccess: async (r) => {
      setChecked(r.diagnostics);
      if (r.written) {
        toast.show(r.diagnostics.length > 0 ? "Saved, with warnings" : "Saved", { variant: r.diagnostics.length > 0 ? "warning" : "success" });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: keys.catalog(workspaceId) }),
          queryClient.invalidateQueries({ queryKey: keys.file(workspaceId, target) }),
        ]);
        onSaved();
      } else if (hasStale(r.diagnostics)) {
        setStale(true);
      }
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const reload = async (keepCopy: boolean) => {
    setStale(false);
    try {
      if (keepCopy) await copyText(text);
      const fresh = await show({ workspaceId, kind: target.kind, name: showName(target), scope: target.scope });
      if (fresh.raw === undefined || fresh.hash === undefined) {
        setChecked(fresh.diagnostics);
        return;
      }
      setText(fresh.raw);
      setHash(fresh.hash);
      setChecked([]);
      if (keepCopy) toast.show("Your text is on the clipboard", { variant: "info" });
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.row}>
          <Button theme={theme} label="← Back" onPress={handleBack} />
          <Text style={s.title} accessibilityRole="header">
            {target.name} · {target.scope} · raw
          </Text>
        </View>
        <View style={s.row}>
          <Button theme={theme} variant="primary" label={save.isPending ? "Saving…" : "Save"} disabled={save.isPending} onPress={() => save.mutate()} />
        </View>
        <DiagnosticsList theme={theme} diagnostics={checked} />
        {seed.pending ? (
          <View style={s.section}>
            <Text style={s.muted}>Your unsaved form edits, as a patch. Merge them into the text by hand:</Text>
            <Text selectable style={[s.muted, c.mono]}>
              {seed.pending}
            </Text>
          </View>
        ) : null}
        <TextField theme={theme} label="Raw markdown" value={text} onChangeText={setText} multiline mono tall />
      </ScrollView>
      <ChoiceModal
        theme={theme}
        open={stale}
        title="This file changed since you opened it"
        message="Reload discards your text. Copy keeps it on the clipboard so you can merge it by hand."
        onClose={() => setStale(false)}
        actions={[
          { label: "Reload", onPress: () => void reload(false) },
          { label: "Copy my text and reload", variant: "primary", onPress: () => void reload(true) },
        ]}
      />
      <ChoiceModal
        theme={theme}
        open={confirmBack}
        title="Discard your edits?"
        message="Going back will discard your unsaved edits."
        onClose={() => setConfirmBack(false)}
        actions={[
          { label: "Keep editing", onPress: () => setConfirmBack(false) },
          {
            label: "Discard",
            variant: "danger",
            onPress: () => {
              setConfirmBack(false);
              onBack();
            },
          },
        ]}
      />
    </View>
  );
}
