/** The parts of an Azure Key Vault secret reference path. */
export interface SecretPathParts {
  subscriptionId: string;
  resourceGroup: string;
  vaultName: string;
  secretName: string;
}

export const SECRET_PATH_FIELDS: Array<{ key: keyof SecretPathParts; label: string }> = [
  { key: "subscriptionId", label: "Subscription ID" },
  { key: "resourceGroup", label: "Resource Group" },
  { key: "vaultName", label: "Key Vault Name" },
  { key: "secretName", label: "Secret Name" },
];

export const EMPTY_SECRET_PATH: SecretPathParts = {
  subscriptionId: "",
  resourceGroup: "",
  vaultName: "",
  secretName: "",
};

const SECRET_PATH =
  /^\/subscriptions\/([^/\s]*)\/resourceGroups\/([^/\s]*)\/providers\/Microsoft\.KeyVault\/vaults\/([^/\s]*)\/secrets\/([^/\s]*)$/i;

/** `/subscriptions/{id}/resourceGroups/{group}/providers/Microsoft.KeyVault/vaults/{vault}/secrets/{secret}` */
export function buildSecretPath(parts: SecretPathParts): string {
  return (
    `/subscriptions/${parts.subscriptionId.trim()}` +
    `/resourceGroups/${parts.resourceGroup.trim()}` +
    `/providers/Microsoft.KeyVault/vaults/${parts.vaultName.trim()}` +
    `/secrets/${parts.secretName.trim()}`
  );
}

/** Splits a path into its parts. Parts may be empty while the user types. Null when the shape is wrong. */
export function parseSecretPath(path: string): SecretPathParts | null {
  const match = SECRET_PATH.exec(path.trim());
  if (!match) return null;
  return {
    subscriptionId: match[1] ?? "",
    resourceGroup: match[2] ?? "",
    vaultName: match[3] ?? "",
    secretName: match[4] ?? "",
  };
}

export function isCompleteSecretPath(path: string): boolean {
  const parts = parseSecretPath(path);
  return parts !== null && Object.values(parts).every((part) => part.length > 0);
}
