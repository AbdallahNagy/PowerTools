export const SETTINGS_SECTIONS = ["appearance", "agents", "permissions", "privacy", "updates", "shortcuts"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const SETTINGS_SECTION_LABELS: Record<SettingsSection, string> = {
  appearance: "Appearance",
  agents: "Agents (MCP)",
  permissions: "Agent permissions",
  privacy: "Privacy",
  updates: "Updates & About",
  shortcuts: "Keyboard shortcuts",
};
