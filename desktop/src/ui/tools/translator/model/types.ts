import type { EntityInfo } from "../../../shared/contracts/dataverse";

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

export type TableInfo = EntityInfo;

export interface LabelQueryRequest {
  tables: string[];
  kinds: LabelKind[];
  lcids: number[];
  properties: "names" | "descriptions" | "both";
}

export interface LabelQueryResponse {
  rows: LabelRow[];
}

export interface ApplyRow {
  key: LabelKey;
  labels: Record<number, string>;
}

export interface ApplyRequest {
  rows: ApplyRow[];
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

export interface ApplyJob {
  status: "queued" | "running" | "completed" | "failed";
  phase: "updating" | "publishing" | "done";
  processed: number;
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: ApplyResult[];
  publish: PublishResult;
  log: { level: string; message: string }[];
}

export interface PublishResponse {
  status: string;
  count: number;
  message: string | null;
}
