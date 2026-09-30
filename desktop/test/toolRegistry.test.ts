import { describe, expect, it } from "vitest";

import {
  createToolRegistry,
  defineTool,
} from "../src/ui/tools/defineTool";
import {
  ACTIVITY_BAR_TOOLS,
  BUILT_IN_TOOLS,
  TOOL_REGISTRY,
} from "../src/ui/tools/registry";
import { fetchXmlBuilderTool } from "../src/ui/tools/fetchxml-builder/tool";
import { fetchXmlTesterTool } from "../src/ui/tools/fetchxml-tester/tool";
import { dataMigrationTool } from "../src/ui/tools/data-migration/tool";
import { pluginRegistrationTool } from "../src/ui/tools/plugin-registration/tool";
import { polymorphicLookupTool } from "../src/ui/tools/polymorphic-lookup-creator/tool";
import { workflowActivitiesTool } from "../src/ui/tools/workflow-activities-viewer/tool";

function TestTool() {
  return null;
}

function createTestTool(id: string, showInActivityBar: boolean) {
  return defineTool({
    id,
    title: id,
    icon: `${id}.svg`,
    showInActivityBar,
    component: TestTool,
  });
}

describe("tool registry", () => {
  it("derives activity-bar order from the canonical tool list", () => {
    const hidden = createTestTool("hidden", false);
    const first = createTestTool("first", true);
    const second = createTestTool("second", true);

    const registry = createToolRegistry([hidden, first, second]);

    expect(registry.activityBarTools.map((tool) => tool.id)).toEqual([
      "first",
      "second",
    ]);
    expect(registry.toolsById).toEqual({ hidden, first, second });
  });

  it("rejects duplicate built-in tool IDs", () => {
    const first = createTestTool("duplicate", true);
    const second = createTestTool("duplicate", false);

    expect(() => createToolRegistry([first, second])).toThrow(
      'Duplicate built-in tool id "duplicate"',
    );
  });

  it("registers an ID that matches an Object prototype property", () => {
    const constructorTool = createTestTool("constructor", true);

    const registry = createToolRegistry([constructorTool]);

    expect(registry.toolsById["constructor"]).toBe(constructorTool);
  });

  it("rejects a repeated Object prototype property ID", () => {
    const first = createTestTool("constructor", true);
    const second = createTestTool("constructor", false);

    expect(() => createToolRegistry([first, second])).toThrow(
      'Duplicate built-in tool id "constructor"',
    );
  });

  it("keeps Welcome singleton and projects the existing activity order", () => {
    expect(BUILT_IN_TOOLS.map((tool) => tool.id)).toEqual([
      "welcome",
      "data-migration",
      "fetchxml-builder",
      "fetchxml-tester",
      "plugin-registration",
      "polymorphic-lookup-creator",
      "workflow-activities-viewer",
    ]);
    expect(ACTIVITY_BAR_TOOLS.map((tool) => tool.id)).toEqual([
      "data-migration",
      "fetchxml-builder",
      "fetchxml-tester",
      "plugin-registration",
      "polymorphic-lookup-creator",
      "workflow-activities-viewer",
    ]);
    expect(TOOL_REGISTRY.welcome.allowMultipleInstances).toBe(false);
    expect(TOOL_REGISTRY["polymorphic-lookup-creator"].allowMultipleInstances).toBe(true);
    expect(TOOL_REGISTRY["workflow-activities-viewer"].allowMultipleInstances).toBe(true);
    expect(TOOL_REGISTRY["workflow-activities-viewer"].title).toBe("Workflow Activities Viewer");
    expect(TOOL_REGISTRY["workflow-activities-viewer"].tooltip).toBe(
      "See which activated processes reference a custom workflow activity",
    );
    expect(TOOL_REGISTRY["workflow-activities-viewer"].showInActivityBar).toBe(true);
    expect(TOOL_REGISTRY["data-migration"]).toBe(dataMigrationTool);
    expect(TOOL_REGISTRY["fetchxml-builder"]).toBe(fetchXmlBuilderTool);
    expect(TOOL_REGISTRY["fetchxml-tester"]).toBe(fetchXmlTesterTool);
    expect(TOOL_REGISTRY["plugin-registration"]).toBe(pluginRegistrationTool);
    expect(TOOL_REGISTRY["polymorphic-lookup-creator"]).toBe(polymorphicLookupTool);
    expect(TOOL_REGISTRY["workflow-activities-viewer"]).toBe(workflowActivitiesTool);
  });
});
