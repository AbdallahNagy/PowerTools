import { useCallback } from "react";

import { useSettings } from "../../shell/settings/SettingsContext";

/** Opens Settings at Agents (MCP), and tells whether Settings is open. */
export function useAgentSettings(): { settingsOpen: boolean; openAgentSettings(): void } {
  const { open, openSettings } = useSettings();
  const openAgentSettings = useCallback(() => openSettings("agents"), [openSettings]);
  return { settingsOpen: open, openAgentSettings };
}
