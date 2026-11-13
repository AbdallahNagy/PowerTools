import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** The part of Electron's safeStorage the token store needs. */
export interface SecretBox {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export interface HttpTokenStore {
  /** The saved token, or a new one saved now. */
  getOrCreate(): Promise<string>;
  /** Replaces the token. The old one stops working once the host restarts. */
  regenerate(): Promise<string>;
}

const newToken = () => randomBytes(32).toString("hex");

/**
 * Keeps the direct HTTP token encrypted on disk, so it survives restarts without sitting in plain text in
 * settings. It is 32 random bytes in hex. It is only ever handed to main-process code.
 */
export function createHttpTokenStore(path: string, box: SecretBox): HttpTokenStore {
  function requireBox() {
    if (!box.isEncryptionAvailable()) throw new Error("Secure storage is not available, so the HTTP option cannot keep a token");
  }

  async function save(token: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, box.encryptString(token));
  }

  return {
    async getOrCreate() {
      requireBox();
      try {
        const token = box.decryptString(await readFile(path));
        if (/^[0-9a-f]{64}$/.test(token)) return token;
      } catch {
        // Missing or unreadable (for example after a Windows profile change): make a new one.
      }
      const token = newToken();
      await save(token);
      return token;
    },
    async regenerate() {
      requireBox();
      const token = newToken();
      await save(token);
      return token;
    },
  };
}
