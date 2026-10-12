import { View } from "react-native";
import { SEVERITIES, type Severity } from "../../shared/schemas";
import { Field, Picker, StringListEditor, TextField } from "../controls";
import type { ListOrText, UnitForm } from "../logic/forms";
import type { Theme } from "../styles";

const SEVERITY_OPTIONS = SEVERITIES.map((v) => ({ value: v, label: v }));

function ListOrTextField({
  theme,
  label,
  value,
  onChange,
  readOnly,
}: {
  theme: Theme;
  label: string;
  value: ListOrText;
  onChange: (value: ListOrText) => void;
  readOnly: boolean;
}) {
  return (
    <Field theme={theme} label={label} hint={value.mode === "text" ? "This section isn't a plain bulleted list, so it's edited as text." : undefined}>
      {value.mode === "list" ? (
        <StringListEditor theme={theme} label={label} items={value.items} editable={!readOnly} onChange={(items) => onChange({ mode: "list", items })} />
      ) : (
        <TextField theme={theme} label={label} value={value.text} editable={!readOnly} multiline onChangeText={(text) => onChange({ mode: "text", text })} />
      )}
    </Field>
  );
}

export function UnitFormView({ theme, form, onChange, readOnly }: { theme: Theme; form: UnitForm; onChange: (f: UnitForm) => void; readOnly: boolean }) {
  const set = (patch: Partial<UnitForm>) => onChange({ ...form, ...patch });
  return (
    <View style={{ gap: 16 }}>
      <Field theme={theme} label="Description">
        <TextField theme={theme} label="Description" value={form.description} editable={!readOnly} multiline onChangeText={(description) => set({ description })} />
      </Field>
      <Field theme={theme} label="Applies when" hint="Leave empty to apply to every change.">
        <TextField theme={theme} label="Applies when" value={form.appliesWhen} editable={!readOnly} multiline onChangeText={(appliesWhen) => set({ appliesWhen })} />
      </Field>
      <Field theme={theme} label="Threshold">
        <Picker theme={theme} title="Threshold" value={form.threshold} options={SEVERITY_OPTIONS} disabled={readOnly} onChange={(v) => set({ threshold: v as Severity })} />
      </Field>
      <Field theme={theme} label="Looks for">
        <TextField theme={theme} label="Looks for" value={form.looksFor} editable={!readOnly} multiline onChangeText={(looksFor) => set({ looksFor })} />
      </Field>
      <ListOrTextField theme={theme} label="Questions" value={form.questions} readOnly={readOnly} onChange={(questions) => set({ questions })} />
      <ListOrTextField theme={theme} label="Red flags" value={form.redFlags} readOnly={readOnly} onChange={(redFlags) => set({ redFlags })} />
      <Field theme={theme} label="Good looks like">
        <TextField theme={theme} label="Good looks like" value={form.goodLooksLike} editable={!readOnly} multiline onChangeText={(goodLooksLike) => set({ goodLooksLike })} />
      </Field>
    </View>
  );
}
