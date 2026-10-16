import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({ state: { userData: "" } }));

vi.mock("electron", () => ({
  app: { getPath: () => state.userData },
}));

function settings() {
  return JSON.parse(readFileSync(join(state.userData, "settings.json"), "utf-8"));
}

describe("what's new", () => {
  beforeEach(() => {
    state.userData = mkdtempSync(join(tmpdir(), "power-tools-whats-new-"));
  });

  afterEach(() => {
    rmSync(state.userData, { recursive: true, force: true });
  });

  it("shows nothing on a fresh install and records the version", async () => {
    const { takeWhatsNew } = await import("../../src/electron/whatsNew.ts");

    expect(takeWhatsNew({ currentVersion: "1.0.1", hasSavedConnections: false })).toBeNull();
    expect(settings()).toEqual({ lastRunVersion: "1.0.1" });
    expect(takeWhatsNew({ currentVersion: "1.0.1", hasSavedConnections: true })).toBeNull();
  });

  it("shows the downloaded notes once after an update, with the star prompt only the first time", async () => {
    const { rememberDownloadedUpdate, takeWhatsNew } = await import("../../src/electron/whatsNew.ts");

    takeWhatsNew({ currentVersion: "1.0.1", hasSavedConnections: false });
    rememberDownloadedUpdate({ version: "1.1.0", releaseName: "1.1.0", releaseNotes: "<p>New</p>" });

    expect(takeWhatsNew({ currentVersion: "1.1.0", hasSavedConnections: true })).toEqual({
      version: "1.1.0",
      releaseName: "1.1.0",
      releaseDate: undefined,
      releaseNotes: "<p>New</p>",
      showStarPrompt: true,
    });
    expect(settings()).toEqual({ lastRunVersion: "1.1.0", githubStarPromptShown: true });
    expect(takeWhatsNew({ currentVersion: "1.1.0", hasSavedConnections: true })).toBeNull();

    expect(takeWhatsNew({ currentVersion: "1.2.0", hasSavedConnections: true })).toEqual({
      version: "1.2.0",
      releaseName: undefined,
      releaseDate: undefined,
      releaseNotes: undefined,
      showStarPrompt: false,
    });
  });

  it("ignores notes for a different version", async () => {
    const { rememberDownloadedUpdate, takeWhatsNew } = await import("../../src/electron/whatsNew.ts");

    takeWhatsNew({ currentVersion: "1.0.1", hasSavedConnections: false });
    rememberDownloadedUpdate({ version: "1.2.0", releaseNotes: "<p>Later</p>" });

    expect(takeWhatsNew({ currentVersion: "1.1.0", hasSavedConnections: true })?.releaseNotes).toBeUndefined();
  });

  it("treats an install from before versions were recorded as updated", async () => {
    writeFileSync(join(state.userData, "settings.json"), JSON.stringify({ theme: "dark" }));
    const { takeWhatsNew } = await import("../../src/electron/whatsNew.ts");

    expect(takeWhatsNew({ currentVersion: "1.1.0", hasSavedConnections: false })).toMatchObject({
      version: "1.1.0",
      showStarPrompt: true,
    });
    expect(settings()).toEqual({ theme: "dark", lastRunVersion: "1.1.0", githubStarPromptShown: true });
  });

  it("treats saved connections without settings as an earlier install", async () => {
    const { takeWhatsNew } = await import("../../src/electron/whatsNew.ts");

    expect(takeWhatsNew({ currentVersion: "1.1.0", hasSavedConnections: true })?.showStarPrompt).toBe(true);
  });

  it("returns null when settings cannot be written", async () => {
    rmSync(state.userData, { recursive: true, force: true });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { takeWhatsNew } = await import("../../src/electron/whatsNew.ts");

    expect(takeWhatsNew({ currentVersion: "1.1.0", hasSavedConnections: true })).toBeNull();
  });
});
