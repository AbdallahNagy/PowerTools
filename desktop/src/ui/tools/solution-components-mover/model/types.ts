export interface SolutionRow {
  id: string;
  friendlyName: string;
  uniqueName: string;
  publisherName: string | null;
  installedOn: string | null;
  version: string;
  isManaged: boolean;
}

export interface SolutionsResponse {
  solutions: SolutionRow[];
}

export interface ComponentTypeRow {
  componentType: number;
  label: string;
}

export interface ComponentTypesResponse {
  componentTypes: ComponentTypeRow[];
}

export interface StartCopyRequest {
  sourceSolutionIds: string[];
  targetSolutionIds: string[];
  componentTypes: number[];
  allComponents: boolean;
  checkBestPractice: boolean;
}

export interface StartCopyResponse {
  jobId: string;
}

export interface CopyEntry {
  componentId: string;
  componentType: number;
  label: string;
  solutionUniqueName: string;
  succeeded: boolean;
  message: string;
}

export interface CopyJob {
  status: string;
  processed: number;
  total: number;
  succeeded: number;
  failed: number;
  entries: CopyEntry[];
}

export type SortColumn =
  | "friendlyName"
  | "uniqueName"
  | "publisherName"
  | "installedOn"
  | "version"
  | "isManaged";

export type SortDirection = "asc" | "desc";

export interface SortState {
  column: SortColumn;
  direction: SortDirection;
}
