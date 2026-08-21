import { describe, expect, it } from "vitest";

import type { EntityInfo } from "./dataverse";

describe("Dataverse contracts", () => {
  it("defines the shared entity metadata shape", () => {
    const entity = {
      logicalName: "account",
      displayName: "Account",
      primaryIdAttribute: "accountid",
      primaryNameAttribute: "name",
      isCustom: false,
    } satisfies EntityInfo;

    expect(entity).toEqual({
      logicalName: "account",
      displayName: "Account",
      primaryIdAttribute: "accountid",
      primaryNameAttribute: "name",
      isCustom: false,
    });
  });
});
