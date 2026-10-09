import { useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";

import { useTabs } from "../tabs/useTabs";
import { useShellShortcuts } from "../keyboard/useShellShortcuts";
import { ConnectionsProvider } from "../../shared/connections";
import { StatusBarProvider } from "../../shared/status";
import { ACTIVITY_BAR_TOOLS } from "../../tools/registry";
import ActivityBar from "./ActivityBar";
import CommandPalette from "./CommandPalette";
import TabBar from "../tabs/TabBar";
import StatusBar from "./StatusBar";
import TitleBar from "./TitleBar";
import { UpdateDialog } from "./UpdateDialog";
import { UpdateProvider } from "./UpdateProvider";

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
                  className="flex min-h-0 min-w-0 flex-col overflow-hidden"
                >
                  <TabBar />
                </Panel>
              </Group>
            </div>
            <StatusBar />
            <CommandPalette
              open={quickOpen}
              tools={ACTIVITY_BAR_TOOLS}
              onClose={() => setQuickOpen(false)}
              onOpen={(toolId) => {
                openTool(toolId);
                setQuickOpen(false);
              }}
            />
            <UpdateDialog />
          </div>
        </UpdateProvider>
      </StatusBarProvider>
    </ConnectionsProvider>
  );
};

export default Layout;
