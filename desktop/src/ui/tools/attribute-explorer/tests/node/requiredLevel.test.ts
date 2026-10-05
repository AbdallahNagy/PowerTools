import { describe, expect, it } from "vitest";

import { requiredLevelLabel, requiredLevelRank } from "../../model/requiredLevel";

describe("required level", () => {
  it("maps Dataverse levels to labels", () => {
    expect(requiredLevelLabel("None")).toBe("Optional");
    expect(requiredLevelLabel("ApplicationRequired")).toBe("Required");
    expect(requiredLevelLabel("SystemRequired")).toBe("System required");
    expect(requiredLevelLabel("Recommended")).toBe("Recommended");
    expect(requiredLevelLabel("Other")).toBe("Other");
  });

  it("orders levels from optional to system required", () => {
    expect(
      ["SystemRequired", "None", "ApplicationRequired", "Recommended"].sort(
        (a, b) => requiredLevelRank(a) - requiredLevelRank(b),
      ),
    ).toEqual(["None", "Recommended", "ApplicationRequired", "SystemRequired"]);
  });
});
