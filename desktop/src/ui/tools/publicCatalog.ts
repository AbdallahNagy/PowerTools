export interface PublicTool {
  id: string;
  title: string;
  description: string;
  /**
   * A short line, at most 48 characters, for the tool tiles on the welcome page
   * and the website home page. Keeping it short keeps every tile the same size;
   * the full description stays on the tool's page.
   */
  summary: string;
  /**
   * Set on a new tool until it ships in a release. The website and the README
   * leave it out, because the installer people download does not have it yet.
   * Prepare Release removes the flag (scripts/release-tools.mjs).
   */
  unreleased?: true;
}

/**
 * Activity-bar tools shown on the welcome page and the website.
 * Keep the same order as ACTIVITY_BAR_TOOLS in registry.tsx.
 * Welcome is not listed here.
 */
export const PUBLIC_TOOLS: readonly PublicTool[] = [
  {
    id: "attribute-explorer",
    title: "Attribute Explorer",
    description:
      "Browse every table in an environment and inspect its fields, types, and lookups.",
    summary: "Browse every table and its fields.",
  },
  {
    id: "bulk-workflow-execution",
    title: "Bulk Workflow Execution",
    description:
      "Run an on-demand workflow against every record a view or FetchXML query returns, in batches you can pace and stop.",
    summary: "Run a workflow on many records at once.",
  },
  {
    id: "data-migration",
    title: "Data Migration",
    description:
      "Move data between Dataverse environments with a guided, developer-friendly workflow that is easier to understand and control.",
    summary: "Move data between environments, step by step.",
  },
  {
    id: "environment-variables-manager",
    title: "Environment Variables Manager",
    description:
      "Find every environment variable in an environment, edit current values in place and save them together, and create, update, or delete definitions.",
    summary: "See and edit environment variables in one place.",
  },
  {
    id: "fetchxml-builder",
    title: "FetchXML Builder",
    description:
      "Build, test, and refine FetchXML queries in a cleaner workspace built for fast iteration.",
    summary: "Build and refine FetchXML queries.",
  },
  {
    id: "fetchxml-tester",
    title: "FetchXML Tester",
    description:
      "Paste a FetchXML query, run it as written, and keep a local library of the queries you use.",
    summary: "Run FetchXML as written and keep a library.",
  },
  {
    id: "plugin-registration",
    title: "Plugin Registration",
    description:
      "Browse and manage plug-in assemblies, types, steps, and images.",
    summary: "Manage plug-in assemblies, types and steps.",
  },
  {
    id: "polymorphic-lookup-creator",
    title: "Polymorphic Lookup Creator",
    description:
      "Create, update, and delete polymorphic lookups in the selected environment.",
    summary: "Create and edit polymorphic lookups.",
  },
  {
    id: "solution-components-mover",
    title: "Solution Components Mover",
    description:
      "Copy solution components from selected solutions into unmanaged solutions in the same environment.",
    summary: "Copy components between solutions.",
  },
  {
    id: "solution-layers-explorer",
    title: "Solution Layers Explorer",
    description:
      "See every solution layer of a Dataverse component, compare any two layers side by side, and remove the unmanaged Active layer.",
    summary: "Compare layers and remove the Active one.",
  },
  {
    id: "translator",
    title: "Translator",
    description:
      "Edit the display names and descriptions of tables, columns, choices, views, and charts side by side in every language installed in an environment.",
    summary: "Translate labels into every installed language.",
  },
  {
    id: "workflow-activities-viewer",
    title: "Workflow Activities Viewer",
    description:
      "See which activated processes reference a custom workflow activity.",
    summary: "Find processes that use a custom activity.",
  },
];

/** Tools in the latest release: what the website and the README list. */
export const RELEASED_TOOLS: readonly PublicTool[] = PUBLIC_TOOLS.filter(
  (tool) => !tool.unreleased,
);
