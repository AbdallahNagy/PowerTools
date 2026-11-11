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

/** Writes `<userData>/community-tools.json` listing the folders, with consent already granted for `consentedFolders`. */
export async function seedCommunityTools(
  userDataPath: string,
  folders: string[],
  consentedFolders: string[] = folders,
): Promise<void> {
  const consent: Record<string, string> = {};
  for (const folder of consentedFolders) {
    const manifest = JSON.parse(await readFile(join(folder, "powertools-tool.json"), "utf8")) as ManifestForConsent;
    consent[manifest.id] = consentHash(manifest);
  }
  await mkdir(userDataPath, { recursive: true });
  await writeFile(join(userDataPath, "community-tools.json"), JSON.stringify({ folders, consent }, null, 2));
}
