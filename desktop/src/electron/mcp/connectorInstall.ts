import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Copies the bundled stdio connector to a per-user folder that the installer never touches, so an MCP client
 * keeping the connector running cannot lock the installed app and block its updates.
 *
 * A file is copied only when it differs from the copy already there (size, then SHA-256). A running connector
 * locks its copy: that file is skipped and copied on a later start. Nothing here throws.
 */

export interface ConnectorInstallFs {
  /** Names of the regular files directly inside a folder. Throws if the folder is missing. */
  listFiles(folder: string): Promise<string[]>;
  /** Null when the file does not exist. */
  size(path: string): Promise<number | null>;
  sha256(path: string): Promise<string>;
  mkdir(folder: string): Promise<void>;
  copyFile(from: string, to: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
}

export type ConnectorInstallStatus =
  /** Every file was already identical. */
  | "unchanged"
  /** At least one file was copied and none was locked. */
  | "copied"
  /** At least one file is in use by a running connector and was left as it was. */
  | "locked"
  /** Nothing is bundled at the source folder, such as a dev checkout where the connector was not built. */
  | "missing"
  | "failed";

export interface ConnectorInstallResult {
  status: ConnectorInstallStatus;
  copied: string[];
  locked: string[];
  error?: string;
}

export interface ConnectorInstallOptions {
  sourceDir: string;
  targetDir: string;
  fs?: ConnectorInstallFs;
}

const LOCKED_CODES = new Set(["EBUSY", "EPERM", "EACCES"]);

function isLocked(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && LOCKED_CODES.has(code);
}

export const nodeConnectorInstallFs: ConnectorInstallFs = {
  listFiles: async (folder) =>
    (await readdir(folder, { withFileTypes: true })).filter((entry) => entry.isFile()).map((entry) => entry.name),
  size: async (path) => {
    try {
      return (await stat(path)).size;
    } catch (error) {
      if ((error as { code?: unknown }).code === "ENOENT") return null;
      throw error;
    }
  },
  sha256: (path) =>
    new Promise((resolve, reject) => {
      const hash = createHash("sha256");
      createReadStream(path)
        .on("data", (chunk) => hash.update(chunk))
        .on("error", reject)
        .on("end", () => resolve(hash.digest("hex")));
    }),
  mkdir: async (folder) => {
    await mkdir(folder, { recursive: true });
  },
  copyFile: (from, to) => copyFile(from, to),
  rename: (from, to) => rename(from, to),
  remove: (path) => rm(path, { force: true }),
};

async function identical(fs: ConnectorInstallFs, source: string, target: string): Promise<boolean> {
  const targetSize = await fs.size(target);
  if (targetSize === null || targetSize !== (await fs.size(source))) return false;
  return (await fs.sha256(source)) === (await fs.sha256(target));
}

export async function installConnector({
  sourceDir,
  targetDir,
  fs = nodeConnectorInstallFs,
}: ConnectorInstallOptions): Promise<ConnectorInstallResult> {
  const copied: string[] = [];
  const locked: string[] = [];
  try {
    let names: string[];
    try {
      names = await fs.listFiles(sourceDir);
    } catch {
      return { status: "missing", copied, locked };
    }
    if (names.length === 0) return { status: "missing", copied, locked };

    await fs.mkdir(targetDir);
    for (const name of names) {
      const source = join(sourceDir, name);
      const target = join(targetDir, name);
      if (await identical(fs, source, target)) continue;

      // Copy beside the target and rename over it, so a client starting meanwhile never runs a half-written file.
      const temporary = `${target}.${process.pid}.tmp`;
      try {
        await fs.copyFile(source, temporary);
        await fs.rename(temporary, target);
        copied.push(name);
      } catch (error) {
        await fs.remove(temporary).catch(() => undefined);
        if (!isLocked(error)) throw error;
        locked.push(name);
      }
    }

    const status = locked.length > 0 ? "locked" : copied.length > 0 ? "copied" : "unchanged";
    return { status, copied, locked };
  } catch (error) {
    return { status: "failed", copied, locked, error: error instanceof Error ? error.message : String(error) };
  }
}

/** One line for the log, or null when there is nothing worth saying. */
export function describeConnectorInstall(result: ConnectorInstallResult, targetDir: string): string | null {
  switch (result.status) {
    case "copied":
      return `MCP connector updated in ${targetDir}: ${result.copied.join(", ")}`;
    case "locked":
      return `MCP connector in ${targetDir} is in use by an MCP client; left ${result.locked.join(", ")} as it was. It is updated on a later start.`;
    case "missing":
      return "MCP connector not bundled; skipped copying it.";
    case "failed":
      return `Could not copy the MCP connector to ${targetDir}: ${result.error}`;
    default:
      return null;
  }
}
