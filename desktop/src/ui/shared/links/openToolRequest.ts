import { desktopBridge } from "../../platform/desktopBridge";
import { buildToolRequestUrl } from "./toolRequest";

/** Opens the GitHub tool request form in the browser, tagged with the app version. */
export async function openToolRequest(name?: string): Promise<void> {
  const version = await desktopBridge.getAppVersion().catch(() => "");
  await desktopBridge.openExternalUrl(
    buildToolRequestUrl({ name, source: version ? `desktop ${version}` : "desktop" }),
  );
}
