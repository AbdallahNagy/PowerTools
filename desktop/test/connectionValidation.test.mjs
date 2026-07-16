import test from "node:test";
import assert from "node:assert/strict";

import {
  validateDataverseConnection,
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
