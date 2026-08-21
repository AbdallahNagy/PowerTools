import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import "./index.css";
import App from "./App.tsx";
import { queryClient } from "./api/queryClient.ts";
import { clearAuthCache } from "./api/client.ts";
import { getDesktopBridge } from "./platform/desktopBridge.ts";

// When the active connection changes, drop cached auth and any server data
// from the previous org so the next query fetches fresh.
getDesktopBridge()?.onConnectionStatusUpdate(() => {
  clearAuthCache();
  queryClient.invalidateQueries();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  </StrictMode>
);
