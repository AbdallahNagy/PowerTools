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
