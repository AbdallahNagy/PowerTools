export type BrowserId = "edge" | "chrome" | "brave" | "firefox";

/** Where links for a connection open. `profile` is the profile directory (Chromium) or name (Firefox). */
export interface BrowserChoice {
  id: BrowserId;
  profile?: string;
}

export interface BrowserProfile {
  /** Value saved in {@link BrowserChoice.profile}. */
  id: string;
  name: string;
}

export interface InstalledBrowser {
  id: BrowserId;
  name: string;
  profiles: BrowserProfile[];
}

/** What the user describes about a connection. Organization + environment name it. */
export interface ConnectionDescription {
  organization: string | null;
  environment: string | null;
  browser: BrowserChoice | null;
}

/** A connection as the main process sends it. No secrets. */
export interface ConnectionSummary extends ConnectionDescription {
  id: string;
  /** Name from before organizations existed; set only until the user describes the connection. */
  legacyName: string | null;
  envUrl: string;
  crmType: "online" | "onpremise";
  /** Imported on-premises connection whose password has not been entered yet. */
  needsPassword: boolean;
}

export type EnvironmentKind = "dev" | "test" | "uat" | "staging" | "production" | "other";

/** A connection as tools see it. Use `id` as the key and `displayName` as the text. */
export interface ConnectionInfo extends ConnectionSummary {
  /** "Organization · Environment", or the old name for connections not described yet. */
  displayName: string;
  environmentKind: EnvironmentKind;
  /** True while the connection has no organization + environment and shows under Other. */
  isUngrouped: boolean;
}

export interface ConnectionUpdate extends Partial<ConnectionDescription> {
  /** New password for an on-premises connection. */
  password?: string;
}

export type ImportStatus = "new" | "duplicate" | "ungrouped" | "unsupported";

export interface ImportPreviewItem {
  key: string;
  organization: string | null;
  environment: string | null;
  legacyName: string | null;
  envUrl: string;
  crmType: "online" | "onpremise";
  status: ImportStatus;
  /** Why the connection is skipped or goes under Other. */
  reason?: string;
}

export interface ImportPreview {
  source: "powertools" | "xrmtoolbox";
  fileName: string;
  items: ImportPreviewItem[];
}
