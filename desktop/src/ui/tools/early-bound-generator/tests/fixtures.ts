import type { FolderInfo, GeneratedFile, GenerationJob } from "../model/types";

export const tableNamesFixture = {
  tables: ["account", "contact", "new_project", "new_projecttask", "new_project_contact", "systemuser"],
};

export const emptyFolder = (path: string): FolderInfo => ({
  path,
  exists: true,
  hasOtherFiles: false,
  settings: null,
  settingsError: null,
});

export const generatedFiles: GeneratedFile[] = [
  { path: "Entities/account.cs", kind: "Table", name: "account", bytes: 2048 },
  { path: "Entities/contact.cs", kind: "Table", name: "contact", bytes: 2048 },
  { path: "OptionSets/account_industrycode.cs", kind: "Choice", name: "account_industrycode", bytes: 512 },
  { path: "DataverseContext.cs", kind: "Service context", name: "DataverseContext", bytes: 1024 },
  { path: "builderSettings.json", kind: "Settings", name: "", bytes: 480 },
];

export function succeededJob(outputDirectory: string, files: GeneratedFile[] = generatedFiles): GenerationJob {
  return {
    state: "succeeded",
    stage: null,
    log: ["Read 2 Entities"],
    files,
    error: null,
    errorKind: null,
    outputDirectory,
    durationMs: 72_000,
  };
}

export function runningJob(outputDirectory: string): GenerationJob {
  return {
    state: "running",
    stage: "readingMetadata",
    log: [],
    files: [],
    error: null,
    errorKind: null,
    outputDirectory,
    durationMs: null,
  };
}
