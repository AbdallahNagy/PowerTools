export interface FetchResult {
  records: Record<string, unknown>[];
  columns: string[];
  columnTypes: Record<string, string>;
  moreRecords: boolean;
  pagingCookie: string | null;
  totalEstimate: number | null;
}

export type FetchValueMode = "formatted" | "raw";

export interface ExecuteFetchRequest {
  fetchXml: string;
  preserveFetchXml: true;
  valueMode: FetchValueMode;
}

export interface SavedQuery {
  id: string;
  table: string;
  description: string;
  environment: string;
  connectionName: string;
  fetchXml: string;
  savedAt: string;
}
