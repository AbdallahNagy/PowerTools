export const SETTINGS_SECTIONS = ["appearance", "shortcuts", "agents", "permissions", "privacy", "updates"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const SETTINGS_SECTION_LABELS: Record<SettingsSection, string> = {
  appearance: "Appearance",
  agents: "Agents (MCP)",
  permissions: "Agent permissions",
  privacy: "Privacy",
  updates: "Updates & About",
  shortcuts: "Keyboard shortcuts",
};

/** One line under the section title. */
export const SETTINGS_SECTION_DESCRIPTIONS: Record<SettingsSection, string> = {
  appearance: "How Power Tools looks.",
  shortcuts: "Keys that work anywhere in the app.",
  agents: "Let AI agents such as Claude Code use your Power Tools connections.",
  permissions: "What agents may change on each connection without asking you.",
  privacy: "What Power Tools sends, and when.",
  updates: "Your version, updates, and where Power Tools keeps its files.",
};

/** The sections as the sidebar of the Settings dialog lists them. */
export const SETTINGS_NAV_GROUPS: ReadonlyArray<{ label: string; sections: readonly SettingsSection[] }> = [
  { label: "General", sections: ["appearance", "shortcuts"] },
  { label: "AI agents", sections: ["agents", "permissions"] },
  { label: "Application", sections: ["privacy", "updates"] },
];

/** Words a person might search for that the section's name does not contain. */
const SETTINGS_SECTION_KEYWORDS: Record<SettingsSection, string> = {
  appearance: "theme dark light system color mode look",
  shortcuts: "keys hotkeys keybindings command palette tabs sidebar ctrl",
  agents: "mcp server claude code desktop vs code client config tools groups http port token activity log",
  permissions: "approval ask allow changes connections destructive",
  privacy: "usage stats telemetry crash reports anonymous data",
  updates: "version release notes download install folders data folder log check",
};

/**
 * Sections where every word of the query starts a word of the name or keywords, so "port" finds
 * the MCP port but not crash "reports". An empty query matches all.
 */
export function matchSettingsSections(query: string): SettingsSection[] {
  const wanted = query.toLowerCase().split(/\s+/).filter(Boolean);
  return SETTINGS_SECTIONS.filter((section) => {
    const words = `${SETTINGS_SECTION_LABELS[section]} ${SETTINGS_SECTION_KEYWORDS[section]}`
      .toLowerCase()
      .split(/[^a-z0-9]+/);
    return wanted.every((word) => words.some((candidate) => candidate.startsWith(word)));
  });
}
