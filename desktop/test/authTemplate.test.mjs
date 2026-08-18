import { expect, test } from "vitest";

import { renderAuthenticationErrorTemplate } from "../dist-electron/authTemplates.js";

test("authentication error template does not show the placeholder token", () => {
  const html = renderAuthenticationErrorTemplate();

  expect(html).toMatch(/Authentication failed/);
  expect(html).toMatch(/return to PowerTools/);
  expect(html).not.toMatch(/\{errorMessage\}/);
});
