import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { consentHash } from "../../src/electron/communityTools/toolStore.js";

export const referenceToolFolder = fileURLToPath(new URL("../../../packages/reference-tool/dist", import.meta.url));
export const hangingToolFolder = fileURLToPath(new URL("./fixtures/hanging-tool", import.meta.url));

interface ManifestForConsent {
  id: string;
  permissions: string[];
  messages: string[];
  network: string[];
}

/** Writes `<userData>/community-tools.json` listing the folders, with consent already granted for `consentedFolders` in the folder-bound form the store writes. */
export async function seedCommunityTools(
  userDataPath: string,
  folders: string[],
  consentedFolders: string[] = folders,
): Promise<void> {
  const ids: Record<string, string> = {};
  const grants: Record<string, { id: string; hash: string }> = {};
  for (const folder of consentedFolders) {
    const manifest = JSON.parse(await readFile(join(folder, "powertools-tool.json"), "utf8")) as ManifestForConsent;
    ids[folder] = manifest.id;
    grants[folder] = { id: manifest.id, hash: consentHash(manifest) };
  }
  await mkdir(userDataPath, { recursive: true });
  await writeFile(join(userDataPath, "community-tools.json"), JSON.stringify({ folders, consent: {}, ids, grants }, null, 2));
}
