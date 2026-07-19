import test from "node:test";
import assert from "node:assert/strict";

import { shouldRefreshAuth } from "../src/ui/api/client.ts";

test("shouldRefreshAuth refreshes cached online tokens before they expire", () => {
  assert.equal(
    shouldRefreshAuth({
      crmType: "online",
      expiresOn: new Date(Date.now() + 30_000).toISOString(),
    }),
    true
  );
});

test("shouldRefreshAuth keeps fresh online tokens and on-premises connections", () => {
  assert.equal(
    shouldRefreshAuth({
      crmType: "online",
      expiresOn: new Date(Date.now() + 15 * 60_000).toISOString(),
    }),
    false
  );

  assert.equal(
    shouldRefreshAuth({
      crmType: "onpremise",
    }),
    false
  );
});
