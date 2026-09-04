export interface PluginRegistrationCatalog {
  assemblies: PluginAssembly[];
}

export interface PluginAssembly {
  id: string;
  name: string;
  version: string;
  culture: string | null;
  publicKeyToken: string | null;
  sourceType: number;
  isolationMode: number;
  isManaged: boolean;
  isCustomizable: boolean;
  versionNumber: number;
  handlers: PluginHandler[];
  description: string | null;
  solutionDisplayName: string | null;
}

interface PluginHandlerBase {
  id: string;
  typeName: string;
  name: string;
  friendlyName: string | null;
  description: string | null;
  workflowActivityGroupName: string | null;
  isManaged: boolean;
  isCustomizable: boolean;
  versionNumber: number;
  steps: PluginStep[];
  workflowArguments: WorkflowArgument[];
  dependencies: ComponentDependency[];
  assemblyId: string | null;
  solutionDisplayName: string | null;
}

export type PluginHandler =
  | (PluginHandlerBase & { kind: "plugin" })
  | (PluginHandlerBase & { kind: "workflowActivity" });

export interface PluginStep {
  id: string;
  pluginHandlerId: string;
  name: string;
  description: string | null;
  messageLabel: string;
  primaryTableLabel: string | null;
  secondaryTableLabel: string | null;
  stageLabel: string;
  modeLabel: string;
  stage: number;
  mode: number;
  rank: number;
  isEnabled: boolean;
  isManaged: boolean;
  isCustomizable: boolean;
  versionNumber: number;
  secureConfigExists: boolean;
  images: PluginImage[];
  solutionDisplayName: string | null;
}

export interface PluginImage {
  id: string;
  pluginStepId: string;
  name: string;
  description: string | null;
  imageTypeLabel: string;
  entityAlias: string | null;
  attributes: string[];
  isManaged: boolean;
  isCustomizable: boolean;
  versionNumber: number;
  solutionDisplayName: string | null;
}

export interface WorkflowArgument {
  name: string;
  displayName: string;
  typeName: string;
  direction: "input" | "output";
  isRequired: boolean;
  position: number;
}

export interface ComponentDependency {
  componentId: string;
  name: string;
  componentTypeLabel: string;
  solutionDisplayName: string | null;
  isManaged: boolean;
  isCustomizable: boolean;
  versionNumber: number;
  stateLabel?: string | null;
}

/** The JSON shape emitted by the ASP.NET sidecar's CatalogDtos.cs records. */
export interface PluginRegistrationCatalogDto {
  assemblies: PluginAssemblyDto[];
}

export interface PluginAssemblyDto extends Omit<PluginAssembly, "handlers"> {
  handlers: PluginHandlerDto[];
}

export interface PluginHandlerDto extends Omit<PluginHandlerBase, "kind" | "workflowArguments"> {
  kind: 0 | 1;
  workflowArguments: WorkflowArgumentDto[];
}

export interface WorkflowArgumentDto extends Omit<WorkflowArgument, "direction"> {
  direction: 0 | 1;
}

export function normalizePluginRegistrationCatalog(
  catalog: PluginRegistrationCatalogDto,
): PluginRegistrationCatalog {
  return {
    assemblies: catalog.assemblies.map(({ handlers, ...assembly }) => ({
      ...assembly,
      handlers: handlers.map(normalizePluginHandler),
    })),
  };
}

export function normalizePluginHandler(handler: PluginHandlerDto): PluginHandler {
  const { kind, workflowArguments, ...rest } = handler;
  const normalizedArguments = workflowArguments.map(normalizeWorkflowArgument);

  if (kind === 0) {
    return { ...rest, kind: "plugin", workflowArguments: normalizedArguments };
  }
  if (kind === 1) {
    return { ...rest, kind: "workflowActivity", workflowArguments: normalizedArguments };
  }

  throw new Error(`Unknown plug-in handler kind: ${kind}`);
}

function normalizeWorkflowArgument(argument: WorkflowArgumentDto): WorkflowArgument {
  if (argument.direction === 0) return { ...argument, direction: "input" };
  if (argument.direction === 1) return { ...argument, direction: "output" };

  throw new Error(`Unknown workflow argument direction: ${argument.direction}`);
}
