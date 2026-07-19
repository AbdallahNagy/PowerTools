import test from "node:test";
import assert from "node:assert/strict";

import { renderAuthenticationErrorTemplate } from "../dist-electron/authTemplates.js";

test("authentication error template does not show the placeholder token", () => {
  const html = renderAuthenticationErrorTemplate();

  assert.match(html, /Authentication failed/);
  assert.match(html, /return to PowerTools/);
  assert.doesNotMatch(html, /\{errorMessage\}/);
});
