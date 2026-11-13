import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface DiscoveryInfo {
  port: number;
  token: string;
  pid: number;
}

/** Writes the discovery file atomically: a temp file in the same folder, then a rename. */
export async function writeDiscovery(path: string, info: DiscoveryInfo): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(info), "utf-8");
  await rename(temp, path);
}

export async function deleteDiscovery(path: string): Promise<void> {
  await rm(path, { force: true });
}
