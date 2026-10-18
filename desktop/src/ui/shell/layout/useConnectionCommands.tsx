import { useContext, useMemo } from "react";
import { Download, ExternalLink, PencilLine, Plug, Plus, Settings2, Upload } from "lucide-react";

import { desktopBridge } from "../../platform/desktopBridge";
import { useConnections } from "../../shared/connections";
import { ProductionBadge } from "../connections/ConnectionGroupList";
import { TabProviderContext } from "../tabs/TabProviderContext";
import type { PaletteSection } from "./CommandPalette";

const ICON = { size: 16, strokeWidth: 1.5 } as const;

/**
 * Connection entries for the command palette: one "switch" entry per
 * connection, then commands such as Manage connections and Import.
 */
export function useConnectionCommands(): PaletteSection[] {
  const { connections, activeConnectionId, createConnectionWindow, openConnectionManager, setActiveConnection } =
    useConnections();
  const tabs = useContext(TabProviderContext);
  const activeTab = tabs?.tabs.find((tab) => tab.id === tabs.activeTabId);
  // Tool tabs carry their own connection; elsewhere switching changes the active connection.
  const toolTab = activeTab && activeTab.toolId !== "welcome" ? activeTab : null;
  const currentId = toolTab ? toolTab.connectionId ?? null : activeConnectionId;
  const current = connections.find((connection) => connection.id === currentId) ?? null;
  const setTabConnection = tabs?.setTabConnection;

  return useMemo(() => {
    const switchTo = (id: string) => {
      if (toolTab && setTabConnection) setTabConnection(toolTab.id, id);
      else void setActiveConnection(id);
    };

    const switchCommands = connections
      .filter((connection) => connection.id !== currentId)
      .map((connection) => ({
        id: connection.id,
        title: `Switch to ${connection.displayName}`,
        tooltip: connection.envUrl,
        icon: <Plug {...ICON} />,
        badge: <ProductionBadge connection={connection} />,
        onRun: () => switchTo(connection.id),
      }));

    const commands = [
      {
        id: "add",
        title: "Add connection",
        icon: <Plus {...ICON} />,
        onRun: () => void createConnectionWindow(),
      },
      {
        id: "manage",
        title: "Manage connections",
        tooltip: "Organization, environment, browser and profile",
        icon: <Settings2 {...ICON} />,
        onRun: () => void openConnectionManager(),
      },
      ...(current
        ? [
            {
              id: "edit-current",
              title: `Edit ${current.displayName}`,
              tooltip: "Edit current connection",
              icon: <PencilLine {...ICON} />,
              onRun: () => void openConnectionManager(current.id),
            },
            {
              id: "open-current",
              title: `Open ${current.displayName} in browser`,
              tooltip: "Open current environment in browser",
              icon: <ExternalLink {...ICON} />,
              onRun: () => void desktopBridge.openUrlForConnection(current.id, current.envUrl).catch(() => undefined),
            },
          ]
        : []),
      {
        id: "import",
        title: "Import connections",
        tooltip: "From Power Tools or XrmToolBox",
        icon: <Download {...ICON} />,
        onRun: () => void openConnectionManager(null, "import"),
      },
      {
        id: "export",
        title: "Export connections",
        tooltip: "Without passwords",
        icon: <Upload {...ICON} />,
        onRun: () => void desktopBridge.exportConnections().catch(() => undefined),
      },
    ];

    return [
      { id: "connections", label: "Connections", commands: switchCommands },
      { id: "connection-commands", label: "Connection commands", commands },
    ];
  }, [connections, createConnectionWindow, current, currentId, openConnectionManager, setActiveConnection, setTabConnection, toolTab]);
}
