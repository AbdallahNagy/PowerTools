import { Button, Modal } from "../../../shared/ui";
import { formatCount, LARGE_RUN_THRESHOLD } from "../model/run";
import type { WorkflowRow } from "../model/types";
import { modeLabel } from "../model/view";
import { ErrorLine, WarningLine } from "./Notice";

export function StartModal({
  open,
  workflow,
  entityName,
  count,
  batchSize,
  delaySeconds,
  busy,
  errorText,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  workflow: WorkflowRow;
  entityName: string;
  count: number;
  batchSize: number;
  delaySeconds: number;
  busy: boolean;
  errorText: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const realtime = workflow.mode === "realtime";
  return (
    <Modal open={open} title="Start workflows" onClose={onCancel} busy={busy} busyLabel="Starting…" widthClass="max-w-lg">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
        <Field label="Workflow" value={workflow.name} />
        <Field label="Mode" value={modeLabel(workflow.mode)} />
        {realtime ? (
          <Field label="Run as" value={workflow.runAs === "callingUser" ? "Calling user" : "Owner"} />
        ) : null}
        <Field label="Entity" value={entityName} />
        <Field label="Records" value={formatCount(count)} />
        <Field label="Batch size" value={formatCount(batchSize)} />
        <Field label="Delay between batches" value={`${delaySeconds} s`} />
      </dl>
      {count > LARGE_RUN_THRESHOLD ? (
        <WarningLine>
          This queues a large number of workflow jobs. Each system job and its log use database storage.
        </WarningLine>
      ) : null}
      {realtime ? (
        <WarningLine>
          Real-time workflows run inside each batch, so batches are slower and can time out.
        </WarningLine>
      ) : null}
      {errorText ? <ErrorLine>{errorText}</ErrorLine> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" variant="primary" onClick={onConfirm} disabled={busy}>
          {`Start ${formatCount(count)} workflows`}
        </Button>
      </div>
    </Modal>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="text-fg-strong">{value}</dd>
    </>
  );
}
