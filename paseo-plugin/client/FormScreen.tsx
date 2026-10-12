import { useRpc } from "@getpaseo/plugin/client";
import { ScrollView, useToast } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { fileDeleteRpc, filePatchRpc, fileShowRpc } from "../shared/rpc";
import type { Diagnostic, Listing, WriteScope } from "../shared/schemas";
import { Button, ChoiceModal, DiagnosticsList } from "./controls";
import { MAX_PANEL, MIN_PANEL, PanelFormView } from "./forms/PanelForm";
import { PersonaFormView } from "./forms/PersonaForm";
import { UnitFormView } from "./forms/UnitForm";
import {
  hasStale,
  newScopes,
  personaOptions,
  personaRowFor,
  rawFixHint,
  scopeLabel,
  showName,
  summarizeDiagnostics,
  unitOptions,
  writeScopeOf,
  type OpenTarget,
} from "./logic/catalog";
import {
  advancedChips,
  buildPatch,
  emptyForm,
  formFromShow,
  inheritedFor,
  isEmptyPatch,
  sectionHeadingProblem,
  type FormState,
} from "./logic/forms";
import { errorText, keys } from "./query";
import type { RawSeed } from "./RawScreen";
import { useScreenStyles, type Layout, type Theme } from "./styles";

type Checked = readonly Diagnostic[] | null;
type Confirm = { step: "ask" } | { step: "dependents"; dependents: string[] } | null;
type Form = FormState | null;

export interface FormScreenProps {
  theme: Theme;
  layout: Layout;
  workspaceId?: string;
  target: OpenTarget;
  listing: Listing;
  onBack: () => void;
  onOpen: (target: OpenTarget) => void;
  onRaw: (seed: RawSeed) => void;
}

