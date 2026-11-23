import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  describeConnectorInstall,
  installConnector,
  nodeConnectorInstallFs,
  type ConnectorInstallFs,
} from "../../../src/electron/mcp/connectorInstall";

let dir: string;
let sourceDir: string;
let targetDir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "pt-connector-"));
  sourceDir = join(dir, "resources", "mcp-connector");
  targetDir = join(dir, "LocalAppData", "Power Tools", "mcp");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(join(sourceDir, "Dyno.McpConnector.exe"), "connector v2");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const target = () => join(targetDir, "Dyno.McpConnector.exe");

/** A file system whose rename fails as Windows does when the target is a running executable. */
function lockedFs(code = "EBUSY"): ConnectorInstallFs & { renames: number } {
  const fs = {
    ...nodeConnectorInstallFs,
    renames: 0,
    rename: async () => {
      fs.renames += 1;
      throw Object.assign(new Error(`${code}: resource busy or locked`), { code });
    },
  };
  return fs;
}

describe("installConnector", () => {
  it("copies the connector when there is no copy yet", async () => {
    const result = await installConnector({ sourceDir, targetDir });
    expect(result).toEqual({ status: "copied", copied: ["Dyno.McpConnector.exe"], locked: [] });
    expect(await readFile(target(), "utf-8")).toBe("connector v2");
  });

  it("copies the connector when the copy differs, even at the same size", async () => {
    await mkdir(targetDir, { recursive: true });
    await writeFile(target(), "connector v1");
    const result = await installConnector({ sourceDir, targetDir });
    expect(result.status).toBe("copied");
    expect(await readFile(target(), "utf-8")).toBe("connector v2");
  });

  it("leaves an identical copy alone", async () => {
    await installConnector({ sourceDir, targetDir });
    const before = (await stat(target())).mtimeMs;
    const fs = { ...nodeConnectorInstallFs, copyFile: async () => Promise.reject(new Error("must not copy")) };
    const result = await installConnector({ sourceDir, targetDir, fs });
    expect(result).toEqual({ status: "unchanged", copied: [], locked: [] });
    expect((await stat(target())).mtimeMs).toBe(before);
    expect(describeConnectorInstall(result, targetDir)).toBeNull();
  });

  it.each(["EBUSY", "EPERM", "EACCES"])("skips a copy locked by a running connector (%s) without throwing", async (code) => {
    await mkdir(targetDir, { recursive: true });
    await writeFile(target(), "connector v1");
    const fs = lockedFs(code);
    const result = await installConnector({ sourceDir, targetDir, fs });
    expect(result).toEqual({ status: "locked", copied: [], locked: ["Dyno.McpConnector.exe"] });
    expect(fs.renames).toBe(1);
    expect(await readFile(target(), "utf-8")).toBe("connector v1");
    // No temporary file is left behind.
    expect(await nodeConnectorInstallFs.listFiles(targetDir)).toEqual(["Dyno.McpConnector.exe"]);
    expect(describeConnectorInstall(result, targetDir)).toMatch(/in use/);
  });

  it("copies on a later start once the lock is gone", async () => {
    await installConnector({ sourceDir, targetDir, fs: lockedFs() });
    const result = await installConnector({ sourceDir, targetDir });
    expect(result.status).toBe("copied");
    expect(await readFile(target(), "utf-8")).toBe("connector v2");
  });

  it("reports a missing bundle instead of throwing", async () => {
    const result = await installConnector({ sourceDir: join(dir, "nowhere"), targetDir });
    expect(result.status).toBe("missing");
  });

  it("reports any other failure instead of throwing", async () => {
    const fs = { ...nodeConnectorInstallFs, mkdir: async () => Promise.reject(new Error("disk full")) };
    const result = await installConnector({ sourceDir, targetDir, fs });
    expect(result).toMatchObject({ status: "failed", error: "disk full" });
  });

  it("copies every file of a dev build folder", async () => {
    await writeFile(join(sourceDir, "Dyno.McpConnector.dll"), "dll");
    await writeFile(join(sourceDir, "Dyno.McpConnector.runtimeconfig.json"), "{}");
    const result = await installConnector({ sourceDir, targetDir });
    expect(result.copied.sort()).toEqual([
      "Dyno.McpConnector.dll",
      "Dyno.McpConnector.exe",
      "Dyno.McpConnector.runtimeconfig.json",
    ]);
  });
});
