import { app } from "electron";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

function settingsFilePath(): string {
  return join(app.getPath("userData"), "settings.json");
}

/** Reads settings.json. A missing or unreadable file reads as empty. */
export function readSettings(): Record<string, unknown> {
  const path = settingsFilePath();
  if (!existsSync(path)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Merges the given keys into settings.json and keeps every other key. Throws on write failure. */
export function writeSettings(patch: Record<string, unknown>): void {
  writeFileSync(settingsFilePath(), JSON.stringify({ ...readSettings(), ...patch }, null, 2), "utf-8");
}
