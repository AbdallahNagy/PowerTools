import { DataTable } from "../../../shared/ui";
import { resultSummary } from "../model/resultSummary";
import type { FetchResult } from "../model/types";

interface ResultsPanelProps {
  result: FetchResult | null;
}

export function ResultsPanel({ result }: ResultsPanelProps) {
  const summary = result ? resultSummary(result.records.length, result.moreRecords) : null;

  return (
    <section aria-label="Results" className="flex h-full min-h-0 flex-1 flex-col gap-2">
      <div className="text-xs text-fg">
        {summary ? `Results - ${summary}` : "Results"}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {!result ? (
          <p className="px-3 py-6 text-center text-xs text-fg-muted">
            Run a query to see records.
          </p>
        ) : result.columns.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-fg-muted">
            No rows returned
          </p>
        ) : (
          <DataTable
            columns={result.columns.map((column) => ({ key: column, header: column }))}
            rows={result.records}
            getRowKey={(_row, index) => String(index)}
            emptyMessage="No rows returned"
          />
        )}
      </div>
    </section>
  );
}
