import { describe, expect, it } from "vitest";
import { buildCatalogTree, findNode, typeLabel } from "../../model/catalogTree";
import { catalogFixture } from "../catalogFixture";

describe("buildCatalogTree", () => {
  it("nests types, steps, and images under assemblies", () => {
    const tree = buildCatalogTree(catalogFixture, { showSystem: false, search: "" });

    expect(tree).toHaveLength(1);
    expect(tree[0]?.kind).toBe("assembly");
    expect(tree[0]?.label).toBe("(assembly) Contoso.Plugins (1.0.0.0)");
    expect(tree[0]?.children).toHaveLength(2);
    expect(tree[0]?.children[0]?.kind).toBe("type");
    expect(tree[0]?.children[0]?.label).toBe("(plugin) Contoso.Plugins.AccountPlugin");
    expect(tree[0]?.children[1]?.label).toBe("(workflow activity) Contoso.Plugins.WorkflowActivity");
    expect(tree[0]?.children[0]?.children[0]?.kind).toBe("step");
    expect(tree[0]?.children[0]?.children[0]?.label).toBe("(step) AccountPlugin: Update of account");
    expect(tree[0]?.children[0]?.children[0]?.children[0]?.kind).toBe("image");
    expect(tree[0]?.children[0]?.children[0]?.children[0]?.label).toBe("(image) PreImage");
  });

  it("labels plug-in types by type name, not the PRT-generated friendly name", () => {
    const tree = buildCatalogTree(catalogFixture, { showSystem: false, search: "" });
    expect(tree[0]?.children[0]?.label).toBe("(plugin) Contoso.Plugins.AccountPlugin");

    const prtType = {
      ...catalogFixture.types[0]!,
      name: "Contoso.Plugins.AccountPlugin",
      friendlyName: "4f1b0d5a-2f6a-4c58-9c33-1e0a7f7b9d21",
    };
    expect(typeLabel(prtType)).toBe("Contoso.Plugins.AccountPlugin");

    const guidOnly = buildCatalogTree(
      { ...catalogFixture, types: [prtType] },
      { showSystem: false, search: "" },
    );
    expect(guidOnly[0]?.children[0]?.label).toBe("(plugin) Contoso.Plugins.AccountPlugin");
    expect(guidOnly[0]?.children[0]?.data.typeName).toBe("Contoso.Plugins.AccountPlugin");
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
    expect(step?.label).toBe("(step) AccountPlugin: Update of account");
  });

  it("finds a node by composite id", () => {
    const tree = buildCatalogTree(catalogFixture, { showSystem: false, search: "" });
    const step = findNode(tree, "step:cccccccc-cccc-cccc-cccc-cccccccccccc");
    expect(step?.kind).toBe("step");
    expect(step && step.kind === "step" ? step.data.messageName : null).toBe("Update");
  });
});
