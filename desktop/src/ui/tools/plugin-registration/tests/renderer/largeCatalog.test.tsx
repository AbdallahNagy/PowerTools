import { describe, expect, it } from "vitest";

import { buildCatalogTree, filterCatalogTree } from "../../model/catalogTree";
import type {
  PluginAssembly,
  PluginHandler,
  PluginImage,
  PluginRegistrationCatalog,
  PluginStep,
} from "../../model/contracts";

const WINDOWS_CI_THRESHOLD_MS = 10_000;

describe("large complete registration catalogs", () => {
  it("constructs and searches 31,100 nested records without node-lazy retrieval", () => {
    const catalog = createLargeCatalog();
    const started = performance.now();

    const tree = buildCatalogTree(catalog);
    const imageMatch = filterCatalogTree(tree, "Needle Image 19999");
    const tableMatch = filterCatalogTree(tree, "account");
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(WINDOWS_CI_THRESHOLD_MS);
    expect(tree).toHaveLength(100);
    expect(countNodes(tree)).toBe(31_100);
    expect(imageMatch).toHaveLength(1);
    expect(imageMatch[0]?.children[0]?.children[0]?.children[0]?.label).toBe(
      "(Image) Needle Image 19999",
    );
    expect(countNodes(tableMatch)).toBe(31_100);
    expect(catalog.assemblies[99]?.handlers[9]?.steps[9]?.images).toHaveLength(2);
  });
});

function createLargeCatalog(): PluginRegistrationCatalog {
  let handlerNumber = 0;
  let stepNumber = 0;
  let imageNumber = 0;
  const assemblies: PluginAssembly[] = [];

  for (let assemblyNumber = 0; assemblyNumber < 100; assemblyNumber += 1) {
    const handlers: PluginHandler[] = [];
    for (let handlerIndex = 0; handlerIndex < 10; handlerIndex += 1, handlerNumber += 1) {
      const steps: PluginStep[] = [];
      for (let stepIndex = 0; stepIndex < 10; stepIndex += 1, stepNumber += 1) {
        const images: PluginImage[] = [];
        for (let imageIndex = 0; imageIndex < 2; imageIndex += 1, imageNumber += 1) {
          images.push({
            id: `image-${imageNumber}`,
            pluginStepId: `step-${stepNumber}`,
            name: imageNumber === 19_999 ? "Needle Image 19999" : `Image ${imageNumber}`,
            description: null,
            imageTypeLabel: "Post Image",
            entityAlias: "Target",
            attributes: ["name", "accountnumber"],
            isManaged: false,
            isCustomizable: true,
            versionNumber: imageNumber + 1,
            solutionDisplayName: "Large catalog fixture",
          });
        }
        steps.push({
          id: `step-${stepNumber}`,
          pluginHandlerId: `plugin-${handlerNumber}`,
          name: `Step ${stepNumber}`,
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
          versionNumber: stepNumber + 1,
          secureConfigExists: false,
          images,
          solutionDisplayName: "Large catalog fixture",
        });
      }
      handlers.push({
        id: `plugin-${handlerNumber}`,
        kind: "plugin",
        typeName: `LargeCatalog.Plugin${handlerNumber}`,
        name: `Plugin ${handlerNumber}`,
        friendlyName: null,
        description: null,
        workflowActivityGroupName: null,
        isManaged: false,
        isCustomizable: true,
        versionNumber: handlerNumber + 1,
        steps,
        workflowArguments: [],
        dependencies: [],
        assemblyId: `assembly-${assemblyNumber}`,
        solutionDisplayName: "Large catalog fixture",
      });
    }
    assemblies.push({
      id: `assembly-${assemblyNumber}`,
      name: `Assembly ${assemblyNumber}`,
      version: "1.0.0.0",
      culture: "neutral",
      publicKeyToken: "31bf3856ad364e35",
      sourceType: 0,
      isolationMode: 2,
      isManaged: false,
      isCustomizable: true,
      versionNumber: assemblyNumber + 1,
      handlers,
      description: null,
      solutionDisplayName: "Large catalog fixture",
    });
  }

  return { assemblies };
}

function countNodes(nodes: ReturnType<typeof buildCatalogTree>): number {
  return nodes.reduce((count, node) => count + 1 + countNodes(node.children), 0);
}
