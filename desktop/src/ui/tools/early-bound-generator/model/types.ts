export interface TableSummary {
  logicalName: string;
  schemaName: string;
  displayName: string;
  isCustom: boolean;
}

export interface TablesResponse {
  tables: TableSummary[];
}

export interface GenerateRequest {
  namespace: string;
  tables: string[];
}

export interface GenerateResponse {
  fileName: string;
  code: string;
  tableCount: number;
}
