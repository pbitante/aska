import { useRpc, type PluginScreenProps, type PluginSidebarItemProps, type PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { ScrollView } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Text, View } from "react-native";
import { askaStatusRpc, catalogListRpc } from "../shared/rpc";
import { Button } from "./controls";
import { FormScreen } from "./FormScreen";
import { Library } from "./Library";
import { targetKey, type OpenTarget, type ScopeFilter } from "./logic/catalog";
import type { LibraryTab } from "./logic/runs";
import { NewModal } from "./NewModal";
import { errorText, keys } from "./query";
import { RawScreen, type RawSeed } from "./RawScreen";
import { RunScreen } from "./run/RunScreen";
import { RunsList } from "./run/RunsList";
import { useScreenStyles, type Layout, type Theme } from "./styles";

type ViewState = { screen: "library" } | { screen: "form"; target: OpenTarget } | { screen: "raw"; target: OpenTarget; seed: RawSeed } | { screen: "run"; id: string };
// Browsing the archive without a working aska CLI: a separate, smaller state machine since it
// doesn't need the catalog or any of the form/raw screens that do.
type ArchiveViewState = { screen: "list" } | { screen: "run"; id: string };

function Message({
  theme,
  layout,
  text,
  detail,
  onRetry,
  secondaryAction,
}: {
  theme: Theme;
  layout: Layout;
  text: string;
  detail?: string;
  onRetry?: () => void;
  secondaryAction?: { label: string; onPress: () => void };
}) {
  const s = useScreenStyles(theme, layout);
  return (
    <View style={[s.screen, s.content]}>
      <Text style={s.text}>{text}</Text>
      {detail ? <Text style={s.muted}>{detail}</Text> : null}
      {onRetry || secondaryAction ? (
        <View style={s.row}>
          {onRetry ? <Button theme={theme} label="Try again" onPress={onRetry} /> : null}
          {secondaryAction ? <Button theme={theme} label={secondaryAction.label} onPress={secondaryAction.onPress} /> : null}
        </View>
      ) : null}
    </View>
  );
}

function Editor({ theme, layout, workspaceId }: { theme: Theme; layout: Layout; workspaceId?: string }) {
  const statusRpc = useRpc(askaStatusRpc);
  const listRpc = useRpc(catalogListRpc);
  const status = useQuery({ queryKey: keys.status, queryFn: () => statusRpc({}) });
  const catalog = useQuery({ queryKey: keys.catalog(workspaceId), queryFn: () => listRpc({ workspaceId }), enabled: status.data?.ok === true });
  const [view, setView] = useState<ViewState>({ screen: "library" });
  const [tab, setTab] = useState<LibraryTab>("persona");
  const [filter, setFilter] = useState<ScopeFilter>("all");
  const [newOpen, setNewOpen] = useState(false);
  const [archiveView, setArchiveView] = useState<ArchiveViewState | null>(null);
  const s = useScreenStyles(theme, layout);

  if (status.isPending) return <Message theme={theme} layout={layout} text="Looking for aska…" />;
  if (status.isError) return <Message theme={theme} layout={layout} text={`Couldn't check for aska: ${errorText(status.error)}`} onRetry={() => void status.refetch()} />;
  if (!status.data.ok) {
    if (archiveView?.screen === "run") {
      return <RunScreen theme={theme} layout={layout} id={archiveView.id} onBack={() => setArchiveView({ screen: "list" })} />;
    }
    if (archiveView?.screen === "list") {
      return (
        <ScrollView style={s.screen} contentContainerStyle={s.content}>
          <View style={s.row}>
            <Button theme={theme} label="← Back" onPress={() => setArchiveView(null)} />
          </View>
          <RunsList theme={theme} layout={layout} workspaceId={workspaceId} onOpen={(id) => setArchiveView({ screen: "run", id })} />
        </ScrollView>
      );
    }
    return (
      <Message
        theme={theme}
        layout={layout}
        text="aska ≥ 0.3.0 not found: install it, or set the path in settings"
        detail={`${status.data.reason ?? ""} (Settings → Plugins → aska-editor → aska CLI)`}
        onRetry={() => void status.refetch()}
        secondaryAction={{ label: "Browse archived runs", onPress: () => setArchiveView({ screen: "list" }) }}
      />
    );
  }
  if (catalog.isPending) return <Message theme={theme} layout={layout} text="Loading your aska library…" />;
  if (catalog.isError) return <Message theme={theme} layout={layout} text={errorText(catalog.error)} onRetry={() => void catalog.refetch()} />;

  const listing = catalog.data;
  const open = (target: OpenTarget) => setView({ screen: "form", target });
  const backToLibrary = () => setView({ screen: "library" });

  if (view.screen === "form") {
    const target = view.target;
    return (
      <FormScreen
        key={targetKey(target)}
        theme={theme}
        layout={layout}
        workspaceId={workspaceId}
        target={target}
        listing={listing}
        onBack={backToLibrary}
        onOpen={open}
        onRaw={(seed) => setView({ screen: "raw", target, seed })}
      />
    );
  }
  if (view.screen === "raw") {
    const target = view.target;
    return (
      <RawScreen
        key={`raw:${targetKey(target)}`}
        theme={theme}
        layout={layout}
        workspaceId={workspaceId}
        target={target}
        seed={view.seed}
        onBack={() => open(target)}
        onSaved={() => open(target)}
      />
    );
  }
  if (view.screen === "run") {
    return <RunScreen key={view.id} theme={theme} layout={layout} id={view.id} onBack={backToLibrary} />;
  }
  return (
    <>
      <Library
        theme={theme}
        layout={layout}
        listing={listing}
        tab={tab}
        onTab={setTab}
        filter={filter}
        onFilter={setFilter}
        onOpen={open}
        onNew={() => setNewOpen(true)}
        workspaceId={workspaceId}
        onOpenRun={(id) => setView({ screen: "run", id })}
      />
      <NewModal
        theme={theme}
        open={newOpen}
        onClose={() => setNewOpen(false)}
        defaultKind={tab === "runs" ? "persona" : tab}
        hasWorkspace={workspaceId !== undefined}
        listing={listing}
        onCreate={(target) => {
          setNewOpen(false);
          open(target);
        }}
      />
    </>
  );
}

export const LIBRARY_SCREEN = "library";

export function LibraryScreen({ theme, layout }: PluginScreenProps) {
  return <Editor theme={theme} layout={layout} />;
}

export function LibrarySidebarItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return <SidebarRow icon="UsersRound" active={currentScreen?.screenId === LIBRARY_SCREEN} onPress={() => openScreen({ screenId: LIBRARY_SCREEN })} />;
}

export function PersonasPanel({ theme, layout, workspaceId }: PluginWorkspacePanelProps) {
  return <Editor theme={theme} layout={layout} workspaceId={workspaceId} />;
}
