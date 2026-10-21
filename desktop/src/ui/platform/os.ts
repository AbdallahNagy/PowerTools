import { desktopBridge, type DesktopPlatform } from "./desktopBridge";

export function isMac(platform: DesktopPlatform = desktopBridge.platform): boolean {
  return platform === "darwin";
}

/** A Ctrl shortcut as the user types it: "Ctrl+P" on Windows and Linux, "⌘P" on macOS. */
export function commandShortcutLabel(
  key: string,
  platform: DesktopPlatform = desktopBridge.platform,
): string {
  return isMac(platform) ? `⌘${key}` : `Ctrl+${key}`;
}
