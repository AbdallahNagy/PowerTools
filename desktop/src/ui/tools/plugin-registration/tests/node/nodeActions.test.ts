import { describe, expect, it } from "vitest";
import { buildCatalogTree } from "../../model/catalogTree";
import { getNodeActions } from "../../model/nodeActions";
import { catalogFixture } from "../catalogFixture";

describe("getNodeActions", () => {
  it("offers step lifecycle actions for a custom step", () => {
    const tree = buildCatalogTree(catalogFixture, { showSystem: false, search: "" });
    const step = tree[0]?.children[0]?.children[0];
    expect(step?.kind).toBe("step");
    expect(getNodeActions(step!).map((action) => action.id)).toEqual([
      "update-step",
      "disable-step",
      "register-image",
      "unregister-step",
    ]);
  });

  it("disables mutations on system assemblies", () => {
    const tree = buildCatalogTree(catalogFixture, { showSystem: true, search: "" });
    const system = tree.find((node) => node.kind === "assembly" && node.data.isSystem);
    expect(system).toBeDefined();
    expect(
      getNodeActions(system!).every((action) => action.disabledReason),
    ).toBe(true);
  });
});
