import { Text, View } from "react-native";
import { SEVERITIES, TIERS, type Severity, type Tier, type UnitBrief } from "../../shared/schemas";
import { Button, Field, Picker, TextField, useControlStyles } from "../controls";
import type { Option } from "../logic/catalog";
import type { PersonaForm, TierEntry } from "../logic/forms";
import type { Theme } from "../styles";

const TIER_LABEL: Record<Tier, string> = { primary: "Primary units", secondary: "Secondary units", deprioritized: "Deprioritized units" };
const THRESHOLD_OPTIONS: readonly Option[] = [{ value: "", label: "unit's own" }, ...SEVERITIES.map((v) => ({ value: v, label: v }))];

// A ref written differently from every catalog option (for example a unit that no longer
// resolves) still needs to show in its picker.
const withCurrent = (options: readonly Option[], ref: string): readonly Option[] =>
  ref === "" || options.some((o) => o.value === ref) ? options : [{ value: ref, label: ref, detail: "not in the catalog" }, ...options];

function TierEditor({
  theme,
  tier,
  entries,
  onChange,
  readOnly,
  canReorder,
  unitOptions,
  inherited,
}: {
  theme: Theme;
  tier: Tier;
  entries: TierEntry[];
  onChange: (entries: TierEntry[]) => void;
  readOnly: boolean;
  canReorder: boolean;
  unitOptions: readonly Option[];
  inherited: UnitBrief[];
}) {
  const s = useControlStyles(theme);
  const update = (i: number, patch: Partial<TierEntry>) => onChange(entries.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= entries.length) return;
    const next = [...entries];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  return (
    <Field theme={theme} label={TIER_LABEL[tier]}>
      {entries.map((e, i) => (
        <View key={i} style={s.entry}>
          <Picker
            theme={theme}
            title={`${TIER_LABEL[tier]}: unit`}
            value={e.ref}
            options={withCurrent(unitOptions, e.ref)}
            disabled={readOnly}
            placeholder="Choose a unit…"
            onChange={(ref) => update(i, { ref })}
          />
          <View style={s.row}>
            <View style={{ minWidth: 140 }}>
              <Picker
                theme={theme}
                title="Threshold"
                value={e.threshold ?? ""}
                options={THRESHOLD_OPTIONS}
                disabled={readOnly}
                onChange={(v) => update(i, { threshold: v === "" ? undefined : (v as Severity) })}
              />
            </View>
            {canReorder && tier === "primary" ? (
              <>
                <Button theme={theme} label="↑" accessibilityLabel={`Move ${e.ref || "unit"} up`} disabled={i === 0} onPress={() => move(i, -1)} />
                <Button theme={theme} label="↓" accessibilityLabel={`Move ${e.ref || "unit"} down`} disabled={i === entries.length - 1} onPress={() => move(i, 1)} />
              </>
            ) : null}
            {!readOnly ? (
              <Button theme={theme} label="Remove" accessibilityLabel={`Remove ${e.ref || "unit"}`} onPress={() => onChange(entries.filter((_, j) => j !== i))} />
            ) : null}
          </View>
          {tier === "deprioritized" ? (
            <TextField theme={theme} label="Note" placeholder="When to raise it anyway" value={e.note ?? ""} editable={!readOnly} onChangeText={(note) => update(i, { note })} />
          ) : null}
        </View>
      ))}
      {inherited.map((u) => (
        <Text key={u.canonical} style={[s.muted, { opacity: 0.6 }]}>
          {u.canonical} · inherited · {u.threshold}
        </Text>
      ))}
      {!readOnly ? <Button theme={theme} label={`+ Add ${tier} unit`} onPress={() => onChange([...entries, { ref: "" }])} /> : null}
    </Field>
  );
}

export function PersonaFormView({
  theme,
  form,
  onChange,
  readOnly,
  unitOptions,
  inherited,
}: {
  theme: Theme;
  form: PersonaForm;
  onChange: (f: PersonaForm) => void;
  readOnly: boolean;
  unitOptions: readonly Option[];
  inherited: Record<Tier, UnitBrief[]>;
}) {
  // Order only means ranking on a root persona; a child's ranking is primary_order (raw-only).
  const canReorder = form.extends === null && !readOnly;
  return (
    <View style={{ gap: 16 }}>
      <Field theme={theme} label="Description">
        <TextField theme={theme} label="Description" value={form.description} editable={!readOnly} multiline onChangeText={(description) => onChange({ ...form, description })} />
      </Field>
      {TIERS.map((tier) => (
        <TierEditor
          key={tier}
          theme={theme}
          tier={tier}
          entries={form.tiers[tier]}
          onChange={(entries) => onChange({ ...form, tiers: { ...form.tiers, [tier]: entries } })}
          readOnly={readOnly}
          canReorder={canReorder}
          unitOptions={unitOptions}
          inherited={inherited[tier]}
        />
      ))}
      <Field theme={theme} label="Stance">
        <TextField theme={theme} label="Stance" value={form.stance} editable={!readOnly} multiline onChangeText={(stance) => onChange({ ...form, stance })} />
      </Field>
      <Field theme={theme} label="Tie-breaking">
        <TextField theme={theme} label="Tie-breaking" value={form.tieBreaking} editable={!readOnly} multiline onChangeText={(tieBreaking) => onChange({ ...form, tieBreaking })} />
      </Field>
    </View>
  );
}
