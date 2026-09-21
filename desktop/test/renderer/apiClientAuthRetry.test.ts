import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ActiveConnection,
  DesktopBridge,
} from "../../src/ui/platform/desktopBridge";
import {
  createFakeDesktopBridge,
  installDesktopBridge,
} from "../support/desktopBridge";
import { httpServer } from "../support/httpServer";

const SIDECAR_BASE_URL = "http://127.0.0.1:43123";

const ONLINE_PRIMARY = {
  name: "Primary Online",
  envUrl: "https://primary.crm.dynamics.com",
  crmType: "online",
  token: "primary-token",
  expiresOn: "2099-01-01T00:00:00.000Z",
} satisfies ActiveConnection;

describe("API client mutation 401 policy", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("replays a 401 once when noAuthRetry is not set", async () => {
    const refreshToken = vi.fn<DesktopBridge["refreshToken"]>(async () => ({
      ...ONLINE_PRIMARY,
      token: "refreshed-token",
    }));
    installDesktopBridge(
      createFakeDesktopBridge({
        getApiBaseUrl: async () => SIDECAR_BASE_URL,
        getLocalSecret: async () => "local-secret",
        getActiveConnection: async () => ONLINE_PRIMARY,
        refreshToken,
      }),
    );

    let attempts = 0;
    httpServer.use(
      http.post(`${SIDECAR_BASE_URL}/mutation`, () => {
        attempts += 1;
        return HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
      }),
    );

    const { apiPost } = await import("../../src/ui/shared/api/client");
    await expect(apiPost("/mutation", { name: "step" })).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(attempts).toBe(2);
    expect(refreshToken).toHaveBeenCalledTimes(1);
  });

  it("does not refresh or replay a 401 when noAuthRetry is set", async () => {
    const refreshToken = vi.fn<DesktopBridge["refreshToken"]>(async () => ({
      ...ONLINE_PRIMARY,
      token: "refreshed-token",
    }));
    installDesktopBridge(
      createFakeDesktopBridge({
        getApiBaseUrl: async () => SIDECAR_BASE_URL,
        getLocalSecret: async () => "local-secret",
        getActiveConnection: async () => ONLINE_PRIMARY,
        refreshToken,
      }),
    );

    let attempts = 0;
    httpServer.use(
      http.post(`${SIDECAR_BASE_URL}/mutation`, () => {
        attempts += 1;
        return HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
      }),
    );

    const { apiPost } = await import("../../src/ui/shared/api/client");
    await expect(
      apiPost("/mutation", { name: "step" }, { meta: { noAuthRetry: true } }),
    ).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(attempts).toBe(1);
    expect(refreshToken).not.toHaveBeenCalled();
  });
});
