import { Button, DataTable, ProgressBar } from "../../../shared/ui";
import type { CopyEntry } from "../model/types";
import { exportLogText } from "../model/view";

export interface LogRow extends CopyEntry {
  key: string;
}

export function CopyLog({
  environmentName,
  rows,
  running,
  showProgress,
  processed,
  total,
  onClear,
}: {
  environmentName: string | null;
  rows: LogRow[];
  running: boolean;
  showProgress: boolean;
  processed: number;
  total: number;
  onClear: () => void;
}) {
  const exportLog = () => {
    const text = exportLogText(environmentName, rows);
    const anchor = document.createElement("a");
    anchor.href = `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
    anchor.download = "solution-components-mover-log.txt";
    anchor.click();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      {environmentName ? (
        <h2 className="text-sm text-[var(--color-text-dark-gray)]">{environmentName}</h2>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onClear} disabled={running || rows.length === 0}>
          Clear
        </Button>
        <Button type="button" variant="secondary" onClick={exportLog} disabled={rows.length === 0}>
          Export
        </Button>
      </div>
      {showProgress ? (
        <div
          role="progressbar"
          aria-label="Copy progress"
          aria-valuemin={0}
          aria-valuenow={processed}
          aria-valuemax={total}
        >
          <ProgressBar value={processed} max={total} />
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">
        <DataTable
          columns={[
            { key: "component", header: "Component", render: (row: LogRow) => row.label },
            { key: "target", header: "Target solution", render: (row: LogRow) => row.solutionUniqueName },
            {
              key: "result",
              header: "Result",
              render: (row: LogRow) => (row.succeeded ? "Succeeded" : "Failed"),
            },
            {
              key: "detail",
              header: "Detail",
              render: (row: LogRow) => (row.succeeded ? "" : row.message),
            },
          ]}
          rows={rows}
          getRowKey={(row) => row.key}
          emptyMessage="No copy results"
        />
      </div>
    </div>
  );
}
