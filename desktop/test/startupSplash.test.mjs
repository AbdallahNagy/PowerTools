import { expect, test } from "vitest";

import { buildStartupSplashHtml } from "../dist-electron/startupSplashHtml.js";

test("startup splash html presents the loading state without external assets", () => {
  const html = buildStartupSplashHtml();

  expect(html).toMatch(/Power Tools/);
  expect(html).toMatch(/Starting local services/);
  expect(html).toMatch(/class="spinner"/);
  expect(html).toMatch(/<div class="mark">PT<\/div>/);
  expect(html).not.toMatch(/https?:\/\//);
});

test("startup splash html can show the packaged app icon", () => {
  const html = buildStartupSplashHtml("data:image/png;base64,abc123");

  expect(html).toMatch(/<img class="mark" src="data:image\/png;base64,abc123" alt="" \/>/);
  expect(html).not.toMatch(/<div class="mark">PT<\/div>/);
  expect(html).not.toMatch(/https?:\/\//);
});
