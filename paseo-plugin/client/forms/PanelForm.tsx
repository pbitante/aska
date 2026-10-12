import { Text, View } from "react-native";
import { Button, Field, Picker, TextField, useControlStyles } from "../controls";
import type { Option } from "../logic/catalog";
import { sameRef, type PanelForm } from "../logic/forms";
import type { Theme } from "../styles";

export const MIN_PANEL = 2;
export const MAX_PANEL = 6;

export function PanelFormView({
  theme,
  form,
  onChange,
  readOnly,
  personaOptions,
}: {
  theme: Theme;
  form: PanelForm;
  onChange: (f: PanelForm) => void;
  readOnly: boolean;
  personaOptions: readonly Option[];
}) {
  const s = useControlStyles(theme);
  const n = form.personas.length;
  const setPersonas = (personas: string[]) => onChange({ ...form, personas });
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= n) return;
    const next = [...form.personas];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setPersonas(next);
  };
  const available = personaOptions.filter((o) => !form.personas.some((p) => sameRef(o.value, p)));
  const hint = n < MIN_PANEL || n > MAX_PANEL ? `A panel seats ${MIN_PANEL} to ${MAX_PANEL} personas; this one has ${n}.` : `${n} of at most ${MAX_PANEL} personas.`;
  return (
    <View style={{ gap: 16 }}>
      <Field theme={theme} label="Description">
        <TextField theme={theme} label="Description" value={form.description} editable={!readOnly} multiline onChangeText={(description) => onChange({ ...form, description })} />
      </Field>
      <Field theme={theme} label="Personas" hint={hint}>
        {form.personas.map((p, i) => {
          const option = personaOptions.find((o) => sameRef(o.value, p));
          return (
            <View key={`${i}:${p}`} style={[s.row, s.entry]}>
              <View style={{ flex: 1, minWidth: 160, gap: 2 }}>
                <Text style={s.text}>
                  {i + 1}. {p}
                </Text>
                {option?.detail ? <Text style={s.muted}>{option.detail}</Text> : null}
              </View>
              {!readOnly ? (
                <View style={s.row}>
                  <Button theme={theme} label="↑" accessibilityLabel={`Move ${p} up`} disabled={i === 0} onPress={() => move(i, -1)} />
                  <Button theme={theme} label="↓" accessibilityLabel={`Move ${p} down`} disabled={i === n - 1} onPress={() => move(i, 1)} />
                  <Button theme={theme} label="Remove" accessibilityLabel={`Remove ${p}`} onPress={() => setPersonas(form.personas.filter((_, j) => j !== i))} />
                </View>
              ) : null}
            </View>
          );
        })}
        {!readOnly && n < MAX_PANEL ? (
          <Picker theme={theme} title="Add a persona" value="" options={available} placeholder="+ Add a persona…" onChange={(v) => setPersonas([...form.personas, v])} />
        ) : null}
      </Field>
      <Field theme={theme} label="Notes">
        <TextField theme={theme} label="Notes" value={form.notes} editable={!readOnly} multiline onChangeText={(notes) => onChange({ ...form, notes })} />
      </Field>
    </View>
  );
}
