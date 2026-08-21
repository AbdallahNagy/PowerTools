import { beforeEach, describe, expect, it, vi } from "vitest";

const acquireTokenSilentMock = vi.fn();
const acquireTokenInteractiveMock = vi.fn();

vi.mock("@azure/msal-node", () => {
  class InteractionRequiredAuthError extends Error {
    constructor(message = "interaction_required") {
      super(message);
      this.name = "InteractionRequiredAuthError";
    }
  }
  class PublicClientApplication {
    acquireTokenSilent = acquireTokenSilentMock;
    acquireTokenInteractive = acquireTokenInteractiveMock;
    getTokenCache() {
      return { getAccountByHomeId: async () => null, removeAccount: async () => {} };
    }
  }
  return {
    PublicClientApplication,
    InteractionRequiredAuthError,
    LogLevel: { Warning: 2 },
  };
});

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp/msal-test" },
  BrowserWindow: class {
    isDestroyed() { return true; }
    close() {}
    on() {}
    show() {}
    loadURL() { return Promise.resolve(); }
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s: string) => Buffer.from(s, "utf-8"),
    decryptString: (b: Buffer) => b.toString("utf-8"),
  },
}));

vi.mock("../../src/electron/config.js", () => ({ AZURE_CLIENT_ID: "test-client-id" }));
vi.mock("../../src/electron/authTemplates.js", () => ({
  renderAuthenticationErrorTemplate: () => "<html></html>",
}));

async function importAuth() {
  return await import("../../src/electron/auth.ts");
}

const account = { homeAccountId: "home-1" } as never;

describe("acquireTokenSilentOrInteractive", () => {
  beforeEach(() => {
    acquireTokenSilentMock.mockReset();
    acquireTokenInteractiveMock.mockReset();
    vi.resetModules();
  });

  it("returns the silent token when acquireTokenSilent succeeds", async () => {
    acquireTokenSilentMock.mockResolvedValue({
      accessToken: "silent-token",
      account,
      expiresOn: new Date("2099-01-01T00:00:00Z"),
    });

    const { acquireTokenSilentOrInteractive } = await importAuth();
    const result = await acquireTokenSilentOrInteractive(
      "https://org.crm.dynamics.com",
      account,
    );

    expect(result.accessToken).toBe("silent-token");
    expect(acquireTokenInteractiveMock).not.toHaveBeenCalled();
  });

  it("falls back to interactive on InteractionRequiredAuthError", async () => {
    const { InteractionRequiredAuthError } = await import("@azure/msal-node");
    acquireTokenSilentMock.mockRejectedValue(new InteractionRequiredAuthError());
    acquireTokenInteractiveMock.mockResolvedValue({
      accessToken: "interactive-token",
      account,
      expiresOn: new Date("2099-01-01T00:00:00Z"),
    });

    const { acquireTokenSilentOrInteractive } = await importAuth();
    const result = await acquireTokenSilentOrInteractive(
      "https://org.crm.dynamics.com",
      account,
    );

    expect(result.accessToken).toBe("interactive-token");
    expect(acquireTokenInteractiveMock).toHaveBeenCalledOnce();
  });

  it("propagates transient errors instead of forcing an interactive prompt", async () => {
    acquireTokenSilentMock.mockRejectedValue(new Error("ENETUNREACH"));

    const { acquireTokenSilentOrInteractive } = await importAuth();

    await expect(
      acquireTokenSilentOrInteractive("https://org.crm.dynamics.com", account),
    ).rejects.toThrow("ENETUNREACH");
    expect(acquireTokenInteractiveMock).not.toHaveBeenCalled();
  });
});
