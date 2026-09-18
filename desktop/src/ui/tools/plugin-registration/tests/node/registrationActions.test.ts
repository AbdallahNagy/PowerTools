import { describe, expect, it } from "vitest";

import { buildCatalogTree } from "../../model/catalogTree";
import {
  dialogOwnerForIntent,
  doubleClickIntentForNode,
  registrationActionsForNode,
} from "../../model/registrationActions";
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
      description: null,
      solutionDisplayName: null,
      handlers: [
        {
          id: "plugin-1",
          kind: "plugin",
          typeName: "Contoso.Plugins.AccountPlugin",
          name: "Account Plugin",
          friendlyName: null,
          description: null,
          workflowActivityGroupName: null,
          isManaged: false,
          isCustomizable: true,
          versionNumber: 2,
          assemblyId: "assembly-1",
          solutionDisplayName: null,
          workflowArguments: [],
          dependencies: [],
          steps: [
            {
              id: "step-1",
              pluginHandlerId: "plugin-1",
              name: "Account Update",
              description: null,
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
              solutionDisplayName: null,
              images: [
                {
                  id: "image-1",
                  pluginStepId: "step-1",
                  name: "Account Target",
                  description: null,
                  imageTypeLabel: "Post Image",
                  entityAlias: "Target",
                  attributes: ["name"],
                  isManaged: false,
                  isCustomizable: true,
                  versionNumber: 4,
                  solutionDisplayName: null,
                },
              ],
            },
          ],
        },
        {
          id: "workflow-1",
          kind: "workflowActivity",
          typeName: "Contoso.Plugins.ValidateAccount",
          name: "Validate Account",
          friendlyName: null,
          description: null,
          workflowActivityGroupName: "Account Automation",
          isManaged: false,
          isCustomizable: true,
          versionNumber: 5,
          assemblyId: "assembly-1",
          solutionDisplayName: null,
          steps: [],
          workflowArguments: [],
          dependencies: [],
        },
      ],
    },
  ],
};

describe("registration action policy", () => {
  const [assembly, plugin, workflow, step, image] = (() => {
    const tree = buildCatalogTree(catalog);
    const assemblyNode = tree[0]!;
    const pluginNode = assemblyNode.children[0]!;
    const workflowNode = assemblyNode.children[1]!;
    const stepNode = pluginNode.children[0]!;
    const imageNode = stepNode.children[0]!;
    return [assemblyNode, pluginNode, workflowNode, stepNode, imageNode] as const;
  })();

  it("exposes only supported actions for every registration kind", () => {
    expect(registrationActionsForNode(assembly).map((action) => action.label)).toEqual([
      "Update assembly",
      "Unregister assembly",
    ]);
    expect(registrationActionsForNode(plugin).map((action) => action.label)).toEqual([
      "Register New Step",
      "Unregister plug-in",
    ]);
    expect(registrationActionsForNode(workflow).map((action) => action.label)).toEqual([
      "Update workflow activity",
      "Unregister workflow activity",
    ]);
    expect(registrationActionsForNode(step).map((action) => action.label)).toEqual([
      "Update step",
      "Register image",
      "Disable step",
      "Unregister step",
    ]);
    expect(registrationActionsForNode(image).map((action) => action.label)).toEqual([
      "Update image",
      "Unregister image",
    ]);
  });

  it("opens an update experience only for independently editable items", () => {
    expect(doubleClickIntentForNode(assembly)).toEqual({ kind: "update", nodeId: assembly.id });
    expect(doubleClickIntentForNode(workflow)).toEqual({ kind: "update", nodeId: workflow.id });
    expect(doubleClickIntentForNode(step)).toEqual({ kind: "update", nodeId: step.id });
    expect(doubleClickIntentForNode(image)).toEqual({ kind: "update", nodeId: image.id });
    expect(doubleClickIntentForNode(plugin)).toBeNull();
  });

  it("keeps Register New Step as an explicit ordinary plug-in action that never owns an update dialog", () => {
    const createStep = registrationActionsForNode(plugin)[0]!;
    expect(createStep.intent).toEqual({ kind: "createStep", pluginId: "plugin-1" });
    expect(dialogOwnerForIntent(createStep.intent)).toBe("step:create:plugin-1");
    expect(dialogOwnerForIntent({ kind: "update", nodeId: plugin.id })).toBeNull();
  });

  it("assigns exactly one dialog owner per supported operation", () => {
    const owners = [
      dialogOwnerForIntent({ kind: "update", nodeId: assembly.id }),
      dialogOwnerForIntent({ kind: "createStep", pluginId: "plugin-1" }),
      dialogOwnerForIntent({ kind: "update", nodeId: step.id }),
      dialogOwnerForIntent({ kind: "createImage", stepId: "step-1" }),
      dialogOwnerForIntent({ kind: "toggleStep", stepId: "step-1", enable: false }),
      dialogOwnerForIntent({ kind: "unregister", nodeId: step.id }),
      dialogOwnerForIntent({ kind: "update", nodeId: image.id }),
      dialogOwnerForIntent({ kind: "unregister", nodeId: image.id }),
      dialogOwnerForIntent({ kind: "update", nodeId: workflow.id }),
      dialogOwnerForIntent({ kind: "unregister", nodeId: assembly.id }),
    ];
    expect(owners.every(Boolean)).toBe(true);
    expect(new Set(owners).size).toBe(owners.length);
  });

  it("disables cascade unregister with the proven-safety reason while leaving other actions enabled", () => {
    const context = {
      cascadeUnregister: {
        supported: false,
        reason: "Transactional cascade unregister is not release-approved yet. Transactional safety has not yet been proven.",
      },
    };
    const unregister = registrationActionsForNode(assembly, context).find((action) => action.label === "Unregister assembly");
    expect(unregister?.enabled).toBe(false);
    expect(unregister?.disabledReason).toContain("not yet been proven");
    expect(registrationActionsForNode(assembly, context).find((action) => action.label === "Update assembly")?.enabled).toBe(true);
    expect(registrationActionsForNode(step, context).find((action) => action.label === "Unregister step")?.enabled).toBe(true);
  });
});
