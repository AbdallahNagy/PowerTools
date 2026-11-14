import { useState } from "react";
import { Bot, Boxes, Settings } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";

import { useTabs } from "../tabs/useTabs";
import { ShellShortcutDispatchContext, useShellShortcuts } from "../keyboard/useShellShortcuts";
import { ConnectionsProvider } from "../../shared/connections";
import { openToolRequest } from "../../shared/links/openToolRequest";
import { StatusBarProvider } from "../../shared/status";
import { SettingsProvider } from "../settings/SettingsProvider";
import { useSettings } from "../settings/SettingsContext";
import { ApprovalDialog } from "../agents/ApprovalDialog";
import { useCommunityTools, useToolRegistry } from "../community-tools/useToolRegistry";
import ActivityBar from "./ActivityBar";
import CommandPalette, { type PaletteSection } from "./CommandPalette";
import { useConnectionCommands } from "./useConnectionCommands";
import TabBar from "../tabs/TabBar";
import StatusBar from "./StatusBar";
import TitleBar from "./TitleBar";
import { UpdateDialog } from "./UpdateDialog";
import { UpdateProvider } from "./UpdateProvider";

/** The command palette with tools and connection commands. Needs ConnectionsProvider. */
function ShellCommandPalette({
  open,
  onClose,
  onOpenTool,
}: {
  open: boolean;
  onClose: () => void;
  onOpenTool: (toolId: string) => void;
}) {
  const connectionSections = useConnectionCommands();
  const { activityBarTools } = useToolRegistry();
  const { openManager } = useCommunityTools();
  const { openSettings } = useSettings();
  const allSections: PaletteSection[] = [
    {
      id: "settings",
      label: "Settings",
      commands: [
        {
          id: "settings-open",
          title: "Settings…",
          tooltip: "Theme, agents (MCP), privacy, updates, and shortcuts",
          icon: <Settings size={16} strokeWidth={1.5} />,
          onRun: () => openSettings(),
        },
      ],
    },
    ...connectionSections,
    {
      id: "community-tools",
      label: "Community tools",
      commands: [
        {
          id: "manage",
          title: "Community tools…",
          tooltip: "Load, review, and remove community tools",
          icon: <Boxes size={16} strokeWidth={1.5} />,
          onRun: openManager,
        },
      ],
    },
    {
      id: "agents",
      label: "Agents",
      commands: [
        {
          id: "agents-mcp",
          title: "Agents (MCP)…",
          tooltip: "Let AI agents such as Claude Code use your connections",
          icon: <Bot size={16} strokeWidth={1.5} />,
          onRun: () => openSettings("agents"),
        },
      ],
    },
  ];
  // Running a command closes the palette first, so windows it opens get focus.
  const sections: PaletteSection[] = allSections.map((section) => ({
    ...section,
    commands: section.commands.map((command) => ({
      ...command,
      onRun: () => {
        onClose();
        command.onRun();
      },
    })),
  }));

  return (
    <CommandPalette
      open={open}
      tools={activityBarTools}
      sections={sections}
      onClose={onClose}
      onOpen={(toolId) => {
        onOpenTool(toolId);
        onClose();
      }}
      onRequestTool={(name) => {
        onClose();
        void openToolRequest(name);
      }}
    />
  );
}

/** The shell inside its providers, so shortcuts and the sidebar can open Settings. */
const ShellBody = () => {
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [quickOpen, setQuickOpen] = useState(false);
  const { openTool } = useTabs();
  const { openSettings } = useSettings();

  const dispatchShortcut = useShellShortcuts({
    quickOpen,
    onQuickOpenChange: setQuickOpen,
    onToggleSidebar: () => setSidebarVisible((visible) => !visible),
    onOpenSettings: () => openSettings(),
  });

  return (
    <ShellShortcutDispatchContext.Provider value={dispatchShortcut}>
      <div className="flex flex-col h-full w-full bg-canvas">
        <TitleBar
          sidebarVisible={sidebarVisible}
          onToggleSidebar={() => setSidebarVisible((visible) => !visible)}
        />
        <div className="flex-1 flex overflow-hidden">
          {/* Hidden means collapsed to icons, so tools, the connection, and Settings stay one click away. */}
          {sidebarVisible ? null : <ActivityBar collapsed />}
          <Group
            className="flex flex-1 min-h-0 min-w-0"
            orientation="horizontal"
          >
            {sidebarVisible ? (
              <Panel
                id="shell-sidebar"
                defaultSize="220px"
                minSize="180px"
                maxSize="40%"
                className="min-h-0 min-w-0"
              >
                <ActivityBar />
              </Panel>
            ) : null}
            {sidebarVisible ? (
              <Separator
                aria-label="Resize sidebar"
                className="w-1 cursor-col-resize bg-raised hover:bg-accent active:bg-accent"
              />
            ) : null}
            <Panel
              id="shell-main"
              minSize="40%"
              className="flex min-h-0 min-w-0 flex-col"
              // The panel sets an inline `overflow: auto`, which beats the
              // class. Clip here so only the tab strip scrolls sideways.
              style={{ overflow: "hidden" }}
            >
              <TabBar />
            </Panel>
          </Group>
        </div>
        <StatusBar />
        <ShellCommandPalette
          open={quickOpen}
          onClose={() => setQuickOpen(false)}
          onOpenTool={openTool}
        />
        <UpdateDialog />
        <ApprovalDialog />
      </div>
    </ShellShortcutDispatchContext.Provider>
  );
};

const Layout = () => (
  <ConnectionsProvider>
    <StatusBarProvider>
      <UpdateProvider>
        <SettingsProvider>
          <ShellBody />
        </SettingsProvider>
      </UpdateProvider>
    </StatusBarProvider>
  </ConnectionsProvider>
);

export default Layout;
