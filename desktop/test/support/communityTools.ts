import type { LoadedCommunityTool } from "../../src/ui/platform/desktopBridge";

export function communityTool(
  id: string,
  overrides: Partial<LoadedCommunityTool> = {},
  name = "Demo tool",
): LoadedCommunityTool {
  return {
    id,
    folder: `C:\\tools\\${id}`,
    status: "ready",
    errors: [],
    iconDataUrl: null,
    consentGranted: true,
    manifest: {
      manifestVersion: 1,
      id,
      name,
      description: "A demo",
      version: "1.0.0",
      publisher: { name: "Acme" },
      icon: "icon.svg",
      entry: "index.html",
      minHostVersion: "0.0.0",
      permissions: [],
      messages: [],
      network: [],
      allowMultipleInstances: true,
    },
    ...overrides,
  };
}
