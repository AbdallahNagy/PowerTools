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

const ON_PREMISES_PRIMARY = {
  name: "Primary On Premises",
  envUrl: "https://primary.internal.example.test",
  crmType: "onpremise",
  token: undefined,
  expiresOn: null,
} satisfies ActiveConnection;

const ONLINE_TARGET = {
  name: "Target Online",
  envUrl: "https://target.crm.dynamics.com",
  crmType: "online",
  token: "target-token",
  expiresOn: "2099-01-01T00:00:00.000Z",
} satisfies ActiveConnection;

const ON_PREMISES_TARGET = {
  name: "Target On Premises",
  envUrl: "https://target.internal.example.test",
  crmType: "onpremise",
  token: undefined,
  expiresOn: null,
} satisfies ActiveConnection;

interface ObservedRequest {
  authorization: string | null;
  environmentUrl: string | null;
  connectionName: string | null;
  localSecret: string | null;
  targetAuthorization: string | null;
  targetEnvironmentUrl: string | null;
  targetConnectionName: string | null;
  url: string;
}

function observeRequest(request: Request): ObservedRequest {
  return {
    authorization: request.headers.get("Authorization"),
    environmentUrl: request.headers.get("X-Environment-Url"),
    connectionName: request.headers.get("X-Connection-Name"),
    localSecret: request.headers.get("X-Local-Secret"),
    targetAuthorization: request.headers.get("X-Target-Authorization"),
    targetEnvironmentUrl: request.headers.get("X-Target-Environment-Url"),
    targetConnectionName: request.headers.get("X-Target-Connection-Name"),
    url: request.url,
  };
}

