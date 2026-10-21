import { ArrowRight, RotateCcw } from "lucide-react";
import type { MigrationJobStatus } from "../api/useMigrationJob";
import { isJobActive } from "../model/targetRun";
import { Alert, Button, ProgressBar } from "../../../shared/ui";

interface MigrationRunBannerProps {
  entityLogicalName: string;
  targetName: string;
  job: MigrationJobStatus;
  next: { id: string; name: string } | null;
  targetCount: number;
  canMigrateNext: boolean;
  onMigrate: (id: string) => void;
  onRetry: () => void;
  onStartOver: () => void;
}

/** Says where the last run went and offers the next target in one click. */
export function MigrationRunBanner({
  entityLogicalName,
  targetName,
  job,
  next,
  targetCount,
  canMigrateNext,
  onMigrate,
  onRetry,
  onStartOver,
}: MigrationRunBannerProps) {
  if (isJobActive(job)) {
    return (
      <Alert tone="info" title={`Migrating ${entityLogicalName} to ${targetName}…`}>
        <div className="flex items-center gap-3 mt-1.5">
          <div className="flex-1 max-w-md">
            <ProgressBar value={job.processed} max={job.total} />
          </div>
          <span className="text-xs text-fg-muted tabular-nums">
            {job.processed}/{job.total || "?"} · {job.succeeded} succeeded · {job.failed} failed
          </span>
        </div>
      </Alert>
    );
  }

  if (job.status === "failed") {
    return (
      <Alert
        tone="danger"
        title={`Migration to ${targetName} failed`}
        action={
          <Button variant="secondary" size="sm" disabled={!canMigrateNext} onClick={onRetry}>
            <RotateCcw size={14} aria-hidden="true" />
            Retry {targetName}
          </Button>
        }
      >
        {job.errors[0]?.message ?? "The job stopped before it finished."}
      </Alert>
    );
  }

  const records = `${job.succeeded} ${job.succeeded === 1 ? "record" : "records"}`;
  const failures =
    job.failed > 0 ? ` ${job.failed} failed. Open ${targetName} above to see why.` : "";

  return (
    <Alert
      tone={job.failed > 0 ? "warn" : "ok"}
      title={`${entityLogicalName} migrated to ${targetName}`}
      action={
        next ? (
          <Button size="sm" disabled={!canMigrateNext} onClick={() => onMigrate(next.id)}>
            Migrate to {next.name}
            <ArrowRight size={14} aria-hidden="true" />
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={onStartOver}>
            <RotateCcw size={14} aria-hidden="true" />
            Start over
          </Button>
        )
      }
    >
      {records} migrated.{failures}{" "}
      {next
        ? `Next up: ${next.name}, with the same fields, filter, and options.`
        : targetCount > 1
          ? `All ${targetCount} targets are done.`
          : null}
    </Alert>
  );
}
