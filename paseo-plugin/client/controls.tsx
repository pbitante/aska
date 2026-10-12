import { FlatList, Modal, TextInput } from "@getpaseo/plugin/client/react-native";
import { useMemo, useState, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { Diagnostic } from "../shared/schemas";
import type { Option } from "./logic/catalog";
import type { Theme } from "./styles";

export function useControlStyles(theme: Theme) {
  return useMemo(
    () =>
      StyleSheet.create({
        label: { color: theme.colors.foregroundMuted, fontSize: 13 },
        text: { color: theme.colors.foreground, fontSize: 15 },
        muted: { color: theme.colors.foregroundMuted, fontSize: 13 },
        input: {
          color: theme.colors.foreground,
          backgroundColor: theme.colors.surface1,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 8,
          fontSize: 15,
        },
        multiline: { minHeight: 96, textAlignVertical: "top" },
        tall: { minHeight: 360 },
        mono: { fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), fontSize: 13 },
        button: {
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
        },
        primary: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
        danger: { borderColor: theme.colors.statusDanger },
        disabled: { opacity: 0.5 },
        row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
        entry: { gap: 6, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border },
        option: {
          paddingVertical: 12,
          paddingHorizontal: 16,
          gap: 2,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
      }),
    [theme],
  );
}

export function Button({
  theme,
  label,
  onPress,
  variant = "plain",
  disabled = false,
  accessibilityLabel,
}: {
  theme: Theme;
  label: string;
  onPress: () => void;
  variant?: "plain" | "primary" | "danger";
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const s = useControlStyles(theme);
  const color = variant === "primary" ? theme.colors.accentForeground : variant === "danger" ? theme.colors.statusDanger : theme.colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[s.button, variant === "primary" && s.primary, variant === "danger" && s.danger, disabled && s.disabled]}
    >
      <Text style={{ color, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function Field({ theme, label, hint, children }: { theme: Theme; label: string; hint?: string; children: ReactNode }) {
  const s = useControlStyles(theme);
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.label}>{label}</Text>
      {children}
      {hint ? <Text style={s.muted}>{hint}</Text> : null}
    </View>
  );
}

export function TextField({
  theme,
  label,
  value,
  onChangeText,
  multiline = false,
  mono = false,
  tall = false,
  editable = true,
  placeholder,
}: {
  theme: Theme;
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  multiline?: boolean;
  mono?: boolean;
  tall?: boolean;
  editable?: boolean;
  placeholder?: string;
}) {
  const s = useControlStyles(theme);
  return (
    <TextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={onChangeText}
      editable={editable}
      multiline={multiline}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.foregroundMuted}
      autoCapitalize="none"
      autoCorrect={false}
      style={[s.input, multiline && s.multiline, tall && s.tall, mono && s.mono, !editable && s.disabled]}
    />
  );
}

export function Segmented<T extends string>({
  theme,
  label,
  options,
  value,
  onChange,
}: {
  theme: Theme;
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const s = useControlStyles(theme);
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={s.row}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[s.button, selected && s.primary]}
          >
            <Text style={{ color: selected ? theme.colors.accentForeground : theme.colors.foreground, fontSize: 14 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Picker({
  theme,
  title,
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "Choose…",
}: {
  theme: Theme;
  title: string;
  value: string;
  options: readonly Option[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const s = useControlStyles(theme);
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${current?.label ?? placeholder}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[s.input, disabled && s.disabled]}
      >
        <Text style={current ? s.text : s.muted}>{current?.label ?? placeholder}</Text>
      </Pressable>
      <Modal title={title} open={open} onOpenChange={setOpen}>
        <Modal.Content scrollable={false} style={{ backgroundColor: theme.colors.surface0 }} contentContainerStyle={{ padding: 0, gap: 0 }}>
          <FlatList
            style={{ flex: 1, minHeight: 0 }}
            data={[...options]}
            keyExtractor={(_, index) => String(index)}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={item.label}
                onPress={() => {
                  onChange(item.value);
                  setOpen(false);
                }}
                style={s.option}
              >
                <Text style={s.text}>{item.value === value ? `✓ ${item.label}` : item.label}</Text>
                {item.detail ? <Text style={s.muted}>{item.detail}</Text> : null}
              </Pressable>
            )}
          />
        </Modal.Content>
      </Modal>
    </>
  );
}

export function StringListEditor({
  theme,
  label,
  items,
  onChange,
  editable,
}: {
  theme: Theme;
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  editable: boolean;
}) {
  const s = useControlStyles(theme);
  return (
    <View style={{ gap: 6 }}>
      {items.map((item, i) => (
        <View key={i} style={s.row}>
          <View style={{ flex: 1, minWidth: 160 }}>
            <TextField
              theme={theme}
              label={`${label} ${i + 1}`}
              value={item}
              editable={editable}
              onChangeText={(text) => onChange(items.map((x, j) => (j === i ? text : x)))}
            />
          </View>
          {editable ? (
            <Button theme={theme} label="✕" accessibilityLabel={`Remove ${label} ${i + 1}`} onPress={() => onChange(items.filter((_, j) => j !== i))} />
          ) : null}
        </View>
      ))}
      {editable ? <Button theme={theme} label="+ Add" accessibilityLabel={`Add to ${label}`} onPress={() => onChange([...items, ""])} /> : null}
    </View>
  );
}

export function DiagnosticsList({ theme, diagnostics }: { theme: Theme; diagnostics: readonly Diagnostic[] }) {
  const s = useControlStyles(theme);
  if (diagnostics.length === 0) return null;
  return (
    <View style={{ gap: 6 }}>
      {diagnostics.map((d, i) => (
        <View key={`${d.code}-${i}`} style={{ gap: 2 }}>
          <Text style={{ color: d.level === "error" ? theme.colors.statusDanger : theme.colors.statusWarning, fontSize: 14 }}>
            {d.level === "error" ? "✗" : "⚠"} {d.code}: {d.message}
          </Text>
          {d.fix ? <Text style={s.muted}>fix: {d.fix}</Text> : null}
        </View>
      ))}
    </View>
  );
}

export interface ChoiceAction {
  label: string;
  onPress: () => void;
  variant?: "plain" | "primary" | "danger";
  disabled?: boolean;
}

export function ChoiceModal({
  theme,
  open,
  title,
  message,
  details,
  actions,
  onClose,
}: {
  theme: Theme;
  open: boolean;
  title: string;
  message: string;
  details?: readonly string[];
  actions: readonly ChoiceAction[];
  onClose: () => void;
}) {
  const s = useControlStyles(theme);
  return (
    <Modal title={title} open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <Modal.Content>
        <Text style={s.text}>{message}</Text>
        {details?.map((d, i) => (
          <Text key={i} style={s.muted}>
            • {d}
          </Text>
        ))}
        <View style={s.row}>
          {actions.map((a) => (
            <Button key={a.label} theme={theme} label={a.label} variant={a.variant} disabled={a.disabled} onPress={a.onPress} />
          ))}
        </View>
      </Modal.Content>
    </Modal>
  );
}
