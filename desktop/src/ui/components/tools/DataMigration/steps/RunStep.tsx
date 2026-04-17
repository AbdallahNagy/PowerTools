import { useEffect, useState } from "react";
import { ProgressBar } from "../../../ui/ProgressBar";
import { Spinner } from "../../../ui/Spinner";
import { Button } from "../../../ui/Button";
import { useStartMigration, useMigrationJob, type MigrationJobStatus } from "../../../../api/hooks/useMigrationJob";
import type { MigrationMode } from "./SettingsStep";

interface RunStepProps {
  entityLogicalName: string;
  attributes: string[];
  fetchXmlFilter: string;
  mode: MigrationMode;
  matchAttribute: string;
  targetConnectionName: string;
  onBack: () => void;
  onReset: () => void;
}

export function RunStep({
  entityLogicalName,
  attributes,
  fetchXmlFilter,
  mode,
  matchAttribute,
  targetConnectionName,
  onBack,
  onReset,
}: RunStepProps) {
  const [jobId, setJobId] = useState<string | null>(null);
  const { mutate: startMigration, isPending, error: startError } = useStartMigration();
  const { data: job } = useMigrationJob(jobId);

  const isRunning = job?.status === "queued" || job?.status === "running";
  const isDone = job?.status === "completed" || job?.status === "failed";

  const handleStart = () => {
    startMigration(
      {
        entityLogicalName,
        attributes,
        fetchXmlFilter: fetchXmlFilter || undefined,
        mode,
        matchAttribute: matchAttribute || undefined,
        targetConnectionName,
      },
      {
        onSuccess: (res) => setJobId(res.jobId),
      }
    );
  };

  return (
    <div className="flex flex-col gap-5">
      {!jobId && !isPending && (
        <div className="bg-[#252526] border border-[#3c3c3c] rounded-sm p-4 text-sm text-[#cccccc]">
          <p className="font-semibold text-white mb-2">Ready to migrate</p>
          <ul className="text-[#858585] text-xs space-y-1">
            <li>Entity: <span className="text-[#cccccc]">{entityLogicalName}</span></li>
            <li>Attributes: <span className="text-[#cccccc]">{attributes.length} selected</span></li>
            <li>Mode: <span className="text-[#cccccc]">{mode}</span></li>
            {matchAttribute && <li>Match by: <span className="text-[#cccccc]">{matchAttribute}</span></li>}
            {fetchXmlFilter && <li>Filter: <span className="text-[#cccccc]">custom FetchXML</span></li>}
          </ul>
        </div>
      )}

      {startError && (
        <p className="text-sm text-[#f48771] bg-[#3c1e1e] border border-red-700 rounded-sm px-3 py-2">
          {(startError as Error).message}
        </p>
      )}

      {(isRunning || isDone) && job && (
        <JobProgress job={job} />
      )}

      {isDone && job && (
        <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-sm border ${
          job.failed > 0
            ? "bg-[#3c2d20] border-[#e8a87c] text-[#e8a87c]"
            : "bg-[#1e3c1e] border-green-700 text-green-200"
        }`}>
          {job.failed > 0
            ? `⚠ Completed with ${job.failed} error${job.failed > 1 ? "s" : ""}. ${job.succeeded} record${job.succeeded !== 1 ? "s" : ""} migrated successfully.`
            : `✓ Migration complete. ${job.succeeded} record${job.succeeded !== 1 ? "s" : ""} migrated successfully.`}
        </div>
      )}

      <div className="flex justify-between items-center pt-2">
        {!jobId ? (
          <>
            <button
              onClick={onBack}
              disabled={isPending}
              className="text-sm text-[#858585] hover:text-white transition-colors disabled:opacity-40"
            >
              ← Back
            </button>
            <Button onClick={handleStart} disabled={isPending}>
              {isPending ? <><Spinner size={14} />&nbsp;Starting…</> : "Start Migration"}
            </Button>
          </>
        ) : (
          <>
            <span />
            {isDone && (
              <div className="flex gap-3">
                <Button variant="secondary" onClick={onReset}>Migrate Again</Button>
              </div>
            )}
            {isRunning && (
              <div className="flex items-center gap-2 text-xs text-[#858585]">
                <Spinner size={12} /> Running…
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function JobProgress({ job }: { job: MigrationJobStatus }) {
  return (
    <div className="flex flex-col gap-3">
      <ProgressBar
        value={job.processed}
        max={job.total || job.processed || 1}
        label={`${job.processed} / ${job.total || "?"} records processed`}
      />

      <div className="flex gap-4 text-xs">
        <span className="text-green-400">✓ {job.succeeded} succeeded</span>
        {job.failed > 0 && <span className="text-[#f48771]">✗ {job.failed} failed</span>}
      </div>

      {job.errors.length > 0 && (
        <div className="border border-red-800 rounded-sm overflow-hidden">
          <div className="bg-[#3c1e1e] px-3 py-1.5 text-xs text-[#f48771] font-medium">
            Errors ({job.errors.length})
          </div>
          <div className="max-h-48 overflow-auto">
            {job.errors.map((e, i) => (
              <div key={i} className="px-3 py-2 border-t border-red-900 first:border-0">
                <p className="text-xs text-[#858585]">Record: <span className="text-[#cccccc] font-mono">{e.recordId}</span></p>
                <p className="text-xs text-[#f48771] mt-0.5">{e.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
