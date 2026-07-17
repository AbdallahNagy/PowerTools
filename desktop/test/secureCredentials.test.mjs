import test from "node:test";
import assert from "node:assert/strict";

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

  assert.notEqual(encrypted, "secret-password");
  assert.equal(protector.decryptCredential(encrypted), "secret-password");
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

  assert.throws(
    () => protector.encryptCredential("secret-password"),
    /Secure credential storage is not available/
  );
  assert.throws(
    () => protector.decryptCredential("abc"),
    /Secure credential storage is not available/
  );
});
