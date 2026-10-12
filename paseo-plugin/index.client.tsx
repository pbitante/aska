import type { PluginClientContext } from "@getpaseo/plugin/client";
import { LIBRARY_SCREEN, LibraryScreen, LibrarySidebarItem, PersonasPanel } from "./client/Editor";
import { RUN_PANEL_ID } from "./client/logic/runPills";
import { LivePanel } from "./client/run/LivePanel";
import { SettingsScreen } from "./client/SettingsScreen";
import { registerTimeline } from "./client/timeline/register";

export default function contribute(client: PluginClientContext) {
  const removers = [
    client.addScreen({ id: LIBRARY_SCREEN, title: "aska", Component: LibraryScreen }),
    client.addSidebarHeaderItem({ id: "aska", title: "aska", Component: LibrarySidebarItem }),
    client.addWorkspacePanel({ id: "personas", title: "aska personas", icon: "UsersRound", context: "workspace", Component: PersonasPanel }),
    client.addCommandCenterItem({
      id: "open-personas",
      title: "aska: edit personas",
      icon: "UsersRound",
      context: "workspace",
      onSelect: ({ openPanel }) => openPanel("personas"),
    }),
    ...registerTimeline(client),
    client.addWorkspacePanel({ id: RUN_PANEL_ID, title: "aska panel run", icon: "Scale", context: "agent", Component: LivePanel }),
    client.addCommandCenterItem({
      id: "open-panel-run",
      title: "aska: panel run",
      icon: "Scale",
      context: "agent",
      onSelect: ({ openPanel }) => openPanel(RUN_PANEL_ID),
    }),
    // Opens the panel even with no run yet (it shows its empty state), so it never depends on the pill.
    client.addSlashCommand({
      name: "aska-run",
      description: "Open the aska panel run for this agent",
      argumentHint: "",
      context: "agent",
      onSubmit: ({ openPanel }) => openPanel(RUN_PANEL_ID),
    }),
    client.addSettingsScreen({ id: "settings", title: "aska CLI", icon: "Settings", Component: SettingsScreen }),
  ];
  return () => {
    for (const remove of removers) remove();
  };
}
