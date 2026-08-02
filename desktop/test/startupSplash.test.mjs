import assert from "node:assert/strict";
import test from "node:test";

import { buildStartupSplashHtml } from "../dist-electron/startupSplashHtml.js";

test("startup splash html presents the loading state without external assets", () => {
  const html = buildStartupSplashHtml();

  assert.match(html, /Power Tools/);
  assert.match(html, /Starting local services/);
  assert.match(html, /class="spinner"/);
  assert.match(html, /<div class="mark">PT<\/div>/);
  assert.doesNotMatch(html, /https?:\/\//);
});

test("startup splash html can show the packaged app icon", () => {
  const html = buildStartupSplashHtml("data:image/png;base64,abc123");

  assert.match(html, /<img class="mark" src="data:image\/png;base64,abc123" alt="" \/>/);
  assert.doesNotMatch(html, /<div class="mark">PT<\/div>/);
  assert.doesNotMatch(html, /https?:\/\//);
});
