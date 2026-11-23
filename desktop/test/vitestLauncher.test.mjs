import { describe, expect, it } from "vitest";

import { normalizeDriveLetter } from "../scripts/vitest.mjs";

describe("normalizeDriveLetter", () => {
  it("uppercases a lowercase Windows drive letter", () => {
    expect(normalizeDriveLetter("d:\\dev\\Dyno\\desktop", "win32")).toBe("D:\\dev\\Dyno\\desktop");
  });

  it("leaves an uppercase drive letter alone", () => {
    expect(normalizeDriveLetter("D:\\dev\\Dyno\\desktop", "win32")).toBe("D:\\dev\\Dyno\\desktop");
  });

  it("leaves paths on other platforms alone", () => {
    expect(normalizeDriveLetter("d:/odd/but/posix", "linux")).toBe("d:/odd/but/posix");
  });
});
