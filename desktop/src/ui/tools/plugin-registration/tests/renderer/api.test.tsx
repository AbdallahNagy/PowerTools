import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";

import { useRegistrationCatalog } from "../../api/useRegistrationCatalog";
import type { PluginRegistrationCatalog } from "../../model/contracts";
import { httpServer } from "../../../../../../test/support/httpServer";
import {
  createFakeDesktopBridge,
  installDesktopBridge,
} from "../../../../../../test/support/desktopBridge";
import { createTestQueryClient } from "../../../../../../test/support/render";

function createQueryWrapper(queryClient: ReturnType<typeof createTestQueryClient>) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function responseFor(connectionName: string): PluginRegistrationCatalog {
  return {
    assemblies: [
      {
        id: `${connectionName}-assembly`,
        name: `${connectionName} assembly`,
        version: "1.0.0.0",
        culture: null,
        publicKeyToken: null,
        sourceType: 0,
        isolationMode: 2,
        isManaged: false,
        isCustomizable: true,
        versionNumber: 1,
        description: null,
        solutionDisplayName: null,
        handlers: [],
      },
    ],
  };
}

describe("Plugin Registration API", () => {
  it("loads the selected connection catalog under a connection-specific cache key", async () => {
    let environmentHeader: string | null = null;
    httpServer.use(
      http.get("http://localhost/api/plugin-registration/catalog", ({ request }) => {
        environmentHeader = request.headers.get("X-Environment-Url");
        return HttpResponse.json(responseFor("Development"));
      }),
    );
    installDesktopBridge(
      createFakeDesktopBridge({
        getConnection: async (name) =>
          name === "Development"
            ? {
                name,
                envUrl: "https://development.example.test",
                crmType: "online",
                token: "development-token",
                expiresOn: "2099-01-01T00:00:00.000Z",
              }
            : { error: `Unexpected connection: ${name}` },
      }),
    );
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useRegistrationCatalog("Development"), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(environmentHeader).toBe("https://development.example.test");
    expect(result.current.data).toEqual(responseFor("Development"));
    expect(
      queryClient.getQueryCache().find({
        queryKey: ["plugin-registration", "catalog", "Development"],
      })?.queryKey,
    ).toEqual(["plugin-registration", "catalog", "Development"]);
  });

  it("refreshes its active catalog when invalidated", async () => {
    let requestCount = 0;
    httpServer.use(
      http.get("http://localhost/api/plugin-registration/catalog", () => {
        requestCount += 1;
        return HttpResponse.json({
          ...responseFor("Development"),
          assemblies: [
            {
              ...responseFor("Development").assemblies[0]!,
              name: `Development assembly ${requestCount}`,
            },
          ],
        });
      }),
    );
    installDesktopBridge(
      createFakeDesktopBridge({
        getConnection: async (name) => ({
          name,
          envUrl: "https://development.example.test",
          crmType: "online",
          token: "development-token",
          expiresOn: "2099-01-01T00:00:00.000Z",
        }),
      }),
    );
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useRegistrationCatalog("Development"), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() =>
      expect(result.current.data?.assemblies[0]?.name).toBe("Development assembly 1"),
    );
    await queryClient.invalidateQueries({
      queryKey: ["plugin-registration", "catalog", "Development"],
    });
    await waitFor(() =>
      expect(result.current.data?.assemblies[0]?.name).toBe("Development assembly 2"),
    );
    expect(requestCount).toBe(2);
  });

  it("cancels the obsolete request and never renders its result after a connection switch", async () => {
    let developmentRequested = false;
    httpServer.use(
      http.get("http://localhost/api/plugin-registration/catalog", async ({ request }) => {
        if (request.headers.get("X-Environment-Url") === "https://development.example.test") {
          developmentRequested = true;
          return new Promise<Response>(() => undefined);
        }

        return HttpResponse.json(responseFor("Production"));
      }),
    );
    installDesktopBridge(
      createFakeDesktopBridge({
        getConnection: async (name) => ({
          name,
          envUrl: `https://${name.toLowerCase()}.example.test`,
          crmType: "online",
          token: `${name}-token`,
          expiresOn: "2099-01-01T00:00:00.000Z",
        }),
      }),
    );
    const queryClient = createTestQueryClient();
    const { result, rerender } = renderHook(
      ({ connectionName }: { connectionName: string }) => useRegistrationCatalog(connectionName),
      {
        initialProps: { connectionName: "Development" },
        wrapper: createQueryWrapper(queryClient),
      },
    );

    await waitFor(() => expect(developmentRequested).toBe(true));
    rerender({ connectionName: "Production" });

    await waitFor(() =>
      expect(
        queryClient.getQueryState(["plugin-registration", "catalog", "Development"])
          ?.fetchStatus,
      ).toBe("idle"),
    );
    await waitFor(() =>
      expect(result.current.data?.assemblies[0]?.name).toBe("Production assembly"),
    );
    expect(result.current.data).not.toEqual(responseFor("Development"));
  });
});
