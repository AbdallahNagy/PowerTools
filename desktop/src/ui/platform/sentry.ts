import * as Sentry from "@sentry/electron/renderer";
import { init as reactInit, reactErrorHandler } from "@sentry/react";

/**
 * Starts crash reporting in the renderer. Events go to the main process over
 * the preload IPC bridge; the main process owns the DSN, the release, and the
 * user's Send Crash Reports opt-out.
 */
export function initRendererCrashReports(): void {
  // Tests and environments without the preload bridge have nothing to send to.
  if (typeof window === "undefined" || !("__SENTRY_IPC__" in window)) return;
  Sentry.init(
    {
      integrations: [Sentry.browserTracingIntegration()],
      tracesSampleRate: import.meta.env.DEV ? 1.0 : 0.2,
      // The sidecar is not traced, and extra headers would trip its CORS check.
      tracePropagationTargets: [],
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
      },
    },
    reactInit,
  );
}

/** React 19 root error hooks that report to Sentry. */
export const rootErrorHandlers = {
  onUncaughtError: reactErrorHandler(),
  onCaughtError: reactErrorHandler(),
  onRecoverableError: reactErrorHandler(),
};
