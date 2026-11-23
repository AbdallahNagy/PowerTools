import { join } from "path";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    isPackaged: true,
    getPath: () => "/appdata",
    setPath: () => {},
    commandLine: { hasSwitch: () => true },
  },
}));

const { appFolderName, applyUserDataFolder, chooseFolder } = await import("../../src/electron/userDataFolder.ts");

function fakeApp(isPackaged: boolean, switches: string[] = []) {
  return {
    isPackaged,
    getPath: vi.fn(() => "/appdata"),
    setPath: vi.fn(),
    commandLine: { hasSwitch: (name: string) => switches.includes(name) },
  };
}

/** A file system where only these folders under /appdata exist. */
const existing =
  (...folders: string[]) =>
  (path: string) =>
    folders.some((folder) => path === join("/appdata", folder));

describe("chooseFolder", () => {
  it("uses the new folder when nothing exists yet", () => {
    expect(chooseFolder("/appdata", "Dyno", "Power Tools", existing())).toBe("Dyno");
  });

  it("keeps the folder of an install from before the rename", () => {
    expect(chooseFolder("/appdata", "Dyno", "Power Tools", existing("Power Tools"))).toBe("Power Tools");
  });

  it("prefers the new folder once it exists", () => {
    expect(chooseFolder("/appdata", "Dyno", "Power Tools", existing("Dyno", "Power Tools"))).toBe("Dyno");
  });
});

describe("applyUserDataFolder", () => {
  it("puts a new install's data in the Dyno folder", () => {
    const app = fakeApp(true);
    applyUserDataFolder(app as never, existing());
    expect(app.setPath).toHaveBeenCalledWith("userData", join("/appdata", "Dyno"));
  });

  it("keeps an older install's Power Tools folder", () => {
    const app = fakeApp(true);
    applyUserDataFolder(app as never, existing("Power Tools"));
    expect(app.setPath).toHaveBeenCalledWith("userData", join("/appdata", "Power Tools"));
  });

  it("moves userData to its own folder for unpackaged dev runs", () => {
    const app = fakeApp(false);
    applyUserDataFolder(app as never, existing("Power Tools"));
    expect(app.setPath).toHaveBeenCalledWith("userData", join("/appdata", "Dyno Dev"));
  });

  it("keeps the dev folder from before the rename", () => {
    const app = fakeApp(false);
    applyUserDataFolder(app as never, existing("Power Tools Dev"));
    expect(app.setPath).toHaveBeenCalledWith("userData", join("/appdata", "Power Tools Dev"));
  });

  it("keeps an explicit --user-data-dir", () => {
    const app = fakeApp(false, ["user-data-dir"]);
    applyUserDataFolder(app as never, existing());
    expect(app.setPath).not.toHaveBeenCalled();
  });
});

describe("appFolderName", () => {
  it("names the folder the MCP connector is copied under", () => {
    expect(appFolderName(fakeApp(true) as never, existing("Power Tools"))).toBe("Power Tools");
    expect(appFolderName(fakeApp(true) as never, existing())).toBe("Dyno");
    expect(appFolderName(fakeApp(false) as never, existing())).toBe("Dyno Dev");
  });
});
