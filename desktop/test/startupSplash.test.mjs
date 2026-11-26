import { expect, test } from "vitest";

import { buildStartupSplashHtml } from "../dist-electron/startupSplashHtml.js";

test("startup splash html presents the loading state without external assets or script", () => {
  const html = buildStartupSplashHtml();

  expect(html).toMatch(/Starting local services/);
  expect(html).toMatch(/class="bar"/);
  expect(html).toMatch(/http-equiv="Content-Security-Policy" content="default-src 'none'/);
  expect(html).not.toMatch(/<script/);
  expect(html).not.toMatch(/https?:\/\//);
});

test("startup splash draws the dyno wordmark with the ring as its o", () => {
  const html = buildStartupSplashHtml();

  expect(html).toMatch(/<svg class="wordmark"[^>]*aria-label="dyno"/);
  const letters = [...html.matchAll(/class="letter l\d" data-letter="(.)"/g)].map((match) => match[1]);
  expect(letters.join("")).toBe("dyn");
  expect(html).toMatch(/<circle class="ring" style="--len: 243"/);
  expect(html).toMatch(/<circle class="accent" style="--len: 47"[^>]*transform="rotate\(-68 /);
  expect(html).toMatch(/Dynamics toolbox \+ MCP server/);
});

test("startup splash loops its animation until the app is ready", () => {
  const html = buildStartupSplashHtml();

  for (const name of ["draw-ring", "draw-accent", "ring-spin", "ring-move", "letter-0", "letter-1", "letter-2", "tagline"]) {
    expect(html).toMatch(new RegExp(`animation: ${name} var\\(--cycle\\)[^;]* infinite`));
  }
  expect(html).toMatch(/prefers-reduced-motion: reduce/);
});

test("startup splash html can draw Dark Orange", () => {
  expect(buildStartupSplashHtml()).not.toMatch(/<html lang="en" data-theme="dark-orange">/);
  expect(buildStartupSplashHtml("dark-orange")).toMatch(/<html lang="en" data-theme="dark-orange">/);
});
