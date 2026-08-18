import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactNode } from "react";

import {
  createFakeDesktopBridge,
  installDesktopBridge,
  type DesktopBridgeOverrides,
} from "./desktopBridge";

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: Infinity,
        refetchOnWindowFocus: false,
        retry: false,
      },
    },
  });
}

export interface RenderWithProvidersOptions extends Omit<RenderOptions, "wrapper"> {
  bridgeOverrides?: DesktopBridgeOverrides;
}

export function renderWithProviders(ui: ReactNode, options: RenderWithProvidersOptions = {}) {
  const { bridgeOverrides, ...renderOptions } = options;
  const bridge = createFakeDesktopBridge(bridgeOverrides);
  const queryClient = createTestQueryClient();

  installDesktopBridge(bridge);

  const result = render(ui, {
    ...renderOptions,
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });

  return { ...result, bridge, queryClient };
}
