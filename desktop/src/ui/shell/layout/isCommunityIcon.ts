/**
 * A community tool's own icon: a base64 SVG data URL from the host. The built-in fallback icon is
 * also an SVG that the bundler may inline, but never as base64, so it keeps the mask treatment.
 */
export function isCommunityIcon(tool: { source?: "built-in" | "local"; icon: string }): boolean {
  return tool.source === "local" && tool.icon.startsWith("data:image/svg+xml;base64,");
}
