import { describe, expect, it } from "vitest";
import { buildSecretPath, isCompleteSecretPath, parseSecretPath } from "../../model/secretPath";
import { VARIABLE_TYPE } from "../../model/types";
import {
  validateDisplayName,
  validateSchemaName,
  validateValue,
} from "../../model/valueValidation";

const path = "/subscriptions/sub-1/resourceGroups/rg-app/providers/Microsoft.KeyVault/vaults/kv-app/secrets/db-password";

describe("value validation", () => {
  it.each([
    [VARIABLE_TYPE.number, "42", null],
    [VARIABLE_TYPE.number, "-3.5", null],
    [VARIABLE_TYPE.number, "3,5", "Enter a decimal number."],
    [VARIABLE_TYPE.boolean, "yes", null],
    [VARIABLE_TYPE.boolean, "Yes", "Enter yes or no."],
    [VARIABLE_TYPE.json, '{"a":1}', null],
    [VARIABLE_TYPE.json, "{a:1}", "Enter valid JSON."],
    [VARIABLE_TYPE.secret, path, null],
    [VARIABLE_TYPE.secret, "/subscriptions//resourceGroups/rg/providers/Microsoft.KeyVault/vaults/kv/secrets/s", "Fill in every part of the secret path."],
    [VARIABLE_TYPE.secret, "https://kv.vault.azure.net/secrets/s", "Enter an Azure Key Vault secret path."],
    [VARIABLE_TYPE.dataSource, "https://contoso.sharepoint.com", null],
    [VARIABLE_TYPE.string, "x".repeat(2001), "The value is longer than 2000 characters."],
  ])("type %i accepts %s: %s", (type, value, expected) => {
    expect(validateValue(type, value, true)).toBe(expected);
  });

  it("requires a current value but not a default value", () => {
    expect(validateValue(VARIABLE_TYPE.string, "", true)).toMatch(/Enter a value/);
    expect(validateValue(VARIABLE_TYPE.number, "", false)).toBeNull();
  });

  it("checks schema names, prefixes, and reserved display names", () => {
    expect(validateSchemaName("contoso_ApiUrl", "contoso")).toBeNull();
    expect(validateSchemaName("fabrikam_ApiUrl", "contoso")).toMatch(/contoso_/);
    expect(validateSchemaName("ApiUrl", null)).toMatch(/prefix/);
    expect(validateDisplayName("$connection")).toMatch(/reserved/);
    expect(validateDisplayName("  ")).toBe("Enter a display name.");
  });
});

describe("secret path", () => {
  it("round-trips the parts of a Key Vault path", () => {
    const parts = parseSecretPath(path);
    expect(parts).toEqual({
      subscriptionId: "sub-1",
      resourceGroup: "rg-app",
      vaultName: "kv-app",
      secretName: "db-password",
    });
    expect(buildSecretPath(parts!)).toBe(path);
    expect(isCompleteSecretPath(path)).toBe(true);
  });

  it("keeps empty parts while typing and rejects other shapes", () => {
    const partial = buildSecretPath({ subscriptionId: "s", resourceGroup: "", vaultName: "", secretName: "" });
    expect(parseSecretPath(partial)?.subscriptionId).toBe("s");
    expect(isCompleteSecretPath(partial)).toBe(false);
    expect(parseSecretPath("/subscriptions/s/secrets/x")).toBeNull();
  });
});
