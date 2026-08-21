import { expect, test } from "vitest";

import { shouldRefreshAuth } from "../src/ui/shared/api/client.ts";

test("shouldRefreshAuth refreshes cached online tokens before they expire", () => {
  expect(shouldRefreshAuth({
      crmType: "online",
      expiresOn: new Date(Date.now() + 30_000).toISOString(),
    })).toBe(true);
});

test("shouldRefreshAuth keeps fresh online tokens and on-premises connections", () => {
  expect(shouldRefreshAuth({
      crmType: "online",
      expiresOn: new Date(Date.now() + 15 * 60_000).toISOString(),
    })).toBe(false);

  expect(shouldRefreshAuth({
      crmType: "onpremise",
    })).toBe(false);
});
