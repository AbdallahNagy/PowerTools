import "./App.css";
import Layout from "./components/layout/Layout";
import { HashRouter, Routes, Route } from "react-router-dom";
import ConnectionWindow from "./components/ConnectionWindow";
import ConnectionNamingWindow from "./components/ConnectionNamingWindow";

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route
          path="/"
          element={<Layout>{/* Tools will be rendered here */}</Layout>}
        />
        <Route path="/connection" element={<ConnectionWindow />} />
        <Route path="/connection-naming" element={<ConnectionNamingWindow />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
