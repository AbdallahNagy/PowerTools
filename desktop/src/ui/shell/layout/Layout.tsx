import { useContext, useState } from "react";
import { Bot, Boxes } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";

import { useTabs } from "../tabs/useTabs";
import { ShellShortcutDispatchContext, useShellShortcuts } from "../keyboard/useShellShortcuts";
import { ConnectionsProvider } from "../../shared/connections";
import { openToolRequest } from "../../shared/links/openToolRequest";
import { StatusBarProvider } from "../../shared/status";
import { AgentsContext } from "../agents/AgentsContext";
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
  const { openAgents } = useContext(AgentsContext);
  const allSections: PaletteSection[] = [
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
          onRun: openAgents,
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

const Layout = () => {
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [quickOpen, setQuickOpen] = useState(false);
  const { openTool } = useTabs();

  const dispatchShortcut = useShellShortcuts({
    quickOpen,
    onQuickOpenChange: setQuickOpen,
    onToggleSidebar: () => setSidebarVisible((visible) => !visible),
  });

  return (
    <ShellShortcutDispatchContext.Provider value={dispatchShortcut}>
      <ConnectionsProvider>
        <StatusBarProvider>
          <UpdateProvider>
            <div className="flex flex-col h-full w-full bg-canvas">
              <TitleBar
                sidebarVisible={sidebarVisible}
                onToggleSidebar={() => setSidebarVisible((visible) => !visible)}
              />
              <div className="flex-1 flex overflow-hidden">
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
            </div>
          </UpdateProvider>
        </StatusBarProvider>
      </ConnectionsProvider>
    </ShellShortcutDispatchContext.Provider>
  );
};

export default Layout;
