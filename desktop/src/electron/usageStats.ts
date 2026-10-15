import { randomUUID } from "crypto";
import { readSettings, writeSettings } from "./settings.js";

// Anonymous usage stats: at most one heartbeat per UTC day so the website
// worker can count active installs. The heartbeat carries a random install ID,
// the app version, the OS, and the CPU architecture. It never carries user
// names, connection details, or Dataverse data.
export const HEARTBEAT_URL = "https://powertools.abdallahnagy.com/api/heartbeat";
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

export interface Heartbeat {
  installId: string;
  version: string;
  platform: string;
  arch: string;
}

export interface UsageStatsDeps {
  version: string;
  platform: string;
  arch: string;
  fetch: (url: string, init: RequestInit) => Promise<{ ok: boolean }>;
  now?: () => Date;
  createId?: () => string;
}

/** On by default. Users turn it off from Help > Send Anonymous Usage Stats. */
export function loadUsageStatsEnabled(): boolean {
  return readSettings().usageStats !== false;
}

export function saveUsageStatsEnabled(enabled: boolean): void {
  try {
    writeSettings({ usageStats: enabled });
  } catch (err) {
    console.error("Failed to persist usage stats preference:", err);
  }
}

function getInstallId(createId: () => string): string {
  const { installId } = readSettings();
  if (typeof installId === "string" && installId) return installId;
  const created = createId();
  writeSettings({ installId: created });
  return created;
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Sends today's heartbeat unless stats are off or today's was already sent. Never throws. */
export async function sendDailyHeartbeat(deps: UsageStatsDeps): Promise<boolean> {
  try {
    if (!loadUsageStatsEnabled()) return false;
    const today = utcDay((deps.now ?? (() => new Date()))());
    if (readSettings().usageStatsLastSent === today) return false;

    const heartbeat: Heartbeat = {
      installId: getInstallId(deps.createId ?? randomUUID),
      version: deps.version,
      platform: deps.platform,
      arch: deps.arch,
    };
    const response = await deps.fetch(HEARTBEAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(heartbeat),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return false;

    writeSettings({ usageStatsLastSent: today });
    return true;
  } catch {
    // Offline or blocked. Try again at the next check.
    return false;
  }
}

/** Sends a heartbeat now and checks again every hour while the app runs. */
export function startUsageStats(deps: UsageStatsDeps): { stop: () => void } {
  let sending = false;
  const tick = () => {
    if (sending) return;
    sending = true;
    void sendDailyHeartbeat(deps).finally(() => {
      sending = false;
    });
  };

  tick();
  const timer = setInterval(tick, CHECK_INTERVAL_MS);
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}

export function createUsageStatsMenuItem(
  enabled: boolean,
  onChange: (enabled: boolean) => void,
): Electron.MenuItemConstructorOptions {
  return {
    label: "Send Anonymous Usage Stats",
    type: "checkbox",
    checked: enabled,
    click: (item) => onChange(item.checked),
  };
}
