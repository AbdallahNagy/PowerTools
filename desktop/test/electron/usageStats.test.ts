import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { UsageStatsDeps } from "../../src/electron/usageStats.ts";

const { state } = vi.hoisted(() => ({ state: { userData: "" } }));

vi.mock("electron", () => ({
  app: { getPath: () => state.userData },
}));

const INSTALL_ID = "3f2b8c1e-4a5d-4e6f-9a7b-8c9d0e1f2a3b";

function settings() {
  return JSON.parse(readFileSync(join(state.userData, "settings.json"), "utf-8"));
}

type FetchMock = Mock<UsageStatsDeps["fetch"]>;

function fetchResolving(value: { ok: boolean }): FetchMock {
  return vi.fn<UsageStatsDeps["fetch"]>().mockResolvedValue(value);
}

function deps({
  fetch = fetchResolving({ ok: true }),
  ...overrides
}: Partial<Omit<UsageStatsDeps, "fetch">> & { fetch?: FetchMock } = {}) {
  return {
    version: "1.0.1",
    platform: "win32",
    arch: "x64",
    fetch,
    now: () => new Date("2026-10-16T09:00:00Z"),
    createId: () => INSTALL_ID,
    ...overrides,
  };
}

describe("usage stats", () => {
  beforeEach(() => {
    state.userData = mkdtempSync(join(tmpdir(), "pt-usage-"));
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(state.userData, { recursive: true, force: true });
  });

  it("is on by default and remembers when it is turned off", async () => {
    const { loadUsageStatsEnabled, saveUsageStatsEnabled } = await import(
      "../../src/electron/usageStats.ts"
    );
    expect(loadUsageStatsEnabled()).toBe(true);

    writeFileSync(join(state.userData, "settings.json"), JSON.stringify({ theme: "dark" }));
    saveUsageStatsEnabled(false);
    expect(loadUsageStatsEnabled()).toBe(false);
    expect(settings()).toEqual({ theme: "dark", usageStats: false });
  });

  it("sends only the install ID, version, platform, and architecture", async () => {
    const { sendDailyHeartbeat, HEARTBEAT_URL } = await import("../../src/electron/usageStats.ts");
    const options = deps();

    await expect(sendDailyHeartbeat(options)).resolves.toBe(true);

    expect(options.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = options.fetch.mock.calls[0];
    expect(url).toBe(HEARTBEAT_URL);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      installId: INSTALL_ID,
      version: "1.0.1",
      platform: "win32",
      arch: "x64",
    });
    expect(settings()).toMatchObject({ installId: INSTALL_ID, usageStatsLastSent: "2026-10-16" });
  });

  it("keeps the same install ID and sends once per UTC day", async () => {
    const { sendDailyHeartbeat } = await import("../../src/electron/usageStats.ts");
    const createId = vi.fn(() => INSTALL_ID);
    const first = deps({ createId });

    await sendDailyHeartbeat(first);
    await expect(sendDailyHeartbeat(first)).resolves.toBe(false);
    expect(first.fetch).toHaveBeenCalledTimes(1);

    const nextDay = deps({ createId, now: () => new Date("2026-10-17T00:30:00Z") });
    await expect(sendDailyHeartbeat(nextDay)).resolves.toBe(true);
    expect(JSON.parse(String(nextDay.fetch.mock.calls[0][1].body)).installId).toBe(INSTALL_ID);
    expect(createId).toHaveBeenCalledTimes(1);
  });

  it("sends nothing when turned off", async () => {
    writeFileSync(join(state.userData, "settings.json"), JSON.stringify({ usageStats: false }));
    const { sendDailyHeartbeat } = await import("../../src/electron/usageStats.ts");
    const options = deps();

    await expect(sendDailyHeartbeat(options)).resolves.toBe(false);
    expect(options.fetch).not.toHaveBeenCalled();
    expect(settings()).toEqual({ usageStats: false });
  });

  it("retries later when the request fails or the server rejects it", async () => {
    const { sendDailyHeartbeat } = await import("../../src/electron/usageStats.ts");

    await expect(
      sendDailyHeartbeat(deps({ fetch: vi.fn<UsageStatsDeps["fetch"]>().mockRejectedValue(new Error("offline")) })),
    ).resolves.toBe(false);
    await expect(sendDailyHeartbeat(deps({ fetch: fetchResolving({ ok: false }) }))).resolves.toBe(
      false,
    );
    expect(settings().usageStatsLastSent).toBeUndefined();

    await expect(sendDailyHeartbeat(deps())).resolves.toBe(true);
  });

  it("builds a Help menu checkbox that reports the new state", async () => {
    const { createUsageStatsMenuItem } = await import("../../src/electron/usageStats.ts");
    const onChange = vi.fn();
    const item = createUsageStatsMenuItem(true, onChange);

    expect(item).toMatchObject({ label: "Send Anonymous Usage Stats", type: "checkbox", checked: true });
    (item.click as (menuItem: { checked: boolean }) => void)({ checked: false });
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
