import { expect, test } from "vitest";

import { createCredentialProtector } from "../dist-electron/secureCredentials.js";

test("credential protector encrypts and decrypts with safeStorage when available", () => {
  const storage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${value}`, "utf-8"),
    decryptString: (buffer) =>
      buffer.toString("utf-8").replace(/^encrypted:/, ""),
  };
  const protector = createCredentialProtector(storage);

  const encrypted = protector.encryptCredential("secret-password");

  expect(encrypted).not.toBe("secret-password");
  expect(protector.decryptCredential(encrypted)).toBe("secret-password");
});

test("credential protector refuses plaintext fallback when encryption is unavailable", () => {
  const storage = {
    isEncryptionAvailable: () => false,
    encryptString: () => {
      throw new Error("should not encrypt");
    },
    decryptString: () => {
      throw new Error("should not decrypt");
    },
  };
  const protector = createCredentialProtector(storage);

  expect(() => protector.encryptCredential("secret-password")).toThrow(
    /Secure credential storage is not available/
  );
  expect(() => protector.decryptCredential("abc")).toThrow(
    /Secure credential storage is not available/
  );
});
