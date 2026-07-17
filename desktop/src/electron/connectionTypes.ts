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

export type StoredOnlineConnection = {
  name: string;
  crmType: "online";
  envUrl: string;
  homeAccountId: string | null;
  account: AccountInfo | null;
};

export type StoredOnPremisesConnection = {
  name: string;
  crmType: "onpremise";
  envUrl: string;
  authMode: OnPremisesAuthMode;
  username: string;
  domain: string;
  encryptedPassword: string;
};

export type StoredConnection = StoredOnlineConnection | StoredOnPremisesConnection;
