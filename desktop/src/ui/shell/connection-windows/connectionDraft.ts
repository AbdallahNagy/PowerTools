import { useEffect, useState } from "react";

import { desktopBridge } from "../../platform/desktopBridge";
import {
  findEnvironmentClash,
  nextFreeEnvironment,
  type BrowserChoice,
  type ConnectionSummary,
  type InstalledBrowser,
} from "../../shared/connections";

export interface DescriptionDraft {
  organization: string;
  environment: string;
  browser: BrowserChoice | null;
}

export function draftFrom(connection: Pick<ConnectionSummary, "organization" | "environment" | "browser">): DescriptionDraft {
  return {
    organization: connection.organization ?? "",
    environment: connection.environment ?? "",
    browser: connection.browser,
  };
}

/** Problems that keep the draft from being saved, by field. */
export function validateDraft(
  draft: DescriptionDraft,
  connections: readonly ConnectionSummary[],
  exceptId?: string,
): { organization?: string; environment?: string } {
  const errors: { organization?: string; environment?: string } = {};
  if (!draft.organization.trim()) errors.organization = "Enter the organization, such as Contoso.";
  if (!draft.environment.trim()) errors.environment = "Pick or type an environment.";
  const clash = findEnvironmentClash(connections, draft.organization, draft.environment, exceptId);
  if (clash) {
    const suggestion = nextFreeEnvironment(connections, draft.organization, draft.environment.trim(), exceptId);
    errors.environment = `${clash.organization} already has "${clash.environment}". Try "${suggestion}".`;
  }
  return errors;
}

/** Installed browsers and their profiles, read once per window. */
export function useInstalledBrowsers(): InstalledBrowser[] {
  const [browsers, setBrowsers] = useState<InstalledBrowser[]>([]);
  useEffect(() => {
    let cancelled = false;
    desktopBridge.listBrowsers()
      .then((result) => {
        if (!cancelled) setBrowsers(result);
      })
      .catch(() => {
        // Without the list, links keep opening in the system default browser.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return browsers;
}
