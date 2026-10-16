export type Source = "bin" | "audit";
export type SourceState = "enabled" | "disabled" | "unavailable";

export interface SourceStatus {
  state: SourceState;
  reason: string | null;
  retentionDays: number | null;
}

export interface StatusResponse {
  bin: SourceStatus;
  audit: SourceStatus;
}

export interface RecycleTable {
  logicalName: string;
  displayName: string;
  primaryIdAttribute: string;
  primaryNameAttribute: string | null;
  binEnabled: boolean;
  auditEnabled: boolean;
  isActivity: boolean;
  retentionDays: number | null;
}

export interface TablesResponse {
  tables: RecycleTable[];
}

export interface RecycleUser {
  id: string;
  fullName: string;
  isDisabled: boolean;
}

export interface UsersResponse {
  users: RecycleUser[];
  truncated: boolean;
}

export interface DeletedRecord {
  /** Row key: the audit entry id for the audit log, the record id for the recycle bin. */
  key: string;
  recordId: string;
  table: string;
  name: string | null;
  deletedOn: string | null;
  deletedById: string | null;
  deletedBy: string | null;
  callingUserId: string | null;
  callingUser: string | null;
  auditId: string | null;
  hasValues: boolean;
}

export interface DeletedBody {
  source: Source;
  table: string;
  fromUtc: string | null;
  toUtc: string | null;
  deletedByUserId: string | null;
  pageSize: number;
  pagingCookie: string | null;
  page: number;
}

export interface DeletedResponse {
  records: DeletedRecord[];
  pagingCookie: string | null;
  moreRecords: boolean;
  page: number;
}

export type FieldKind =
  | "lookup"
  | "choice"
  | "multichoice"
  | "boolean"
  | "datetime"
  | "money"
  | "number"
  | "guid"
  | "string"
  | "other";

export interface FieldValue {
  logicalName: string;
  kind: FieldKind;
  value: string | null;
  formatted: string | null;
  lookupTable: string | null;
}

export interface RecordResponse {
  fields: FieldValue[];
}

/** The subset of /api/metadata/entities/{table}/attributes this tool reads. */
export interface AttributeInfo {
  logicalName: string;
  displayName: string;
  attributeType: string;
  optionSet?: { value: number | null; label: string }[] | null;
}

export type RestoreStatus = "restored" | "failed" | "skipped" | "alreadyRestored";

export interface RestoreItem {
  table: string;
  recordId: string;
  auditId: string | null;
  /** An earlier run in this tab tried this record: the sidecar checks whether it already came back. */
  retry?: boolean;
}

export interface BinCheckResponse {
  inBin: string[];
}

export interface RestoreResult {
  table: string;
  recordId: string;
  auditId: string | null;
  status: RestoreStatus;
  code: string | null;
  message: string | null;
  warning: string | null;
}

export interface RestoreResponse {
  results: RestoreResult[];
}

/** One finished row in the restore dialog. */
export interface RestoreEntry {
  key: string;
  name: string;
  status: RestoreStatus;
  detail: string;
}

/** The filters a search ran with. */
export interface AppliedSearch {
  id: number;
  source: Source;
  table: string;
  from: string;
  to: string;
  deletedBy: string;
}
