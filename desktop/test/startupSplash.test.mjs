import { expect, test } from "vitest";

import { buildStartupSplashHtml } from "../dist-electron/startupSplashHtml.js";

test("startup splash html presents the loading state without external assets or script", () => {
  const html = buildStartupSplashHtml();

  expect(html).toMatch(/Starting local services/);
  expect(html).toMatch(/class="bar"/);
  expect(html).toMatch(/http-equiv="Content-Security-Policy" content="default-src 'none'/);
  expect(html).not.toMatch(/<script/);
  expect(html.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, "")).not.toMatch(/https?:\/\//);
});

test("startup splash spells the name one letter at a time", () => {
  const html = buildStartupSplashHtml();

  expect(html).toMatch(/<h1 class="wordmark" aria-label="Dyno">/);
  const letters = [...html.matchAll(/<span class="letter" style="--i: (\d)">(.)<\/span>/g)];
  expect(letters.map((match) => match[2]).join("")).toBe("Dyno");
  expect(letters.map((match) => Number(match[1]))).toEqual([0, 1, 2, 3]);
  expect(html).toMatch(/animation: type var\(--cycle\) calc\(var\(--i\) \* 160ms\) infinite/);
});

test("startup splash fans the logo blades in a loop until the app is ready", () => {
  const html = buildStartupSplashHtml();

  expect(html).toMatch(/<svg class="logo"/);
  for (const angle of [22, 44, 66]) {
    expect(html).toMatch(new RegExp(`class="blade b\\d" style="--angle: ${angle}deg`));
  }
  expect(html).toMatch(/animation: fan var\(--cycle\) var\(--delay\) infinite/);
  expect(html).toMatch(/prefers-reduced-motion: reduce/);
});

test("startup splash html can draw Dark Orange", () => {
  expect(buildStartupSplashHtml()).not.toMatch(/<html lang="en" data-theme="dark-orange">/);
  expect(buildStartupSplashHtml("dark-orange")).toMatch(/<html lang="en" data-theme="dark-orange">/);
});
