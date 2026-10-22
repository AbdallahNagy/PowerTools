import { CircleAlert, CircleCheck, TriangleAlert, X } from "lucide-react";
import { Popover } from "radix-ui";
import type { MigrationJobStatus } from "../api/useMigrationJob";
import { targetStateLabels, type TargetState } from "../model/targetRun";
import { Badge, Button, Spinner, cn } from "../../../shared/ui";

export interface TargetItem {
  id: string;
  name: string;
  step: number;
  state: TargetState;
  /** Live job while running, otherwise the finished result. */
  job?: MigrationJobStatus;
  isNext: boolean;
  canMigrate: boolean;
}

interface TargetChipProps {
  item: TargetItem;
  onMigrate: (id: string) => void;
  onRemove: (id: string) => void;
}

const chipTones: Record<TargetState, string> = {
  pending: "bg-raised border-line text-fg",
  running: "bg-accent-soft border-accent-text/40 text-fg-strong",
  succeeded: "bg-ok-soft border-ok/40 text-fg-strong",
  partial: "bg-warn-soft border-warn/40 text-fg-strong",
  failed: "bg-danger-soft border-danger/40 text-fg-strong",
};

const badgeTones = {
  pending: "neutral",
  running: "accent",
  succeeded: "ok",
  partial: "warn",
  failed: "danger",
} as const;

export function TargetChip({ item, onMigrate, onRemove }: TargetChipProps) {
  const { id, name, state, job, isNext } = item;
  const running = state === "running";
  const stateLabel = isNext && state === "pending" ? "Next" : targetStateLabels[state];

  return (
    <div
      data-state={state}
      className={cn(
        "inline-flex items-stretch rounded-sm border text-sm transition-colors",
        chipTones[state],
        isNext && state === "pending" && "border-accent-text",
      )}
    >
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={`${name}, ${stateLabel}`}
            className="flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-l-sm hover:bg-hover/60 cursor-pointer"
          >
            <StateIcon item={item} />
            <span className="max-w-48 truncate">{name}</span>
            <ChipCount state={state} job={job} />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            className="z-[100] w-80 rounded-sm border border-line bg-surface text-fg shadow-lg"
          >
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-line">
              <span className="font-medium text-fg-strong truncate">{name}</span>
              <Badge tone={isNext && state === "pending" ? "accent" : badgeTones[state]}>
                {stateLabel}
              </Badge>
            </div>
            <JobDetails state={state} job={job} />
            <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-line">
              <Popover.Close asChild>
                <Button variant="ghost" size="sm" disabled={running} onClick={() => onRemove(id)}>
                  Remove target
                </Button>
              </Popover.Close>
              {!running && (
                <Popover.Close asChild>
                  <Button
                    variant={state === "pending" ? "primary" : "secondary"}
                    size="sm"
                    disabled={!item.canMigrate}
                    onClick={() => onMigrate(id)}
                  >
                    {state === "pending" ? `Migrate to ${name}` : "Migrate again"}
                  </Button>
                </Popover.Close>
              )}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <button
        type="button"
        aria-label={`Remove ${name}`}
        disabled={running}
        onClick={() => onRemove(id)}
        className="flex items-center px-1 rounded-r-sm text-fg-muted hover:text-fg-strong hover:bg-hover/60 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <X size={12} aria-hidden="true" />
      </button>
    </div>
  );
}

function StateIcon({ item }: { item: TargetItem }) {
  switch (item.state) {
    case "running":
      return <Spinner size={12} />;
    case "succeeded":
      return <CircleCheck size={14} className="text-ok shrink-0" aria-hidden="true" />;
    case "partial":
      return <TriangleAlert size={14} className="text-warn shrink-0" aria-hidden="true" />;
    case "failed":
      return <CircleAlert size={14} className="text-danger shrink-0" aria-hidden="true" />;
    default:
      return (
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-xs leading-none",
            item.isNext ? "bg-accent text-accent-fg" : "border border-line-strong text-fg-muted",
          )}
        >
          {item.step}
        </span>
      );
  }
}

function ChipCount({ state, job }: { state: TargetState; job?: MigrationJobStatus }) {
  if (!job || state === "pending") return null;
  const text =
    state === "running"
      ? `${job.processed}/${job.total || "?"}`
      : state === "partial"
        ? `${job.succeeded} · ${job.failed} failed`
        : state === "failed"
          ? null
          : `${job.succeeded}`;
  return text ? <span className="text-xs text-fg-muted tabular-nums">{text}</span> : null;
}

function JobDetails({ state, job }: { state: TargetState; job?: MigrationJobStatus }) {
  if (!job || state === "pending") {
    return (
      <p className="px-3 py-2 text-xs text-fg-muted">
        Not migrated yet with the current entity, fields, filter, and options.
      </p>
    );
  }
  return (
    <div style={{ userSelect: "text" }}>
      <p className="px-3 py-2 text-xs">
        {job.processed}/{job.total || "?"} processed · {job.succeeded} succeeded · {job.failed}{" "}
        failed
      </p>
      {job.errors.length > 0 && (
        <div className="max-h-48 overflow-auto border-t border-line">
          {job.errors.map((e, i) => (
            <div key={i} className="px-3 py-2 border-b border-line last:border-0">
              <p className="text-xs text-fg-muted">
                Record: <span className="text-fg font-mono">{e.recordId}</span>
              </p>
              <p className="text-xs text-danger mt-0.5">{e.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
