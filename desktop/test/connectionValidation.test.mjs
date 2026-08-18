import { expect, test } from "vitest";

import {
  registerOnPremisesConnection,
  unregisterOnPremisesConnection,
  validateDataverseConnection,
  validateOnPremisesConnection,
} from "../dist-electron/connectionValidation.js";

test("validateDataverseConnection resolves when the API confirms the token works", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({ connected: true, userId: "user-1" }),
    };
  };

  const result = await validateDataverseConnection({
    apiBaseUrl: "https://localhost:7258/",
    localSecret: "secret-1",
    envUrl: "https://contoso.crm.dynamics.com",
    accessToken: "token-1",
    fetchImpl,
  });

  expect(result).toEqual({ connected: true, userId: "user-1" });
  expect(calls[0].url).toBe("https://localhost:7258/api/connect");
  expect(calls[0].options.headers.Authorization).toBe("Bearer token-1");
  expect(calls[0].options.headers["X-Environment-Url"]).toBe("https://contoso.crm.dynamics.com");
  expect(calls[0].options.headers["X-Local-Secret"]).toBe("secret-1");
});

test("validateOnPremisesConnection preserves the domain for IFD", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({ connected: true, userId: "user-2" }),
    };
  };

  const result = await validateOnPremisesConnection({
    apiBaseUrl: "http://127.0.0.1:5000/",
    localSecret: "secret-1",
    name: "__validation__",
    envUrl: "https://crm.local/Org",
    authMode: "ifd",
    username: "user",
    password: "pass",
    domain: "CONTOSO",
    fetchImpl,
  });

  expect(result).toEqual({ connected: true, userId: "user-2" });
  expect(calls[0].url).toBe("http://127.0.0.1:5000/api/connections/validate-onpremise");
  expect(calls[0].options.headers["X-Local-Secret"]).toBe("secret-1");
  expect(JSON.parse(calls[0].options.body)).toEqual({
    name: "__validation__",
    environmentUrl: "https://crm.local/Org",
    authMode: "ifd",
    username: "user",
    password: "pass",
    domain: "CONTOSO",
  });
});

test("registerOnPremisesConnection throws when registration fails", async () => {
  const fetchImpl = async () => ({
    ok: false,
    json: async () => ({ success: false, error: "invalid registration" }),
  });

  await expect(registerOnPremisesConnection({
      apiBaseUrl: "http://127.0.0.1:5000",
      localSecret: "secret-1",
      name: "Contoso",
      envUrl: "https://crm.local/Org",
      authMode: "ifd",
      username: "user@contoso.com",
      password: "pass",
      domain: "",
      fetchImpl,
    })).rejects.toThrow(/invalid registration/);
});

test("unregisterOnPremisesConnection deletes the named sidecar connection", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({ success: true }),
    };
  };

  await unregisterOnPremisesConnection({
    apiBaseUrl: "http://127.0.0.1:5000",
    localSecret: "secret-1",
    name: "Contoso Prod",
    fetchImpl,
  });

  expect(calls[0].url).toBe("http://127.0.0.1:5000/api/connections/Contoso%20Prod");
  expect(calls[0].options.method).toBe("DELETE");
  expect(calls[0].options.headers["X-Local-Secret"]).toBe("secret-1");
});

test("validateDataverseConnection rejects when the API cannot use the token", async () => {
  const fetchImpl = async () => ({
    ok: false,
    json: async () => ({ connected: false, error: "principal is not a member" }),
  });

  await expect(validateDataverseConnection({
      apiBaseUrl: "https://localhost:7258",
      localSecret: "secret-1",
      envUrl: "https://contoso.crm.dynamics.com",
      accessToken: "token-1",
      fetchImpl,
    })).rejects.toThrow(/principal is not a member/);
});
