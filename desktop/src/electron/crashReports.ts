import { readSettings, writeSettings } from "./settings.js";

// Crash reports go to Sentry (project powertools-desktop). A DSN only allows
// sending events, so it is safe to ship in the app. Only packaged builds
// report by default; development builds send nothing unless SENTRY_DSN is set.
// Set SENTRY_DSN to point a build at another project, or to an empty string
// to turn reporting off (automated tests do this).
export const DEFAULT_SENTRY_DSN =
  "https://9caf640d2def4a2e6d021c1324e0eda8@o4512262338707456.ingest.de.sentry.io/4512262735724624";

export function resolveDsn(env: NodeJS.ProcessEnv, isPackaged: boolean): string | undefined {
  const override = env.SENTRY_DSN;
  if (override === undefined) return isPackaged ? DEFAULT_SENTRY_DSN : undefined;
  return override || undefined;
}

/** On by default. Users turn it off from Help > Send Crash Reports. */
export function loadCrashReportsEnabled(): boolean {
  return readSettings().crashReports !== false;
}

export function saveCrashReportsEnabled(enabled: boolean): void {
  try {
    writeSettings({ crashReports: enabled });
  } catch (err) {
    console.error("Failed to persist crash reports preference:", err);
  }
}

interface TransportLike<Envelope, Response> {
  send: (envelope: Envelope) => PromiseLike<Response>;
  flush: (timeout?: number) => PromiseLike<boolean>;
}

/**
 * Wraps the Sentry transport so nothing leaves the machine while crash reports
 * are off. Renderer events and native crash dumps also go through the main
 * process transport, so this one gate covers every process. The preference is
 * read on each send, so the menu toggle applies without a restart.
 */
export function gateTransport<Options, Envelope, Response>(
  makeTransport: (options: Options) => TransportLike<Envelope, Response>,
  isEnabled: () => boolean,
): (options: Options) => TransportLike<Envelope, Response | Record<string, never>> {
  return (options) => {
    const inner = makeTransport(options);
    return {
      send: (envelope) => (isEnabled() ? inner.send(envelope) : Promise.resolve({})),
      flush: (timeout) => inner.flush(timeout),
    };
  };
}

export function createCrashReportsMenuItem(
  enabled: boolean,
  onChange: (enabled: boolean) => void,
): Electron.MenuItemConstructorOptions {
  return {
    label: "Send Crash Reports",
    type: "checkbox",
    checked: enabled,
    click: (item) => onChange(item.checked),
  };
}
