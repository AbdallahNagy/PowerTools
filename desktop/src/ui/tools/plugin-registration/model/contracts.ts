export interface CapabilitiesDto {
  isOnline: boolean;
  isolationModes: number[];
  sourceTypes: number[];
}

export interface CatalogDto {
  assemblies: AssemblyDto[];
  types: PluginTypeDto[];
  steps: StepDto[];
  images: ImageDto[];
}

export interface AssemblyDto {
  id: string;
  name: string;
  version: string | null;
  publicKeyToken: string | null;
  culture: string | null;
  isolationMode: number;
  sourceType: number;
  isManaged: boolean;
  isSystem: boolean;
  modifiedOn: string | null;
  description: string | null;
}

export interface PluginTypeDto {
  id: string;
  assemblyId: string;
  typeName: string;
  name: string | null;
  friendlyName: string | null;
  isWorkflowActivity: boolean;
  workflowActivityGroupName: string | null;
  description: string | null;
  isManaged: boolean;
  isSystem: boolean;
}

export interface StepDto {
  id: string;
  name: string;
  pluginTypeId: string;
  messageId: string;
  messageName: string;
  filterId: string | null;
  primaryEntity: string | null;
  secondaryEntity: string | null;
  stage: number;
  mode: number;
  rank: number;
  isEnabled: boolean;
  filteringAttributes: string[];
  impersonatingUserId: string | null;
  impersonatingUserName: string | null;
  description: string | null;
  configuration: string | null;
  hasSecureConfiguration: boolean;
  supportedDeployment: number;
  asyncAutoDelete: boolean;
  isManaged: boolean;
  isSystem: boolean;
  modifiedOn: string | null;
}

export interface ImageDto {
  id: string;
  stepId: string;
  name: string;
  entityAlias: string;
  imageType: number;
  attributes: string[];
  messagePropertyName: string | null;
  isManaged: boolean;
  isSystem: boolean;
}

export interface RegistrationProblem {
  field: string;
  code: string;
  message: string;
}

export interface ProblemResponse {
  code: string;
  message: string;
  problems: RegistrationProblem[];
}

export interface MutationResultDto {
  id: string;
}

export interface StepOptionsDto {
  messages: MessageOptionDto[];
  filters: FilterOptionDto[];
  users: UserOptionDto[];
}

export interface MessageOptionDto {
  id: string;
  name: string;
}

export interface FilterOptionDto {
  id: string;
  messageId: string;
  primaryEntity: string | null;
  secondaryEntity: string | null;
  availability: number;
}

export interface UserOptionDto {
  id: string;
  fullName: string;
}

export interface StepDraftDto {
  name: string;
  pluginTypeId: string;
  messageId: string;
  filterId: string | null;
  stage: number;
  mode: number;
  rank: number;
  supportedDeployment: number;
  asyncAutoDelete: boolean;
  filteringAttributes: string[];
  impersonatingUserId: string | null;
  description: string | null;
  configuration: string | null;
  secureConfigurationAction: "keep" | "replace" | "clear";
  secureConfiguration: string | null;
}

export interface EntityAttributeDto {
  logicalName: string;
  displayName: string;
  attributeType: string;
  isPrimaryId: boolean;
}

export interface ImageDraftDto {
  stepId: string;
  name: string;
  entityAlias: string;
  imageType: number;
  attributes: string[];
}

export const STAGE_LABELS: Record<number, string> = {
  10: "Pre-validation",
  20: "Pre-operation",
  40: "Post-operation",
  50: "Post-operation (deprecated)",
};

export const MODE_LABELS: Record<number, string> = {
  0: "Synchronous",
  1: "Asynchronous",
};

export const IMAGE_TYPE_LABELS: Record<number, string> = {
  0: "Pre-image",
  1: "Post-image",
  2: "Pre- and post-image",
};

export const ISOLATION_LABELS: Record<number, string> = {
  1: "None",
  2: "Sandbox",
};

export const SOURCE_LABELS: Record<number, string> = {
  0: "Database",
  1: "Disk",
};

export interface AssemblyInspectionDto {
  fileName: string;
  size: number;
  sha256: string;
  identity: AssemblyIdentityInspectionDto;
  targetFramework: string | null;
  runtimeVersion: string;
  diagnostics: AssemblyInspectionDiagnosticDto[];
  plugins: PluginTypeInspectionDto[];
  workflowActivities: WorkflowActivityInspectionDto[];
}

export interface AssemblyIdentityInspectionDto {
  name: string;
  version: string;
  culture: string;
  publicKeyToken: string;
}

export interface PluginTypeInspectionDto {
  typeName: string;
}

export interface WorkflowActivityInspectionDto {
  typeName: string;
  arguments: WorkflowArgumentInspectionDto[];
}

export interface WorkflowArgumentInspectionDto {
  propertyName: string;
  name: string;
  typeName: string;
  direction: number | string;
  isRequired: boolean;
  referenceTarget: string | null;
}

export interface AssemblyInspectionDiagnosticDto {
  code: string;
  message: string;
  severity: number | string;
}

export function isInspectionError(
  diagnostic: AssemblyInspectionDiagnosticDto,
): boolean {
  return diagnostic.severity === 1 || diagnostic.severity === "Error";
}
