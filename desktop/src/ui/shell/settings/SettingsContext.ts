import { createContext, useContext } from "react";

import type { SettingsSection } from "./settingsSections";

export interface SettingsContextValue {
  open: boolean;
  section: SettingsSection;
  /** Opens Settings, at the given section or the last one shown. */
  openSettings(section?: SettingsSection): void;
  setSection(section: SettingsSection): void;
  closeSettings(): void;
}

/** Without a provider there is no Settings dialog to open. */
export const SettingsContext = createContext<SettingsContextValue>({
  open: false,
  section: "appearance",
  openSettings: () => undefined,
  setSection: () => undefined,
  closeSettings: () => undefined,
});

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
