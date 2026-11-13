// Mirrors the ids of BUILT_IN_TOOLS in src/ui/tools/registry.tsx so a community
// tool cannot take one. The Electron build cannot import renderer modules; a test
// keeps the two lists equal.
export const BUILT_IN_TOOL_IDS: readonly string[] = [
  "welcome",
  "attribute-explorer",
  "bulk-workflow-execution",
  "data-migration",
  "environment-variables-manager",
  "fetchxml-builder",
  "fetchxml-tester",
  "plugin-registration",
  "polymorphic-lookup-creator",
  "solution-components-mover",
  "solution-layers-explorer",
  "translator",
  "workflow-activities-viewer",
];
