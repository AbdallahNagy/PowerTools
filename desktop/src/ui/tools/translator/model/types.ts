export type LabelKind =
  | "table"
  | "column"
  | "choice"
  | "globalChoice"
  | "boolean"
  | "relationship"
  | "view"
  | "chart";

export type LabelProperty =
  | "DisplayName"
  | "DisplayCollectionName"
  | "Description"
  | "Label"
  | "name"
  | "description";

/** Identifies one label of one component. Only the fields the kind needs are set. */
export interface LabelKey {
  kind: LabelKind;
  table?: string | null;
  column?: string | null;
  optionSet?: string | null;
  value?: number | null;
  recordId?: string | null;
  relationship?: string | null;
  side?: number | null;
  property: LabelProperty;
}

export interface LabelRow {
  key: LabelKey;
  /** Component name in the base language. */
  component: string;
  /** Logical or schema name shown under the component name. */
  componentName: string | null;
  /** 1:N / N:N for relationships, the view type for views. */
  detail: string | null;
  /** Global Yes/No sets: option rows are True and False labels. */
  booleanSet: boolean;
  readOnlyReason: string | null;
  /** Label per LCID. Missing languages have no label. */
  labels: Record<string, string>;
}

export interface Language {
  lcid: number;
  name: string;
}

export interface LanguagesResponse {
  baseLcid: number;
  languages: Language[];
}

/** One table in the scope list, from GET /api/translator/tables. */
export interface TableInfo {
  logicalName: string;
  displayName: string;
}

export interface TablesResponse {
  tables: TableInfo[];
}

export interface SolutionInfo {
  solutionId: string;
  uniqueName: string;
  friendlyName: string;
  version: string | null;
  isManaged: boolean;
  publisherName: string | null;
}

export interface SolutionsResponse {
  solutions: SolutionInfo[];
}

export interface PublisherInfo {
  publisherId: string;
  uniqueName: string;
  friendlyName: string;
  prefix: string | null;
}

export interface PublishersResponse {
  publishers: PublisherInfo[];
}

export interface LabelQueryRequest {
  tables: string[];
  kinds: LabelKind[];
  lcids: number[];
  properties: "names" | "descriptions" | "both";
  /** Limit rows to one solution's components. Left out for all tables. */
  solutionId?: string;
}

export interface LabelQueryResponse {
  rows: LabelRow[];
}

export interface ApplyRow {
  key: LabelKey;
  labels: Record<number, string>;
}

export interface NewSolution {
  friendlyName: string;
  uniqueName: string;
  publisherId: string;
  version: string;
}

/** Exactly one of uniqueName (existing solution) or new. */
export type ApplySolution = { uniqueName: string } | { new: NewSolution };

export interface ApplyRequest {
  rows: ApplyRow[];
  solution?: ApplySolution;
}

export interface ApplyStarted {
  jobId: string;
}

export type ApplyOutcome = "succeeded" | "failed" | "skipped";

export interface ApplyResult {
  key: LabelKey;
  lcids: number[];
  outcome: ApplyOutcome;
  message: string | null;
}

export interface PublishTargets {
  tables: string[];
  optionSets: string[];
}

export interface PublishResult {
  status: "pending" | "running" | "succeeded" | "failed" | "notNeeded";
  targets: PublishTargets;
  message: string | null;
}

export type SolutionStatus =
  | "notRequested"
  | "pending"
  | "running"
  | "succeeded"
  | "partial"
  | "failed"
  | "notNeeded";

export interface SolutionFailure {
  componentType: number;
  component: string;
  message: string;
}

export interface SolutionResult {
  status: SolutionStatus;
  uniqueName: string | null;
  friendlyName: string | null;
  created: boolean;
  added: number;
  failed: number;
  message: string | null;
  failures: SolutionFailure[];
}

export interface ApplyJob {
  status: "queued" | "running" | "completed" | "failed";
  phase: "updating" | "publishing" | "solution" | "done";
  processed: number;
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: ApplyResult[];
  publish: PublishResult;
  /** Missing from jobs started before the solution option existed. */
  solution?: SolutionResult;
  log: { level: string; message: string }[];
}

export interface PublishResponse {
  status: string;
  count: number;
  message: string | null;
}
