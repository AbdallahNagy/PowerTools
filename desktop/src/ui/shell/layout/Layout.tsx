import { useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";

import { useTabs } from "../tabs/useTabs";
import { useShellShortcuts } from "../keyboard/useShellShortcuts";
import { ConnectionsProvider } from "../../shared/connections";
import { openToolRequest } from "../../shared/links/openToolRequest";
import { StatusBarProvider } from "../../shared/status";
import { ACTIVITY_BAR_TOOLS } from "../../tools/registry";
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
  // Running a command closes the palette first, so windows it opens get focus.
  const sections: PaletteSection[] = connectionSections.map((section) => ({
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
      tools={ACTIVITY_BAR_TOOLS}
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

  useShellShortcuts({
    quickOpen,
    onQuickOpenChange: setQuickOpen,
    onToggleSidebar: () => setSidebarVisible((visible) => !visible),
  });

  return (
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
  );
};

export default Layout;
