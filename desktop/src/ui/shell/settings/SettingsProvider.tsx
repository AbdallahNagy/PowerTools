import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { desktopBridge } from "../../platform/desktopBridge";
import { AgentsContext } from "../agents/AgentsContext";
import { SettingsContext } from "./SettingsContext";
import { SettingsDialog } from "./SettingsDialog";
import type { SettingsSection } from "./settingsSections";

/** Owns the Settings dialog. Opens it from the File menu, the command palette, the sidebar, and Ctrl+,. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<SettingsSection>("appearance");

  const openSettings = useCallback((next?: SettingsSection) => {
    if (next) setSection(next);
    setOpen(true);
  }, []);
  const closeSettings = useCallback(() => setOpen(false), []);
  const openAgents = useCallback(() => openSettings("agents"), [openSettings]);

  useEffect(() => {
    try {
      const offSettings = desktopBridge.onOpenSettings(() => openSettings());
      const offAgents = desktopBridge.onOpenAgents(openAgents);
      return () => {
        offSettings();
        offAgents();
      };
    } catch {
      // No desktop bridge, for example in a plain browser: the menu items do not exist either.
      return undefined;
    }
  }, [openAgents, openSettings]);

  const settings = useMemo(
    () => ({ open, section, openSettings, setSection, closeSettings }),
    [open, section, openSettings, closeSettings],
  );
  const agents = useMemo(() => ({ openAgents }), [openAgents]);

  return (
    <SettingsContext.Provider value={settings}>
      <AgentsContext.Provider value={agents}>
        {children}
        <SettingsDialog />
      </AgentsContext.Provider>
    </SettingsContext.Provider>
  );
}
