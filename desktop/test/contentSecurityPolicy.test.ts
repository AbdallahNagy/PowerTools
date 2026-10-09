import { expect, test } from "vitest";

import { buildContentSecurityPolicy } from "../contentSecurityPolicy";

test("packaged renderer policy forbids eval and inline scripts", () => {
  const policy = buildContentSecurityPolicy({ dev: false });

  expect(policy).toMatch(/script-src 'self'(;|$)/);
  expect(policy).not.toMatch(/unsafe-eval/);
  expect(policy).toMatch(/connect-src 'self' http:\/\/127\.0\.0\.1:\*(;|$)/);
  expect(policy).toMatch(/object-src 'none'/);
});

test("dev renderer policy allows the Vite preamble and HMR socket without eval", () => {
  const policy = buildContentSecurityPolicy({ dev: true });

  expect(policy).toMatch(/script-src 'self' 'unsafe-inline'/);
  expect(policy).toMatch(/ws:\/\/localhost:\*/);
  expect(policy).not.toMatch(/unsafe-eval/);
});
