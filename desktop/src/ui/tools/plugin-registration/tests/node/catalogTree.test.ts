import { describe, expect, it } from "vitest";

import { buildCatalogTree, filterCatalogTree, findCatalogNode } from "../../model/catalogTree";
import type { PluginRegistrationCatalog } from "../../model/contracts";

const catalog: PluginRegistrationCatalog = {
  assemblies: [
    {
      id: "assembly-1",
      name: "Contoso.Plugins",
      version: "1.0.0.0",
      culture: null,
      publicKeyToken: null,
      sourceType: 0,
      isolationMode: 2,
      isManaged: false,
      isCustomizable: true,
      versionNumber: 1,
      description: "Shared business logic",
      solutionDisplayName: "Core solution",
      handlers: [
        {
          id: "plugin-1",
          kind: "plugin",
          typeName: "Contoso.Plugins.AccountPlugin",
          name: "Account Plugin",
          friendlyName: "Account processing",
          description: "Runs on account updates",
          workflowActivityGroupName: null,
          isManaged: false,
          isCustomizable: true,
          versionNumber: 2,
          assemblyId: "assembly-1",
          solutionDisplayName: "Core solution",
          workflowArguments: [],
          dependencies: [],
          steps: [
            {
              id: "step-1",
              pluginHandlerId: "plugin-1",
              name: "Account Update",
              description: "Update step",
              messageLabel: "Update",
              primaryTableLabel: "Account",
              secondaryTableLabel: null,
              stageLabel: "Post-operation",
              modeLabel: "Synchronous",
              stage: 40,
              mode: 0,
              rank: 1,
              isEnabled: true,
              isManaged: false,
              isCustomizable: true,
              versionNumber: 3,
              secureConfigExists: false,
              solutionDisplayName: "Core solution",
              images: [
                {
                  id: "image-1",
                  pluginStepId: "step-1",
                  name: "Account Target",
                  description: "Target image",
                  imageTypeLabel: "Post Image",
                  entityAlias: "Target",
                  attributes: ["name", "accountnumber"],
                  isManaged: false,
                  isCustomizable: true,
                  versionNumber: 4,
                  solutionDisplayName: "Core solution",
                },
              ],
            },
          ],
        },
        {
          id: "workflow-1",
          kind: "workflowActivity",
          typeName: "Contoso.Plugins.Workflow.ValidateAccount",
          name: "Validate Account",
          friendlyName: null,
          description: "Validates an account",
          workflowActivityGroupName: "Account Automation",
          isManaged: false,
          isCustomizable: true,
          versionNumber: 5,
          assemblyId: "assembly-1",
          solutionDisplayName: "Core solution",
          steps: [],
          workflowArguments: [],
          dependencies: [],
        },
      ],
    },
  ],
};

describe("plugin registration catalog tree", () => {
  it("builds the catalog's direct assembly, handler, step, and image hierarchy", () => {
    expect(buildCatalogTree(catalog)).toMatchObject([
      {
        id: "assembly:assembly-1",
        kind: "assembly",
        label: "Contoso.Plugins",
        children: [
          {
            id: "plugin:plugin-1",
            kind: "plugin",
            label: "(Plugin) Account Plugin",
            children: [
              {
                id: "step:step-1",
                kind: "step",
                label: "(Step) Account Update",
                children: [
                  {
                    id: "image:image-1",
                    kind: "image",
                    label: "(Image) Account Target",
                    children: [],
                  },
                ],
              },
            ],
          },
          {
            id: "workflowActivity:workflow-1",
            kind: "workflowActivity",
            label: "(Workflow Activity) Validate Account",
            children: [],
          },
        ],
      },
    ]);
  });

  it("finds stable node IDs at every level", () => {
    const tree = buildCatalogTree(catalog);

    expect(findCatalogNode(tree, "assembly:assembly-1")?.label).toBe("Contoso.Plugins");
    expect(findCatalogNode(tree, "plugin:plugin-1")?.label).toBe("(Plugin) Account Plugin");
    expect(findCatalogNode(tree, "step:step-1")?.label).toBe("(Step) Account Update");
    expect(findCatalogNode(tree, "image:image-1")?.label).toBe("(Image) Account Target");
    expect(findCatalogNode(tree, "missing")).toBeUndefined();
  });

  it.each([
    ["contoso.plugins", "assembly:assembly-1"],
    ["accountplugin", "plugin:plugin-1"],
    ["account automation", "workflowActivity:workflow-1"],
    ["update", "step:step-1"],
    ["account", "step:step-1"],
    ["post-operation", "step:step-1"],
    ["target", "image:image-1"],
    ["accountnumber", "image:image-1"],
  ])("retains a matching node when searching %s", (term, expectedId) => {
    const filtered = filterCatalogTree(buildCatalogTree(catalog), term);

    expect(findCatalogNode(filtered, expectedId)).toBeDefined();
  });

  it("keeps ancestors when a descendant matches without mutating the original DTO", () => {
    const original = structuredClone(catalog);
    const tree = buildCatalogTree(catalog);
    const filtered = filterCatalogTree(tree, "accountnumber");

    expect(filtered).toMatchObject([
      {
        id: "assembly:assembly-1",
        children: [
          {
            id: "plugin:plugin-1",
            children: [
              {
                id: "step:step-1",
                children: [{ id: "image:image-1", children: [] }],
              },
            ],
          },
        ],
      },
    ]);
    expect(catalog).toEqual(original);
    expect(tree[0]?.children).toHaveLength(2);
  });
});
