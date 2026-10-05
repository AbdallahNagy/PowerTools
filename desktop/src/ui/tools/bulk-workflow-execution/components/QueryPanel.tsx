import { useId } from "react";
import { Button, Spinner } from "../../../shared/ui";
import { formatCount, MAX_BATCH_SIZE, MAX_DELAY_SECONDS, MIN_BATCH_SIZE } from "../model/run";
import { ErrorLine } from "./Notice";

const inputClass =
  "w-24 rounded-sm border border-[var(--color-border-dark)] bg-[var(--color-bg-light)] px-2 py-1 text-sm text-[var(--color-text-white)] focus:border-[var(--color-primary)] focus:outline-none";

export function QueryPanel({
  fetchXml,
  onFetchXmlChange,
  batchSize,
  onBatchSizeChange,
  onBatchSizeBlur,
  delay,
  onDelayChange,
  onDelayBlur,
  realtime,
  canCount,
  counting,
  onCount,
  matchedCount,
  countError,
  canStart,
  onStart,
}: {
  fetchXml: string;
  onFetchXmlChange: (value: string) => void;
  batchSize: string;
  onBatchSizeChange: (value: string) => void;
  onBatchSizeBlur: () => void;
  delay: string;
  onDelayChange: (value: string) => void;
  onDelayBlur: () => void;
  realtime: boolean;
  canCount: boolean;
  counting: boolean;
  onCount: () => void;
  matchedCount: number | null;
  countError: string | null;
  canStart: boolean;
  onStart: () => void;
}) {
  const batchId = useId();
  const delayId = useId();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center border-b border-[var(--color-border-dark)] bg-[var(--color-bg-darker)] px-3 py-2">
        <h2 className="text-sm font-medium text-[var(--color-text-white)]">Query and run</h2>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
        <textarea
          aria-label="FetchXML"
          spellCheck={false}
          value={fetchXml}
          onChange={(event) => onFetchXmlChange(event.target.value)}
          className="min-h-32 flex-1 resize-none rounded-sm border border-[var(--color-border-dark)] bg-[var(--color-bg-light)] p-2 font-mono text-sm text-[var(--color-text-white)] focus:border-[var(--color-primary)] focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-4">
          <label htmlFor={batchId} className="flex items-center gap-2 text-sm text-[var(--color-text-gray)]">
            Batch size
            <input
              id={batchId}
              type="number"
              min={MIN_BATCH_SIZE}
              max={MAX_BATCH_SIZE}
              value={batchSize}
              onChange={(event) => onBatchSizeChange(event.target.value)}
              onBlur={onBatchSizeBlur}
              className={inputClass}
            />
          </label>
          <label htmlFor={delayId} className="flex items-center gap-2 text-sm text-[var(--color-text-gray)]">
            Delay between batches (seconds)
            <input
              id={delayId}
              type="number"
              min={0}
              max={MAX_DELAY_SECONDS}
              value={delay}
              onChange={(event) => onDelayChange(event.target.value)}
              onBlur={onDelayBlur}
              className={inputClass}
            />
          </label>
        </div>
        {realtime ? (
          <p className="text-sm text-[var(--color-text-dark-gray)]">
            Real-time workflows run inside each batch. Use a smaller batch size.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" disabled={!canCount || counting} onClick={onCount}>
            {counting ? (
              <span className="flex items-center gap-2">
                <Spinner />
                Counting…
              </span>
            ) : (
              "Count records"
            )}
          </Button>
          {matchedCount != null && matchedCount > 0 ? (
            <span className="text-sm text-[var(--color-text-gray)]">
              {matchedCount === 1 ? "1 record matches" : `${formatCount(matchedCount)} records match`}
            </span>
          ) : null}
          <Button type="button" variant="primary" disabled={!canStart} onClick={onStart}>
            Start
          </Button>
        </div>
        {matchedCount === 0 ? (
          <p className="text-sm text-[var(--color-text-gray)]">No records match. There is nothing to run.</p>
        ) : null}
        {countError ? <ErrorLine>{countError}</ErrorLine> : null}
      </div>
    </div>
  );
}
