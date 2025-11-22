import "./App.css";
import Layout from "./components/layout/Layout";
import { HashRouter, Routes, Route } from "react-router-dom";
import ConnectionWindow from "./components/ConnectionWindow";
import ConnectionNamingWindow from "./components/ConnectionNamingWindow";
import { TabProvider } from "./context/TabContext";

function App() {
  return (
    <TabProvider>
      <HashRouter>
        <Routes>
          <Route
            path="/"
            element={<Layout>{/* Tools will be rendered here */}</Layout>}
          />
          <Route path="/connection" element={<ConnectionWindow />} />
          <Route
            path="/connection-naming"
            element={<ConnectionNamingWindow />}
          />
        </Routes>
      </HashRouter>
    </TabProvider>
  );
}

export default App;
