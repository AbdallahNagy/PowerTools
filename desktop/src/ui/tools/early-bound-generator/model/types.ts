/** Options Microsoft's ModelBuilder supports, as the form holds them. */
export interface FormSettings {
  namespace: string;
  serviceContextName: string;
  entityTypesFolder: string;
  optionSetsTypesFolder: string;
  messagesTypesFolder: string;
  /** One logical name or pattern per line. Empty means every table. */
  tablesText: string;
  /** One message name or pattern per line. */
  messagesText: string;
  generateMessages: boolean;
  generateGlobalOptionSets: boolean;
  emitFieldsClasses: boolean;
  emitVirtualAttributes: boolean;
  emitEntityETC: boolean;
  suppressINotifyPattern: boolean;
  suppressGeneratedCodeAttribute: boolean;
}

export type BooleanSetting = {
  [Key in keyof FormSettings]: FormSettings[Key] extends boolean ? Key : never;
}[keyof FormSettings];

/** Body of POST /api/early-bound-generator/jobs. */
export interface GenerationRequest {
  outputDirectory: string;
  namespace: string;
  serviceContextName: string;
  entityTypesFolder: string;
  optionSetsTypesFolder: string;
  messagesTypesFolder: string;
  entityNamesFilter: string[];
  messageNamesFilter: string[];
  generateMessages: boolean;
  generateGlobalOptionSets: boolean;
  emitFieldsClasses: boolean;
  emitVirtualAttributes: boolean;
  emitEntityETC: boolean;
  suppressINotifyPattern: boolean;
  suppressGeneratedCodeAttribute: boolean;
}

export interface TableNamesResponse {
  tables: string[];
}

/** Values read from builderSettings.json. Missing or mistyped keys are null. */
export interface LoadedSettings {
  namespace: string | null;
  serviceContextName: string | null;
  entityTypesFolder: string | null;
  optionSetsTypesFolder: string | null;
  messagesTypesFolder: string | null;
  entityNamesFilter: string[] | null;
  messageNamesFilter: string[] | null;
  generateSdkMessages: boolean | null;
  generateGlobalOptionSets: boolean | null;
  emitFieldsClasses: boolean | null;
  emitVirtualAttributes: boolean | null;
  emitEntityETC: boolean | null;
  suppressINotifyPattern: boolean | null;
  suppressGeneratedCodeAttribute: boolean | null;
}

export interface FolderInfo {
  path: string;
  exists: boolean;
  hasOtherFiles: boolean;
  settings: LoadedSettings | null;
  settingsError: string | null;
}

export type FileKind = "Table" | "Choice" | "Message" | "Service context" | "Settings";

export interface GeneratedFile {
  /** Relative to the output folder. */
  path: string;
  kind: FileKind;
  /** Logical name, or "" for builderSettings.json. */
  name: string;
  bytes: number;
}

export type JobState = "queued" | "running" | "succeeded" | "failed";

export type FailureKind = "folderAccess" | "folder" | "privilege" | "connection" | "other";

export interface GenerationJob {
  state: JobState;
  stage: "readingMetadata" | "writingCode" | null;
  log: string[];
  files: GeneratedFile[];
  error: string | null;
  errorKind: FailureKind | null;
  outputDirectory: string;
  durationMs: number | null;
}

export interface JobStarted {
  jobId: string;
}
