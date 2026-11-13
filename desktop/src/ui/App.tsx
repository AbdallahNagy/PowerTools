import Layout from "./shell/layout/Layout";
import { HashRouter, Routes, Route } from "react-router-dom";
import ConnectionWindow from "./shell/connection-windows/ConnectionWindow";
import ConnectionDetailsWindow from "./shell/connection-windows/ConnectionDetailsWindow";
import ConnectionManagerWindow from "./shell/connection-windows/ConnectionManagerWindow";
import { AgentsProvider } from "./shell/agents/AgentsProvider";
import { CommunityToolsProvider } from "./shell/community-tools/CommunityToolsProvider";
import { TabProvider } from "./shell/tabs/TabContext";
import { PrimaryActionProvider } from "./shared/keyboard";

function App() {
  return (
    <CommunityToolsProvider>
    <AgentsProvider>
    <TabProvider>
      <PrimaryActionProvider>
        <HashRouter>
          <Routes>
            <Route
              path="/"
              element={<Layout />}
            />
            <Route path="/connection" element={<ConnectionWindow />} />
            <Route
              path="/connection-details"
              element={<ConnectionDetailsWindow />}
            />
            <Route path="/connections" element={<ConnectionManagerWindow />} />
          </Routes>
        </HashRouter>
      </PrimaryActionProvider>
    </TabProvider>
    </AgentsProvider>
    </CommunityToolsProvider>
  );
}

export default App;
