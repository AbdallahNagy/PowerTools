import { useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";

import ActivityBar from "./ActivityBar";
import TabBar from "./TabBar";
import StatusBar from "./StatusBar";
import TitleBar from "./TitleBar";
import { ConnectionsProvider } from "../../shared/connections";
import { StatusBarProvider } from "../../shared/status";

const Layout = () => {
  const [sidebarVisible, setSidebarVisible] = useState(true);

  return (
    <ConnectionsProvider>
      <StatusBarProvider>
        <div className="flex flex-col h-full w-full bg-[var(--color-bg-dark)]">
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
                  className="w-1 cursor-col-resize bg-[var(--color-bg-light)] hover:bg-[var(--color-primary)] active:bg-[var(--color-primary)]"
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
        </div>
      </StatusBarProvider>
    </ConnectionsProvider>
  );
};

export default Layout;
