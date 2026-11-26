import { expect, test } from "vitest";

import {
  buildStartupSplashHtml,
  STARTUP_SPLASH_ANIMATION_MS,
  STARTUP_SPLASH_MIN_MS,
  startupSplashTimeLeft,
} from "../dist-electron/startupSplashHtml.js";

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
  expect(html).toMatch(/<circle class="ring" style="--len: 201"/);
  expect(html).toMatch(/<circle class="accent" style="--len: 42"[^>]*transform="rotate\(-66 /);
  expect(html).toMatch(/Dynamics toolbox \+ MCP server/);
});

test("startup splash plays the animation once and holds on the wordmark", () => {
  const html = buildStartupSplashHtml();

  expect(html).toMatch(new RegExp(`--cycle: ${STARTUP_SPLASH_ANIMATION_MS}ms`));
  for (const name of ["draw-ring", "draw-accent", "ring-spin", "ring-move", "letter-0", "letter-1", "letter-2", "tagline"]) {
    expect(html).toMatch(new RegExp(`animation: ${name} var\\(--cycle\\)[^;]* both;`));
  }
  // Only the loading bar repeats.
  expect(html.match(/infinite/g)).toHaveLength(1);
  expect(html).toMatch(/animation: slide [^;]*infinite/);
  expect(html).toMatch(/prefers-reduced-motion: reduce/);
});

test("startup splash stays up until the animation has played", () => {
  expect(STARTUP_SPLASH_MIN_MS).toBeGreaterThanOrEqual(STARTUP_SPLASH_ANIMATION_MS);
  // A fast start waits for the rest of the animation.
  expect(startupSplashTimeLeft(1_000, 1_500)).toBe(STARTUP_SPLASH_MIN_MS - 500);
  // A slow start does not wait any longer.
  expect(startupSplashTimeLeft(1_000, 1_000 + STARTUP_SPLASH_MIN_MS)).toBe(0);
  expect(startupSplashTimeLeft(1_000, 60_000)).toBe(0);
});

test("startup splash html can draw Dark Orange", () => {
  expect(buildStartupSplashHtml()).not.toMatch(/<html lang="en" data-theme="dark-orange">/);
  expect(buildStartupSplashHtml("dark-orange")).toMatch(/<html lang="en" data-theme="dark-orange">/);
});
