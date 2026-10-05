import type { RunState, RunStatus, WorkflowMode } from "./types";

export const LARGE_RUN_THRESHOLD = 10_000;
export const MIN_BATCH_SIZE = 1;
export const MAX_BATCH_SIZE = 1000;
export const MAX_DELAY_SECONDS = 300;

/** Real-time workflows run inside each batch, so they start with smaller batches. */
export function defaultBatchSize(mode: WorkflowMode | null | undefined): number {
  return mode === "realtime" ? 25 : 100;
}

export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function clamp(text: string, min: number, max: number, fallback: number): number {
  const value = Number.parseInt(text, 10);
  if (Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function clampBatchSize(text: string, fallback: number): number {
  return clamp(text, MIN_BATCH_SIZE, MAX_BATCH_SIZE, fallback);
}

export function clampDelay(text: string): number {
  return clamp(text, 0, MAX_DELAY_SECONDS, 0);
}

export function formatRemaining(seconds: number | null | undefined): string {
  if (seconds == null) return "Estimating…";
  if (seconds < 60) return "under 1 min";
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function isEndStatus(status: RunStatus | null | undefined): boolean {
  return status === "completed" || status === "cancelled" || status === "failed";
}

export function isActiveStatus(status: RunStatus | null | undefined): boolean {
  return status != null && !isEndStatus(status);
}

export function notRun(run: Pick<RunState, "total" | "processed">): number {
  return Math.max(0, run.total - run.processed);
}

/** The line shown in the run view once the run has ended. */
export function endSummary(run: RunState): string {
  const started = formatCount(run.succeeded);
  const errors = formatCount(run.failed);
  switch (run.status) {
    case "completed":
      return `Finished. ${started} started, ${errors} errors.`;
    case "cancelled":
      return `Stopped. ${started} started, ${errors} errors, ${formatCount(notRun(run))} not run.`;
    case "failed":
      return `The run failed: ${run.message?.trim() || "Unknown error."}`;
    default:
      return "";
  }
}

/** Status-bar text while a run is shown. */
export function runStatusText(run: RunState | undefined): string {
  if (!run || run.status === "collecting") return "Collecting record IDs…";
  const started = formatCount(run.succeeded);
  const errors = formatCount(run.failed);
  switch (run.status) {
    case "completed":
      return `Finished: ${started} started, ${errors} errors`;
    case "cancelled":
      return `Stopped: ${started} started, ${errors} errors`;
    case "failed":
      return "Run failed";
    default:
      return `Running ${formatCount(run.processed)}/${formatCount(run.total)}`;
  }
}

export interface CountResult {
  workflowId: string;
  fetchXml: string;
  count: number;
}

/** Start needs a finished count for exactly this workflow and FetchXML text. */
export function canStart(
  count: CountResult | null,
  workflowId: string | null,
  fetchXml: string,
): boolean {
  return (
    count != null &&
    workflowId != null &&
    count.workflowId === workflowId &&
    count.fetchXml === fetchXml &&
    count.count > 0
  );
}
