import { useMemo, useState } from "react";
import { Button, DataTable, ProgressBar } from "../../../shared/ui";
import { endSummary, formatCount, formatRemaining, isEndStatus } from "../model/run";
import type { RunError, RunState, SortState, WorkflowRow } from "../model/types";
import { modeLabel, nextSort, sortErrors, type ErrorSortKey } from "../model/view";
import { ErrorLine, LoadingLine } from "./Notice";

export interface RunInfo {
  jobId: string;
  connectionName: string;
  workflow: WorkflowRow;
  entityName: string;
  batchSize: number;
  delaySeconds: number;
}

export function RunView({
  info,
  run,
  lostContact,
  stopping,
  onStop,
  onNewRun,
}: {
  info: RunInfo;
  run: RunState | undefined;
  lostContact: boolean;
  stopping: boolean;
  onStop: () => void;
  onNewRun: () => void;
}) {
  const [errorSort, setErrorSort] = useState<SortState<ErrorSortKey> | null>(null);
  const errors = useMemo(
    () => sortErrors((run?.errors ?? []).map((error, index) => ({ ...error, index })), errorSort),
    [errorSort, run?.errors],
  );
  const ended = isEndStatus(run?.status);
  const collecting = !run || run.status === "collecting" || (run.status === "cancelling" && run.total === 0);

  const errorColumns = [
    { key: "recordId", header: "Record ID", sortable: true, render: (row: RunError & { index: number }) => row.recordId },
    { key: "message", header: "Error", sortable: true, render: (row: RunError & { index: number }) => row.message },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-[var(--color-bg-dark)] p-4">
      <div className="flex max-w-4xl flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h2 className="text-base text-[var(--color-text-white)]">{info.workflow.name}</h2>
          <p className="text-sm text-[var(--color-text-gray)]">
            {info.entityName} · {modeLabel(info.workflow.mode)} · {info.connectionName}
          </p>
          <p className="text-sm text-[var(--color-text-dark-gray)]">
            Batch size {formatCount(info.batchSize)}, delay {info.delaySeconds} s between batches
          </p>
        </header>

        {lostContact ? (
          <p role="status" className="text-sm text-[var(--color-text-gray)]">
            Lost contact with the run. Retrying…
          </p>
        ) : null}

        {collecting && !ended ? (
          <LoadingLine label="Collecting record IDs…" />
        ) : run ? (
          <div className="flex flex-col gap-2">
            <ProgressBar
              value={run.processed}
              max={run.total}
              label={`${formatCount(run.processed)} of ${formatCount(run.total)}`}
            />
            <div className="flex flex-wrap gap-4 text-sm text-[var(--color-text-gray)]">
              <span>Started {formatCount(run.succeeded)}</span>
              <span>Errors {formatCount(run.failed)}</span>
              {!ended ? <span>About {formatRemaining(run.estimatedSecondsRemaining)} remaining</span> : null}
            </div>
          </div>
        ) : null}

        {run && ended ? (
          run.status === "failed" ? (
            <div className="flex flex-col gap-1">
              <ErrorLine>{endSummary(run)}</ErrorLine>
              <p className="text-sm text-[var(--color-text-gray)]">
                {formatCount(run.succeeded)} started, {formatCount(run.failed)} errors,{" "}
                {formatCount(Math.max(0, run.total - run.processed))} not run.
              </p>
            </div>
          ) : (
            <p role="status" className="text-sm text-[var(--color-text-white)]">{endSummary(run)}</p>
          )
        ) : null}

        <div className="flex flex-col items-start gap-2">
          {ended ? (
            <Button type="button" variant="primary" onClick={onNewRun}>New run</Button>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={onStop}
                disabled={stopping || run?.status === "cancelling"}
              >
                {stopping || run?.status === "cancelling" ? "Stopping after current batch…" : "Stop"}
              </Button>
              <p className="text-sm text-[var(--color-text-dark-gray)]">
                Stop sends no more batches. System jobs already queued keep running.
              </p>
            </>
          )}
        </div>

        {run && run.errors.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm text-[var(--color-text-white)]">Errors</h3>
            {run.errorsCapped ? (
              <p className="text-sm text-[var(--color-text-dark-gray)]">
                Showing the first {formatCount(run.errors.length)} errors.
              </p>
            ) : null}
            <DataTable
              columns={errorColumns}
              rows={errors}
              getRowKey={(row) => String(row.index)}
              sortKey={errorSort?.key ?? null}
              sortDirection={errorSort?.direction ?? "asc"}
              onSort={(key) => setErrorSort((current) => nextSort(current, key as ErrorSortKey))}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
