import test from "node:test";
import assert from "node:assert/strict";

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

  assert.deepEqual(result, { connected: true, userId: "user-1" });
  assert.equal(calls[0].url, "https://localhost:7258/api/connect");
  assert.equal(calls[0].options.headers.Authorization, "Bearer token-1");
  assert.equal(
    calls[0].options.headers["X-Environment-Url"],
    "https://contoso.crm.dynamics.com"
  );
  assert.equal(calls[0].options.headers["X-Local-Secret"], "secret-1");
});

test("validateOnPremisesConnection posts credentials to the validation endpoint", async () => {
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
    authMode: "ad",
    username: "user",
    password: "pass",
    domain: "CONTOSO",
    fetchImpl,
  });

  assert.deepEqual(result, { connected: true, userId: "user-2" });
  assert.equal(calls[0].url, "http://127.0.0.1:5000/api/connections/validate-onpremise");
  assert.equal(calls[0].options.headers["X-Local-Secret"], "secret-1");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    name: "__validation__",
    environmentUrl: "https://crm.local/Org",
    authMode: "ad",
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

  await assert.rejects(
    registerOnPremisesConnection({
      apiBaseUrl: "http://127.0.0.1:5000",
      localSecret: "secret-1",
      name: "Contoso",
      envUrl: "https://crm.local/Org",
      authMode: "ifd",
      username: "user@contoso.com",
      password: "pass",
      domain: "",
      fetchImpl,
    }),
    /invalid registration/
  );
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

  assert.equal(calls[0].url, "http://127.0.0.1:5000/api/connections/Contoso%20Prod");
  assert.equal(calls[0].options.method, "DELETE");
  assert.equal(calls[0].options.headers["X-Local-Secret"], "secret-1");
});

test("validateDataverseConnection rejects when the API cannot use the token", async () => {
  const fetchImpl = async () => ({
    ok: false,
    json: async () => ({ connected: false, error: "principal is not a member" }),
  });

  await assert.rejects(
    validateDataverseConnection({
      apiBaseUrl: "https://localhost:7258",
      localSecret: "secret-1",
      envUrl: "https://contoso.crm.dynamics.com",
      accessToken: "token-1",
      fetchImpl,
    }),
    /principal is not a member/
  );
});
