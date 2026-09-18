import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";

import { useCatalog } from "../../api/useCatalog";
import { useCapabilities } from "../../api/useCapabilities";
import { useStepMutations } from "../../api/useStepMutations";
import { registrationKeys } from "../../api/queryKeys";
import { catalogFixture } from "../catalogFixture";
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

describe("Plugin Registration API", () => {
  it("loads the catalog with the selected connection headers and query key", async () => {
    let environmentHeader: string | null = null;
    httpServer.use(
      http.get("http://localhost/api/plugin-registration/catalog", ({ request }) => {
        environmentHeader = request.headers.get("X-Environment-Url");
        return HttpResponse.json(catalogFixture);
      }),
    );

    installDesktopBridge(
      createFakeDesktopBridge({
        getConnection: async (name) =>
          name === "Dev Org"
            ? {
                name,
                envUrl: "https://dev.example.test",
                crmType: "online",
                token: "dev-token",
                expiresOn: "2099-01-01T00:00:00.000Z",
              }
            : { error: `Unexpected connection: ${name}` },
      }),
    );
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useCatalog("Dev Org"), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(environmentHeader).toBe("https://dev.example.test");
    expect(result.current.data?.assemblies[0]?.name).toBe("Contoso.Plugins");
    expect(queryClient.getQueryCache().findAll({ queryKey: registrationKeys.catalog("Dev Org") })).toHaveLength(1);
  });

  it("loads capabilities for the selected connection", async () => {
    httpServer.use(
      http.get("http://localhost/api/plugin-registration/capabilities", () =>
        HttpResponse.json({
          isOnline: true,
          isolationModes: [2],
          sourceTypes: [0],
        }),
      ),
    );

    installDesktopBridge(
      createFakeDesktopBridge({
        getConnection: async (name) => ({
          name,
          envUrl: "https://dev.example.test",
          crmType: "online",
          token: "dev-token",
          expiresOn: "2099-01-01T00:00:00.000Z",
        }),
      }),
    );
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useCapabilities("Dev Org"), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      isOnline: true,
      isolationModes: [2],
      sourceTypes: [0],
    });
  });

  it("enables a step without replaying the mutation", async () => {
    const urls: string[] = [];
    httpServer.use(
      http.post("http://localhost/api/plugin-registration/steps/:id/enable", ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json({ id: "cccccccc-cccc-cccc-cccc-cccccccccccc" });
      }),
    );

    installDesktopBridge(
      createFakeDesktopBridge({
        getConnection: async (name) => ({
          name,
          envUrl: "https://dev.example.test",
          crmType: "online",
          token: "dev-token",
          expiresOn: "2099-01-01T00:00:00.000Z",
        }),
      }),
    );
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useStepMutations("Dev Org"), {
      wrapper: createQueryWrapper(queryClient),
    });

    await act(() => result.current.enable.mutateAsync("cccccccc-cccc-cccc-cccc-cccccccccccc"));
    expect(urls).toEqual([
      "http://localhost/api/plugin-registration/steps/cccccccc-cccc-cccc-cccc-cccccccccccc/enable",
    ]);
  });
});
