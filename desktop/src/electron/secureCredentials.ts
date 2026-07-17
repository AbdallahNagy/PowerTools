import electron from "electron";

type SafeStorageLike = {
  isEncryptionAvailable: () => boolean;
  encryptString: (plainText: string) => Buffer;
  decryptString: (encrypted: Buffer) => string;
};

export function createCredentialProtector(storage: SafeStorageLike) {
  return {
    encryptCredential(value: string): string {
      if (!value) return "";
      if (!storage.isEncryptionAvailable()) {
        throw new Error("Secure credential storage is not available on this device.");
      }
      const buffer = storage.encryptString(value);
      return buffer.toString("base64");
    },

    decryptCredential(value: string): string {
      if (!value) return "";
      if (!storage.isEncryptionAvailable()) {
        throw new Error("Secure credential storage is not available on this device.");
      }
      const buffer = Buffer.from(value, "base64");
      return storage.decryptString(buffer);
    },
  };
}

const defaultProtector = createCredentialProtector(electron.safeStorage);

export const encryptCredential = defaultProtector.encryptCredential;
export const decryptCredential = defaultProtector.decryptCredential;
