import { useCallback, useEffect, useRef, useState } from "react";

import { desktopBridge, type AppSettings, type SettingsFolder, type ThemePreference } from "../../platform/desktopBridge";
import { bridgeErrorMessage } from "../community-tools/bridgeErrorMessage";

export interface AppSettingsState {
  /** Null until the first read finishes, or when it failed. */
  settings: AppSettings | null;
  busy: boolean;
  error: string | null;
  setTheme(theme: ThemePreference): Promise<void>;
  setUsageStats(enabled: boolean): Promise<void>;
  setCrashReports(enabled: boolean): Promise<void>;
  openFolder(folder: SettingsFolder): Promise<void>;
}

/** App preferences for Settings. Reads when `active` turns true and when the native menu changes one. */
export function useAppSettings(active: boolean): AppSettingsState {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const latest = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Runs one bridge call, ignoring its result if a newer call has started or the dialog is gone.
  const run = useCallback(async (call: () => Promise<AppSettings>) => {
    const request = ++latest.current;
    setBusy(true);
    try {
      const next = await call();
      if (!mounted.current || request !== latest.current) return;
      setSettings(next);
      setError(null);
    } catch (failure) {
      if (!mounted.current || request !== latest.current) return;
      setError(bridgeErrorMessage(failure));
    } finally {
      if (mounted.current && request === latest.current) setBusy(false);
    }
  }, []);

  const refresh = useCallback(() => run(() => desktopBridge.getAppSettings()), [run]);

  useEffect(() => {
    if (!active) return undefined;
    void refresh();
    try {
      return desktopBridge.onAppSettingsChanged(() => void refresh());
    } catch {
      return undefined;
    }
  }, [active, refresh]);

  const setTheme = useCallback((theme: ThemePreference) => run(() => desktopBridge.setThemePreference(theme)), [run]);
  const setUsageStats = useCallback((enabled: boolean) => run(() => desktopBridge.setUsageStatsEnabled(enabled)), [run]);
  const setCrashReports = useCallback((enabled: boolean) => run(() => desktopBridge.setCrashReportsEnabled(enabled)), [run]);
  const openFolder = useCallback(async (folder: SettingsFolder) => {
    try {
      await desktopBridge.openSettingsFolder(folder);
      setError(null);
    } catch (failure) {
      setError(bridgeErrorMessage(failure));
    }
  }, []);

  return { settings, busy, error, setTheme, setUsageStats, setCrashReports, openFolder };
}