export function FormScreen({ theme, layout, workspaceId, target, listing, onBack, onOpen, onRaw }: FormScreenProps) {
  const s = useScreenStyles(theme, layout);
  const toast = useToast();
  const queryClient = useQueryClient();
  const show = useRpc(fileShowRpc);
  const patchFile = useRpc(filePatchRpc);
  const deleteFile = useRpc(fileDeleteRpc);
  const readOnly = target.scope === "plugin";

  const file = useQuery({
    queryKey: keys.file(workspaceId, target),
    queryFn: () => show({ workspaceId, kind: target.kind, name: showName(target), scope: target.scope }),
    enabled: !target.creating,
    staleTime: Infinity,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  const loaded = file.data;
  const baseline = useMemo<Form>(
    () =>
      target.creating
        ? emptyForm(target.kind)
        : loaded?.fields
          ? formFromShow(target.kind, { fields: loaded.fields, sections: loaded.sections ?? {} })
          : null,
    [target.creating, target.kind, loaded],
  );
  const [form, setForm] = useState<Form>(baseline);
  useEffect(() => setForm(baseline), [baseline]);
  const [checked, setChecked] = useState<Checked>(null);
  const [stale, setStale] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [customizing, setCustomizing] = useState(false);
  const [confirmBack, setConfirmBack] = useState(false);

  const units = useMemo(() => unitOptions(listing), [listing]);
  const personas = useMemo(() => personaOptions(listing), [listing]);
  const patch = useMemo(() => (form && baseline ? buildPatch(baseline, form) : {}), [form, baseline]);
  const dirty = !isEmptyPatch(patch);
  const headingProblem = useMemo(() => sectionHeadingProblem(patch), [patch]);
  const diagnostics = checked ?? loaded?.diagnostics ?? [];
  const status = summarizeDiagnostics(diagnostics);
  const rawHint = rawFixHint(diagnostics);
  const brokenFrontmatter = !target.creating && rawFixHint(loaded?.diagnostics ?? []) !== null;
  const panelSize = form?.kind === "panel" ? form.personas.length : null;
  const panelSizeOk = panelSize === null || (panelSize >= MIN_PANEL && panelSize <= MAX_PANEL);
  const chips = loaded?.fields ? advancedChips(target.kind, loaded.fields, loaded.sections ?? {}) : [];
  const personaRow = target.kind === "persona" ? personaRowFor(listing, target.canonical, target.scope) : undefined;
  const inherited = inheritedFor(form, baseline, personaRow?.units ?? null);
  const plugin = loaded?.plugin ?? null;

  const refreshCatalog = () => queryClient.invalidateQueries({ queryKey: keys.catalog(workspaceId) });
  const refreshFile = () => queryClient.invalidateQueries({ queryKey: keys.file(workspaceId, target) });

  const save = useMutation({
    mutationFn: () =>
      patchFile({
        workspaceId,
        kind: target.kind,
        name: target.name,
        scope: writeScopeOf(target),
        patch,
        expectHash: target.creating ? "none" : (loaded?.hash ?? "none"),
      }),
    onSuccess: async (r) => {
      setChecked(r.diagnostics);
      if (r.written) {
        toast.show(r.diagnostics.length > 0 ? "Saved, with warnings" : "Saved", { variant: r.diagnostics.length > 0 ? "warning" : "success" });
        await refreshCatalog();
        if (target.creating) {
          queryClient.removeQueries({ queryKey: keys.file(workspaceId, target) });
          onOpen({ ...target, creating: false });
        } else await refreshFile();
      } else if (hasStale(r.diagnostics) && !target.creating) {
        setStale(true);
      }
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const remove = useMutation({
    mutationFn: (force: boolean) => deleteFile({ workspaceId, kind: target.kind, name: target.name, scope: writeScopeOf(target), force }),
    onSuccess: async (r) => {
      if (r.deleted) {
        setConfirm(null);
        toast.show("Deleted", { variant: "success" });
        await refreshCatalog();
        queryClient.removeQueries({ queryKey: keys.file(workspaceId, target) });
        onBack();
        return;
      }
      if (r.dependents.length > 0) {
        setConfirm({ step: "dependents", dependents: r.dependents.map((d) => `${d.kind ?? "file"} ${d.name ?? d.path ?? ""}: ${d.message}`) });
        return;
      }
      setConfirm(null);
      setChecked(r.diagnostics);
    },
    onError: (e) => {
      setConfirm(null);
      toast.error(errorText(e));
    },
  });

  const customize = useMutation({
    mutationFn: async (scope: WriteScope) => ({
      scope,
      r: await patchFile({ workspaceId, kind: "persona", name: target.name, scope, patch: { set: { extends: target.canonical } }, expectHash: "none" }),
    }),
    onSuccess: async ({ scope, r }) => {
      setCustomizing(false);
      const child: OpenTarget = { kind: "persona", name: target.name, canonical: target.name, scope, creating: false };
      if (r.written) {
        toast.show(`Created a ${scope} ${target.name}`, { variant: "success" });
        await refreshCatalog();
        onOpen(child);
      } else if (hasStale(r.diagnostics)) {
        toast.show(`You already have a ${scope} ${target.name}; opening it`, { variant: "info" });
        onOpen(child);
      } else {
        setChecked(r.diagnostics);
      }
    },
    onError: (e) => {
      setCustomizing(false);
      toast.error(errorText(e));
    },
  });

  const openRaw = () => {
    if (loaded?.raw === undefined || loaded.hash === undefined) return;
    onRaw({ raw: loaded.raw, hash: loaded.hash, pending: dirty ? JSON.stringify(patch, null, 2) : undefined });
  };
  const reload = async () => {
    setStale(false);
    setChecked(null);
    await refreshFile();
  };
  const copyEditsToRaw = async () => {
    setStale(false);
    try {
      const fresh = await show({ workspaceId, kind: target.kind, name: showName(target), scope: target.scope });
      if (fresh.raw === undefined || fresh.hash === undefined) {
        setChecked(fresh.diagnostics);
        return;
      }
      queryClient.setQueryData(keys.file(workspaceId, target), fresh);
      onRaw({ raw: fresh.raw, hash: fresh.hash, pending: JSON.stringify(patch, null, 2) });
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const canSave = !readOnly && form !== null && !save.isPending && panelSizeOk && headingProblem === null && (dirty || target.creating);
  const heading = `${target.name} · ${scopeLabel(target.scope, plugin)} · ${target.creating ? "new" : status.label}`;
  const handleBack = () => {
    if (dirty && !readOnly) setConfirmBack(true);
    else onBack();
  };

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.row}>
          <Button theme={theme} label="← Back" onPress={handleBack} />
          <Text style={s.title} accessibilityRole="header">
            {heading}
          </Text>
        </View>
        <View style={s.row}>
          {!readOnly ? <Button theme={theme} variant="primary" label={save.isPending ? "Saving…" : "Save"} disabled={!canSave} onPress={() => save.mutate()} /> : null}
          {!readOnly && !target.creating && loaded?.raw !== undefined ? <Button theme={theme} label="Edit raw" onPress={openRaw} /> : null}
          {!readOnly && !target.creating ? <Button theme={theme} variant="danger" label="Delete" onPress={() => setConfirm({ step: "ask" })} /> : null}
          {readOnly && target.kind === "persona" ? <Button theme={theme} label="Customize" onPress={() => setCustomizing(true)} /> : null}
          {readOnly ? <Text style={s.muted}>Read-only: this file belongs to the {scopeLabel(target.scope, plugin)} plugin.</Text> : null}
        </View>
        <DiagnosticsList theme={theme} diagnostics={diagnostics} />
        {rawHint ? <Text style={s.muted}>{rawHint}</Text> : null}
        {headingProblem ? <Text style={{ color: theme.colors.statusDanger, fontSize: 13 }}>{headingProblem}</Text> : null}
        {chips.length > 0 ? (
          <View style={s.row}>
            {chips.map((chip) => (
              <Pressable
                key={chip}
                accessibilityRole="button"
                accessibilityLabel={`${chip}. Edit in raw`}
                disabled={readOnly}
                onPress={openRaw}
                style={s.chip}
              >
                <Text style={s.muted}>{chip}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {!target.creating && file.isPending ? <Text style={s.muted}>Loading…</Text> : null}
        {file.isError ? <Text style={{ color: theme.colors.statusDanger }}>{errorText(file.error)}</Text> : null}
        {!target.creating && file.isSuccess && form === null ? <Text style={s.muted}>This file couldn't be loaded.</Text> : null}
        {!brokenFrontmatter && form?.kind === "unit" ? <UnitFormView theme={theme} form={form} onChange={setForm} readOnly={readOnly} /> : null}
        {!brokenFrontmatter && form?.kind === "panel" ? <PanelFormView theme={theme} form={form} onChange={setForm} readOnly={readOnly} personaOptions={personas} /> : null}
        {!brokenFrontmatter && form?.kind === "persona" && inherited ? (
          <PersonaFormView theme={theme} form={form} onChange={setForm} readOnly={readOnly} unitOptions={units} inherited={inherited} />
        ) : null}
      </ScrollView>
      <ChoiceModal
        theme={theme}
        open={stale}
        title="This file changed since you opened it"
        message="Reload discards your edits. Copy my edits to raw opens the current file with your edits shown above it, so you can merge by hand."
        onClose={() => setStale(false)}
        actions={[
          { label: "Reload", onPress: () => void reload() },
          { label: "Copy my edits to raw", variant: "primary", onPress: () => void copyEditsToRaw() },
        ]}
      />
      <ChoiceModal
        theme={theme}
        open={confirm !== null}
        title={confirm?.step === "dependents" ? "Other files depend on this" : `Delete ${target.name}?`}
        message={confirm?.step === "dependents" ? "Deleting it will break these files:" : `This removes the ${target.scope} ${target.kind} file.`}
        details={confirm?.step === "dependents" ? confirm.dependents : undefined}
        onClose={() => setConfirm(null)}
        actions={
          confirm?.step === "dependents"
            ? [
                { label: "Cancel", onPress: () => setConfirm(null) },
                { label: "Delete anyway", variant: "danger", disabled: remove.isPending, onPress: () => remove.mutate(true) },
              ]
            : [
                { label: "Cancel", onPress: () => setConfirm(null) },
                { label: "Delete", variant: "danger", disabled: remove.isPending, onPress: () => remove.mutate(false) },
              ]
        }
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
      <ChoiceModal
        theme={theme}
        open={customizing}
        title={`Customize ${target.name}`}
        message={`Creates a ${target.name} of your own that extends ${target.canonical}. It inherits everything until you change it.`}
        onClose={() => setCustomizing(false)}
        actions={[
          ...newScopes(workspaceId !== undefined).map((sc) => ({
            label: `In ${sc.label}`,
            variant: "primary" as const,
            disabled: customize.isPending,
            onPress: () => customize.mutate(sc.value),
          })),
          { label: "Cancel", onPress: () => setCustomizing(false) },
        ]}
      />
    </View>
  );
}
