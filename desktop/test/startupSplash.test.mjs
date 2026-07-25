import assert from "node:assert/strict";
import test from "node:test";

import { buildStartupSplashHtml } from "../dist-electron/startupSplashHtml.js";

test("startup splash html presents the loading state without external assets", () => {
  const html = buildStartupSplashHtml();

  assert.match(html, /Power Tools/);
  assert.match(html, /Starting local services/);
  assert.match(html, /class="spinner"/);
  assert.doesNotMatch(html, /https?:\/\//);
});
