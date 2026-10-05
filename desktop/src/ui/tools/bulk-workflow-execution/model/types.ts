export type WorkflowMode = "background" | "realtime";

export interface WorkflowRow {
  id: string;
  name: string;
  primaryEntity: string;
  mode: WorkflowMode;
  runAs: "owner" | "callingUser";
  scope: string;
  isManaged: boolean;
  asyncAutoDelete: boolean;
}

export interface WorkflowsResponse {
  workflows: WorkflowRow[];
}

export type ViewKind = "system" | "personal";

export interface ViewRow {
  id: string;
  name: string;
  kind: ViewKind;
  fetchXml: string;
}

export interface ViewsResponse {
  views: ViewRow[];
}

export interface EntitySummary {
  logicalName: string;
  displayName: string;
}

export interface CountRequest {
  workflowId: string;
  fetchXml: string;
}

export interface CountResponse {
  count: number;
  entity: string;
}

export interface StartRunRequest {
  workflowId: string;
  fetchXml: string;
  batchSize: number;
  delaySeconds: number;
}

export interface StartRunResponse {
  jobId: string;
}

export type RunStatus =
  | "collecting"
  | "running"
  | "cancelling"
  | "cancelled"
  | "completed"
  | "failed";

export interface RunError {
  recordId: string;
  message: string;
}

export interface RunState {
  status: RunStatus;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  errors: RunError[];
  errorsCapped: boolean;
  startedAt: string;
  estimatedSecondsRemaining: number | null;
  message: string | null;
}

export type SortDirection = "asc" | "desc";

export interface SortState<Key extends string> {
  key: Key;
  direction: SortDirection;
}
