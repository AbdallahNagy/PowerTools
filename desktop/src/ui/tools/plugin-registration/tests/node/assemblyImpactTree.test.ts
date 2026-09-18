import { describe, expect, it } from "vitest";

import { buildAssemblyImpactTree } from "../../model/assemblyImpactTree";
import type { AssemblyMutationPreflight } from "../../api/useAssemblyMutations";

describe("assembly impact tree", () => {
  it("keeps only added and removed plug-ins and their owned steps", () => {
    const tree = buildAssemblyImpactTree(impact({
      addedPlugins: ["Contoso.AddedPlugin"],
      removedPlugins: ["Contoso.RemovedPlugin"],
      unchangedPlugins: ["Contoso.StablePlugin"],
      changedPlugins: ["Contoso.ChangedPlugin"],
      ownedStepsAndImages: [
        "Contoso.RemovedPlugin: step 'Update account', image 'PreImage'",
        "Contoso.RemovedPlugin: step 'Create account'",
      ],
    }));

    expect(tree.map((node) => node.label)).toEqual([
      "(Plugin) Contoso.AddedPlugin",
      "(Plugin) Contoso.RemovedPlugin",
    ]);
    expect(tree[0]?.change).toBe("added");
    expect(tree[1]?.children.map((child) => child.label)).toEqual([
      "(Step) Update account",
      "(Step) Create account",
    ]);
  });
});

function impact(overrides: Partial<AssemblyMutationPreflight["impact"]>): AssemblyMutationPreflight["impact"] {
  return {
    previousIdentity: null,
    currentIdentity: { name: "Contoso", version: "1", culture: "neutral", publicKeyToken: "token" },
    previousSha256: "old",
    currentSha256: "new",
    previousSize: 1,
    currentSize: 2,
    previousIsolationMode: 2,
    currentIsolationMode: 2,
    previousSourceType: 0,
    currentSourceType: 0,
    addedPlugins: [],
    unchangedPlugins: [],
    changedPlugins: [],
    removedPlugins: [],
    addedWorkflowActivities: [],
    changedWorkflowActivities: [],
    removedWorkflowActivities: [],
    ownedStepsAndImages: [],
    dependencies: [],
    workflowContractDifferences: [],
    warnings: [],
    blockers: [],
    ...overrides,
  };
}
