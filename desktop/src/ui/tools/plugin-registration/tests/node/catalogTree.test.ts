import { describe, expect, it } from "vitest";
import { buildCatalogTree, findNode } from "../../model/catalogTree";
import { catalogFixture } from "../catalogFixture";

describe("buildCatalogTree", () => {
  it("nests types, steps, and images under assemblies", () => {
    const tree = buildCatalogTree(catalogFixture, { showSystem: false, search: "" });

    expect(tree).toHaveLength(1);
    expect(tree[0]?.kind).toBe("assembly");
    expect(tree[0]?.label).toBe("Contoso.Plugins (1.0.0.0)");
    expect(tree[0]?.children).toHaveLength(1);
    expect(tree[0]?.children[0]?.kind).toBe("type");
    expect(tree[0]?.children[0]?.children[0]?.kind).toBe("step");
    expect(tree[0]?.children[0]?.children[0]?.children[0]?.kind).toBe("image");
  });

  it("hides system assemblies unless requested", () => {
    const hidden = buildCatalogTree(catalogFixture, { showSystem: false, search: "" });
    const shown = buildCatalogTree(catalogFixture, { showSystem: true, search: "" });

    expect(hidden.map((node) => node.data.name)).toEqual(["Contoso.Plugins"]);
    expect(shown.map((node) => node.data.name)).toEqual([
      "Contoso.Plugins",
      "Microsoft.Crm.ObjectModel",
    ]);
  });

  it("keeps ancestors of search matches", () => {
    const tree = buildCatalogTree(catalogFixture, { showSystem: false, search: "account" });

    expect(tree).toHaveLength(1);
    expect(tree[0]?.kind).toBe("assembly");
    const step = tree[0]?.children[0]?.children[0];
    expect(step?.kind).toBe("step");
    expect(step?.data.name).toContain("Update of account");
  });

  it("finds a node by composite id", () => {
    const tree = buildCatalogTree(catalogFixture, { showSystem: false, search: "" });
    const step = findNode(tree, "step:cccccccc-cccc-cccc-cccc-cccccccccccc");
    expect(step?.kind).toBe("step");
    expect(step && step.kind === "step" ? step.data.messageName : null).toBe("Update");
  });
});
