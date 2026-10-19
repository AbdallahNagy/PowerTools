import { join } from "path";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    isPackaged: true,
    getPath: () => "/appdata",
    setPath: () => {},
    commandLine: { hasSwitch: () => false },
  },
}));

const { applyDevUserData, DEV_USER_DATA_FOLDER } = await import("../../src/electron/devUserData.ts");

function fakeApp(isPackaged: boolean, switches: string[] = []) {
  return {
    isPackaged,
    getPath: vi.fn(() => "/appdata"),
    setPath: vi.fn(),
    commandLine: { hasSwitch: (name: string) => switches.includes(name) },
  };
}

describe("applyDevUserData", () => {
  it("moves userData to its own folder for unpackaged dev runs", () => {
    const app = fakeApp(false);
    applyDevUserData(app as never);
    expect(app.setPath).toHaveBeenCalledWith("userData", join("/appdata", DEV_USER_DATA_FOLDER));
  });

  it("leaves userData alone for the installed app", () => {
    const app = fakeApp(true);
    applyDevUserData(app as never);
    expect(app.setPath).not.toHaveBeenCalled();
  });

  it("keeps an explicit --user-data-dir", () => {
    const app = fakeApp(false, ["user-data-dir"]);
    applyDevUserData(app as never);
    expect(app.setPath).not.toHaveBeenCalled();
  });
});
