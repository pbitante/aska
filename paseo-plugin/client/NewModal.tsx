import { Modal } from "@getpaseo/plugin/client/react-native";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { Kind, Listing, WriteScope } from "../shared/schemas";
import { Button, Field, Segmented, TextField, useControlStyles } from "./controls";
import { nameProblem, newScopes, type OpenTarget } from "./logic/catalog";
import type { Theme } from "./styles";

const KIND_OPTIONS: readonly { value: Kind; label: string }[] = [
  { value: "persona", label: "Persona" },
  { value: "unit", label: "Unit" },
  { value: "panel", label: "Panel" },
];

export function NewModal({
  theme,
  open,
  onClose,
  defaultKind,
  hasWorkspace,
  listing,
  onCreate,
}: {
  theme: Theme;
  open: boolean;
  onClose: () => void;
  defaultKind: Kind;
  hasWorkspace: boolean;
  listing: Listing;
  onCreate: (target: OpenTarget) => void;
}) {
  const c = useControlStyles(theme);
  const scopes = newScopes(hasWorkspace);
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [scope, setScope] = useState<WriteScope>(scopes[0]!.value);
  const [name, setName] = useState("");
  useEffect(() => {
    if (!open) return;
    setKind(defaultKind);
    setScope(newScopes(hasWorkspace)[0]!.value);
    setName("");
  }, [open, defaultKind, hasWorkspace]);
  const trimmed = name.trim();
  const problem = trimmed === "" ? null : nameProblem(trimmed, kind, scope, listing);
  return (
    <Modal title="New" open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <Modal.Content>
        <Field theme={theme} label="Kind">
          <Segmented theme={theme} label="Kind" options={KIND_OPTIONS} value={kind} onChange={setKind} />
        </Field>
        <Field theme={theme} label="Scope">
          <Segmented theme={theme} label="Scope" options={scopes} value={scope} onChange={setScope} />
        </Field>
        <Field theme={theme} label="Name" hint="kebab-case, for example release-manager">
          <TextField theme={theme} label="Name" value={name} onChangeText={setName} placeholder="my-persona" />
        </Field>
        {problem ? <Text style={{ color: theme.colors.statusDanger, fontSize: 13 }}>{problem}</Text> : null}
        <View style={c.row}>
          <Button theme={theme} label="Cancel" onPress={onClose} />
          <Button
            theme={theme}
            variant="primary"
            label="Create"
            disabled={trimmed === "" || problem !== null}
            onPress={() => onCreate({ kind, name: trimmed, canonical: trimmed, scope, creating: true })}
          />
        </View>
      </Modal.Content>
    </Modal>
  );
}
