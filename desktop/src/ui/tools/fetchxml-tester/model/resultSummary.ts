export function resultSummary(recordCount: number, moreRecords: boolean): string {
  return `Number of rows returned: ${recordCount} (More records: ${moreRecords ? "true" : "false"})`;
}