describe("Axios API client", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("sends bootstrap and primary online authentication headers", async () => {
    installDesktopBridge(createFakeDesktopBridge({
      getApiBaseUrl: async () => SIDECAR_BASE_URL,
      getLocalSecret: async () => "local-secret",
      getActiveConnection: async () => ONLINE_PRIMARY,
    }));

    let observed: ObservedRequest | undefined;
    httpServer.use(
      http.get(`${SIDECAR_BASE_URL}/online-primary`, ({ request }) => {
        observed = observeRequest(request);
        return HttpResponse.json({ ok: true });
      }),
    );

    const { api } = await import("../../src/ui/api/client");
    await api.get("/online-primary");

    expect(observed).toEqual({
      authorization: "Bearer primary-token",
      environmentUrl: "https://primary.crm.dynamics.com",
      connectionName: null,
      localSecret: "local-secret",
      targetAuthorization: null,
      targetEnvironmentUrl: null,
      targetConnectionName: null,
      url: "http://127.0.0.1:43123/online-primary",
    });
  });

  it("sends the primary connection name without authorization for on-premises auth", async () => {
    installDesktopBridge(createFakeDesktopBridge({
      getApiBaseUrl: async () => SIDECAR_BASE_URL,
      getLocalSecret: async () => "local-secret",
      getActiveConnection: async () => ON_PREMISES_PRIMARY,
    }));

    let observed: ObservedRequest | undefined;
    httpServer.use(
      http.get(`${SIDECAR_BASE_URL}/on-premises-primary`, ({ request }) => {
        observed = observeRequest(request);
        return HttpResponse.json({ ok: true });
      }),
    );

    const { api } = await import("../../src/ui/api/client");
    await api.get("/on-premises-primary");

    expect(observed?.connectionName).toBe("Primary On Premises");
    expect(observed?.authorization).toBeNull();
    expect(observed?.environmentUrl).toBeNull();
  });

  it("sends online target authorization and environment headers", async () => {
    installDesktopBridge(createFakeDesktopBridge({
      getApiBaseUrl: async () => SIDECAR_BASE_URL,
      getLocalSecret: async () => "local-secret",
      getActiveConnection: async () => ONLINE_PRIMARY,
      getConnection: async (name) => name === "Target Online"
        ? ONLINE_TARGET
        : { error: "Connection not found" },
    }));

    let observed: ObservedRequest | undefined;
    httpServer.use(
      http.get(`${SIDECAR_BASE_URL}/online-target`, ({ request }) => {
        observed = observeRequest(request);
        return HttpResponse.json({ ok: true });
      }),
    );

    const { api } = await import("../../src/ui/api/client");
    await api.get("/online-target", {
      meta: { targetConnectionName: "Target Online" },
    });

    expect(observed?.targetAuthorization).toBe("Bearer target-token");
    expect(observed?.targetEnvironmentUrl).toBe("https://target.crm.dynamics.com");
    expect(observed?.targetConnectionName).toBeNull();
  });

  it("sends the target connection name for on-premises target auth", async () => {
    installDesktopBridge(createFakeDesktopBridge({
      getApiBaseUrl: async () => SIDECAR_BASE_URL,
      getLocalSecret: async () => "local-secret",
      getActiveConnection: async () => ONLINE_PRIMARY,
      getConnection: async (name) => name === "Target On Premises"
        ? ON_PREMISES_TARGET
        : { error: "Connection not found" },
    }));

    let observed: ObservedRequest | undefined;
    httpServer.use(
      http.get(`${SIDECAR_BASE_URL}/on-premises-target`, ({ request }) => {
        observed = observeRequest(request);
        return HttpResponse.json({ ok: true });
      }),
    );

    const { api } = await import("../../src/ui/api/client");
    await api.get("/on-premises-target", {
      meta: { targetConnectionName: "Target On Premises" },
    });

    expect(observed?.targetConnectionName).toBe("Target On Premises");
    expect(observed?.targetAuthorization).toBeNull();
    expect(observed?.targetEnvironmentUrl).toBeNull();
  });

  it("caches primary auth until clearAuthCache is called", async () => {
    const getActiveConnection = vi.fn<DesktopBridge["getActiveConnection"]>(
      async () => ONLINE_PRIMARY,
    );
    installDesktopBridge(createFakeDesktopBridge({
      getApiBaseUrl: async () => SIDECAR_BASE_URL,
      getLocalSecret: async () => "local-secret",
      getActiveConnection,
    }));

    httpServer.use(
      http.get(`${SIDECAR_BASE_URL}/cached-auth`, () => HttpResponse.json({ ok: true })),
    );

    const { api, clearAuthCache } = await import("../../src/ui/api/client");
    await api.get("/cached-auth");
    await api.get("/cached-auth");

    expect(getActiveConnection).toHaveBeenCalledTimes(1);

    clearAuthCache();
    await api.get("/cached-auth");

    expect(getActiveConnection).toHaveBeenCalledTimes(2);
  });

  it("refreshes once after a 401 and retries with the refreshed primary token", async () => {
    const refreshedPrimary = {
      name: "Primary Online",
      envUrl: "https://primary.crm.dynamics.com",
      crmType: "online",
      token: "refreshed-token",
      expiresOn: "2099-01-01T00:00:00.000Z",
    } satisfies ActiveConnection;
    const refreshToken = vi.fn<DesktopBridge["refreshToken"]>(
      async () => refreshedPrimary,
    );
    installDesktopBridge(createFakeDesktopBridge({
      getApiBaseUrl: async () => SIDECAR_BASE_URL,
      getLocalSecret: async () => "local-secret",
      getActiveConnection: async () => ONLINE_PRIMARY,
      refreshToken,
    }));

    const authorizationHeaders: Array<string | null> = [];
    let attempts = 0;
    httpServer.use(
      http.get(`${SIDECAR_BASE_URL}/refresh-once`, ({ request }) => {
        attempts += 1;
        authorizationHeaders.push(request.headers.get("Authorization"));
        return attempts === 1
          ? HttpResponse.json({ error: "Unauthorized" }, { status: 401 })
          : HttpResponse.json({ ok: true });
      }),
    );

    const { api } = await import("../../src/ui/api/client");
    await api.get("/refresh-once");

    expect(authorizationHeaders).toEqual([
      "Bearer primary-token",
      "Bearer refreshed-token",
    ]);
    expect(attempts).toBe(2);
    expect(refreshToken).toHaveBeenCalledTimes(1);
  });

  it("rejects an always-401 response after one refresh and one retry", async () => {
    const refreshedPrimary = {
      name: "Primary Online",
      envUrl: "https://primary.crm.dynamics.com",
      crmType: "online",
      token: "refreshed-token",
      expiresOn: "2099-01-01T00:00:00.000Z",
    } satisfies ActiveConnection;
    const refreshToken = vi.fn<DesktopBridge["refreshToken"]>(
      async () => refreshedPrimary,
    );
    installDesktopBridge(createFakeDesktopBridge({
      getApiBaseUrl: async () => SIDECAR_BASE_URL,
      getLocalSecret: async () => "local-secret",
      getActiveConnection: async () => ONLINE_PRIMARY,
      refreshToken,
    }));

    let attempts = 0;
    httpServer.use(
      http.get(`${SIDECAR_BASE_URL}/always-unauthorized`, () => {
        attempts += 1;
        return HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
      }),
    );

    const { api } = await import("../../src/ui/api/client");

    await expect(api.get("/always-unauthorized")).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(attempts).toBe(2);
    expect(refreshToken).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent primary refreshes into one main-process call", async () => {
    const refreshedPrimary = {
      name: "Primary Online",
      envUrl: "https://primary.crm.dynamics.com",
      crmType: "online",
      token: "refreshed-token",
      expiresOn: "2099-01-01T00:00:00.000Z",
    } satisfies ActiveConnection;
    let releaseRefresh: (value: ActiveConnection) => void = () => {};
    const refreshToken = vi.fn<DesktopBridge["refreshToken"]>(
      () =>
        new Promise<ActiveConnection>((resolve) => {
          releaseRefresh = resolve;
        }),
    );
    installDesktopBridge(createFakeDesktopBridge({
      getApiBaseUrl: async () => SIDECAR_BASE_URL,
      getLocalSecret: async () => "local-secret",
      getActiveConnection: async () => ONLINE_PRIMARY,
      refreshToken,
    }));

    let attempts = 0;
    httpServer.use(
      http.get(`${SIDECAR_BASE_URL}/concurrent-refresh`, ({ request }) => {
        attempts += 1;
        return request.headers.get("Authorization") === "Bearer refreshed-token"
          ? HttpResponse.json({ ok: true })
          : HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
      }),
    );

    const { api } = await import("../../src/ui/api/client");
    const first = api.get("/concurrent-refresh");
    const second = api.get("/concurrent-refresh");
    const third = api.get("/concurrent-refresh");

    // Let the first-attempt 401s land and enter the refresh path before releasing.
    await new Promise((r) => setTimeout(r, 20));
    releaseRefresh(refreshedPrimary);

    await Promise.all([first, second, third]);

    expect(refreshToken).toHaveBeenCalledTimes(1);
    // 3 initial 401s + 3 retries with the refreshed token.
    expect(attempts).toBe(6);
  });
});
