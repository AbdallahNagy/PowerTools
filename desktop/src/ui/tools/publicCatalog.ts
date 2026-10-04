export interface PublicTool {
  id: string;
  title: string;
  description: string;
}

/**
 * Activity-bar tools shown on the welcome page and the website.
 * Keep the same order as ACTIVITY_BAR_TOOLS in registry.tsx.
 * Welcome is not listed here.
 */
export const PUBLIC_TOOLS: readonly PublicTool[] = [
  {
    id: "data-migration",
    title: "Data Migration",
    description:
      "Move data between Dataverse environments with a guided, developer-friendly workflow that is easier to understand and control.",
  },
  {
    id: "fetchxml-builder",
    title: "FetchXML Builder",
    description:
      "Build, test, and refine FetchXML queries in a cleaner workspace built for fast iteration.",
  },
  {
    id: "fetchxml-tester",
    title: "FetchXML Tester",
    description:
      "Paste a FetchXML query, run it as written, and keep a local library of the queries you use.",
  },
  {
    id: "plugin-registration",
    title: "Plugin Registration",
    description:
      "Browse and manage plug-in assemblies, types, steps, and images.",
  },
  {
    id: "polymorphic-lookup-creator",
    title: "Polymorphic Lookup Creator",
    description:
      "Create, update, and delete polymorphic lookups in the selected environment.",
  },
  {
    id: "solution-components-mover",
    title: "Solution Components Mover",
    description:
      "Copy solution components from selected solutions into unmanaged solutions in the same environment.",
  },
  {
    id: "workflow-activities-viewer",
    title: "Workflow Activities Viewer",
    description:
      "See which activated processes reference a custom workflow activity.",
  },
];
