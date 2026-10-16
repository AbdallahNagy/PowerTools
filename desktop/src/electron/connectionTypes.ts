import type { AccountInfo } from "@azure/msal-node";

export type CrmType = "online" | "onpremise";
export type OnPremisesAuthMode = "ad" | "ifd";

export type OnlineConnectionInput = {
  crmType: "online";
  serverUrl: string;
};

export type OnPremisesConnectionInput = {
  crmType: "onpremise";
  serverUrl: string;
  authMode: OnPremisesAuthMode;
  username: string;
  password: string;
  domain: string;
};

export type ConnectionInput = OnlineConnectionInput | OnPremisesConnectionInput;

export const BROWSER_IDS = ["edge", "chrome", "brave", "firefox"] as const;
export type BrowserId = (typeof BROWSER_IDS)[number];

/** Where links for a connection open. `profile` is the browser's profile directory or name. */
export type BrowserChoice = { id: BrowserId; profile?: string };

/** What the user describes about a connection. Organization + environment name it. */
export type ConnectionDescription = {
  organization: string | null;
  environment: string | null;
  browser: BrowserChoice | null;
};

type ConnectionMeta = ConnectionDescription & {
  id: string;
  /** Name from before organizations existed. Kept only until organization and environment are set. */
  legacyName?: string;
};

export type StoredOnlineConnection = ConnectionMeta & {
  crmType: "online";
  envUrl: string;
  homeAccountId: string | null;
  account: AccountInfo | null;
};

export type StoredOnPremisesConnection = ConnectionMeta & {
  crmType: "onpremise";
  envUrl: string;
  authMode: OnPremisesAuthMode;
  username: string;
  domain: string;
  encryptedPassword: string;
  /** Imported without a password; the user has to enter one before first use. */
  needsPassword?: boolean;
};

export type StoredConnection = StoredOnlineConnection | StoredOnPremisesConnection;

/** The connection fields the renderer may see. No secrets or account details. */
export type ConnectionSummary = ConnectionDescription & {
  id: string;
  legacyName: string | null;
  envUrl: string;
  crmType: CrmType;
  needsPassword: boolean;
};
