import { join } from "path";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { isPackaged: true, getPath: () => "/appdata", setPath: () => {} },
}));

const { applyDevUserData, DEV_USER_DATA_FOLDER } = await import("../../src/electron/devUserData.ts");

function fakeApp(isPackaged: boolean) {
  return {
    isPackaged,
    getPath: vi.fn(() => "/appdata"),
    setPath: vi.fn(),
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
});
