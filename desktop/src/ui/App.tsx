import "./App.css";
import Layout from "./components/layout/Layout";
import { HashRouter, Routes, Route } from "react-router-dom";
import ConnectionWindow from "./components/ConnectionWindow";
import ConnectionNamingWindow from "./components/ConnectionNamingWindow";
import { TabProvider } from "./context/TabContext";
import { PrimaryActionProvider } from "./shared/keyboard";

function App() {
  return (
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
              path="/connection-naming"
              element={<ConnectionNamingWindow />}
            />
          </Routes>
        </HashRouter>
      </PrimaryActionProvider>
    </TabProvider>
  );
}

export default App;
