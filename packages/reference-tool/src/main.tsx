import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { connect } from "@powertools/sdk";
import "@powertools/ui/styles.css";
import "./app.css";
import { App } from "./App";

const root = createRoot(document.getElementById("root")!);

connect().then(
  (client) =>
    root.render(
      <StrictMode>
        <App client={client} />
      </StrictMode>,
    ),
  () => root.render(<p className="p-4 text-fg-muted">Open this tool inside Power Tools.</p>),
);
