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

function fakeTransport() {
  return {
    send: vi.fn().mockResolvedValue({ statusCode: 200 }),
    flush: vi.fn().mockResolvedValue(true),
  };
}

describe("crash reports", () => {
  beforeEach(() => {
    state.userData = mkdtempSync(join(tmpdir(), "power-tools-crash-reports-"));
  });

  afterEach(() => {
    rmSync(state.userData, { recursive: true, force: true });
  });

  it("is on by default and remembers the opt-out", async () => {
    const { loadCrashReportsEnabled, saveCrashReportsEnabled } = await import(
      "../../src/electron/crashReports.ts"
    );

    expect(loadCrashReportsEnabled()).toBe(true);
    saveCrashReportsEnabled(false);
    expect(loadCrashReportsEnabled()).toBe(false);
    expect(settings()).toMatchObject({ crashReports: false });
  });

  it("keeps other settings when saving the preference", async () => {
    writeFileSync(join(state.userData, "settings.json"), JSON.stringify({ theme: "dark" }));
    const { saveCrashReportsEnabled } = await import("../../src/electron/crashReports.ts");

    saveCrashReportsEnabled(false);
    expect(settings()).toEqual({ theme: "dark", crashReports: false });
  });

  it("forwards envelopes only while crash reports are on", async () => {
    const { gateTransport } = await import("../../src/electron/crashReports.ts");
    const inner = fakeTransport();
    let enabled = true;
    const transport = gateTransport(() => inner, () => enabled)({} as never);

    await transport.send(["header", []] as never);
    enabled = false;
    await transport.send(["header", []] as never);

    expect(inner.send).toHaveBeenCalledTimes(1);
    await transport.flush(100);
    expect(inner.flush).toHaveBeenCalledWith(100);
  });

  it("uses the DSN override, and an empty override turns reporting off", async () => {
    const { resolveDsn, DEFAULT_SENTRY_DSN } = await import("../../src/electron/crashReports.ts");

    expect(resolveDsn({})).toBe(DEFAULT_SENTRY_DSN);
    expect(resolveDsn({ SENTRY_DSN: "https://key@example.ingest.sentry.io/1" })).toBe(
      "https://key@example.ingest.sentry.io/1",
    );
    expect(resolveDsn({ SENTRY_DSN: "" })).toBeUndefined();
  });

  it("builds a Help menu checkbox", async () => {
    const { createCrashReportsMenuItem } = await import("../../src/electron/crashReports.ts");
    const onChange = vi.fn();
    const item = createCrashReportsMenuItem(true, onChange);

    expect(item).toMatchObject({ label: "Send Crash Reports", type: "checkbox", checked: true });
    (item.click as (menuItem: { checked: boolean }) => void)({ checked: false });
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
