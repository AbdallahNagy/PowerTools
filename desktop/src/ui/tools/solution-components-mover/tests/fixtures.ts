import type { ComponentTypesResponse, CopyJob, SolutionsResponse } from "../model/types";

export const alphaId = "10000000-0000-0000-0000-000000000001";
export const betaId = "10000000-0000-0000-0000-000000000002";
export const managedId = "10000000-0000-0000-0000-000000000003";

export const solutionsFixture: SolutionsResponse = {
  solutions: [
    {
      id: alphaId,
      friendlyName: "Alpha Widgets",
      uniqueName: "AlphaWidgets",
      publisherName: "Contoso",
      installedOn: "2024-03-01",
      version: "1.0.0.0",
      isManaged: false,
    },
    {
      id: betaId,
      friendlyName: "Beta Flows",
      uniqueName: "BetaFlows",
      publisherName: "Fabrikam",
      installedOn: "2024-06-01",
      version: "1.1.0.0",
      isManaged: false,
    },
    {
      id: managedId,
      friendlyName: "Managed Core",
      uniqueName: "ManagedCore",
      publisherName: null,
      installedOn: "2023-01-15",
      version: "2.0.0.0",
      isManaged: true,
    },
  ],
};

export const componentTypesFixture: ComponentTypesResponse = {
  componentTypes: [
    { componentType: 1, label: "Account" },
    { componentType: 29, label: "Workflow" },
  ],
};

export const refusedJob: CopyJob = {
  status: "refused",
  processed: 0,
  total: 0,
  succeeded: 0,
  failed: 1,
  entries: [
    {
      componentId: "",
      componentType: 1,
      label: "Account",
      solutionUniqueName: "",
      succeeded: false,
      message: "The copy was refused because an unmanaged source includes all assets of a managed table: Account.",
    },
  ],
};

export const mixedJob: CopyJob = {
  status: "completed",
  processed: 2,
  total: 2,
  succeeded: 1,
  failed: 1,
  entries: [
    {
      componentId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
      componentType: 29,
      label: "Workflow",
      solutionUniqueName: "BetaFlows",
      succeeded: true,
      message: "",
    },
    {
      componentId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2",
      componentType: 1,
      label: "Account",
      solutionUniqueName: "BetaFlows",
      succeeded: false,
      message: "The component is already in the solution.",
    },
  ],
};
