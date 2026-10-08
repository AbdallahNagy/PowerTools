import { Alert, Button, DataTable, Modal, ProgressBar } from "../../../shared/ui";
import { summarizeByScope, type Draft, type Drafts } from "../model/drafts";
import { languageHeader, plural } from "../model/labels";
import type { Language } from "../model/types";
import type { ApplyState } from "../state/useTranslator";

interface ApplyModalProps {
  state: ApplyState;
  drafts: Drafts;
  languages: readonly Language[];
  onConfirm: () => void;
  onClose: () => void;
  onRetryPublish: () => void;
}

export function ApplyModal({ state, drafts, languages, onConfirm, onClose, onRetryPublish }: ApplyModalProps) {
  const open = state.phase !== "closed";
  const running = state.phase === "running";
  const busy = running || (state.phase === "result" && state.publishing);
  const busyLabel = running
    ? state.job?.phase === "publishing"
      ? `Publishing ${plural(publishCount(state.job.publish.targets), "component")}…`
      : `Updating labels: ${state.job?.processed ?? 0} of ${state.job?.total ?? state.sent.length}`
    : "Publishing…";

  return (
    <Modal
      open={open}
      title="Apply label changes"
      onClose={onClose}
      busy={busy}
      busyLabel={busyLabel}
      widthClass="max-w-3xl"
    >
      {state.phase === "confirm" ? (
        <ConfirmBody drafts={drafts} error={state.error} onConfirm={onConfirm} onCancel={onClose} />
      ) : null}
      {state.phase === "running" ? (
        <ProgressBar
          value={state.job?.processed ?? 0}
          max={state.job?.total ?? state.sent.length}
          label={busyLabel}
        />
      ) : null}
      {state.phase === "result" ? (
        <ResultBody
          state={state}
          languages={languages}
          onClose={onClose}
          onRetryPublish={onRetryPublish}
        />
      ) : null}
    </Modal>
  );
}

function publishCount(targets: { tables: string[]; optionSets: string[] }) {
  return targets.tables.length + targets.optionSets.length;
}

function ConfirmBody({
  drafts,
  error,
  onConfirm,
  onCancel,
}: {
  drafts: Drafts;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const summary = summarizeByScope(drafts);
  return (
    <>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <ul className="flex flex-col gap-1 text-sm text-fg" aria-label="Changes by table">
        {summary.map((line) => (
          <li key={line.scope}>
            {line.title}: {plural(line.count, "label")}
          </li>
        ))}
        <li className="font-medium text-fg-strong">Total: {plural(drafts.size, "label")}</li>
      </ul>
      <p className="text-sm text-fg-muted">Only the tables and global choices listed here are published.</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onConfirm} disabled={drafts.size === 0}>
          Apply and publish
        </Button>
      </div>
    </>
  );
}

function ResultBody({
  state,
  languages,
  onClose,
  onRetryPublish,
}: {
  state: Extract<ApplyState, { phase: "result" }>;
  languages: readonly Language[];
  onClose: () => void;
  onRetryPublish: () => void;
}) {
  const { job, failed, publish } = state;
  const total = job.succeeded + failed.length;
  const failedCount = failed.filter((draft) => !draft.error?.startsWith("Skipped:")).length;
  const skippedCount = failed.length - failedCount;
  const header = (lcid: number) => {
    const language = languages.find((item) => item.lcid === lcid);
    return language ? languageHeader(language) : String(lcid);
  };

  return (
    <>
      {failed.length > 0 ? (
        <Alert tone="warn">
          {`${job.succeeded} of ${total} labels updated. ${failedCount} failed.`}
          {skippedCount > 0 ? ` ${skippedCount} skipped.` : ""}
        </Alert>
      ) : null}
      {publish.status === "failed" ? (
        <Alert tone="danger">Labels were saved but publishing failed: {publish.message}</Alert>
      ) : null}
      {failed.length > 0 ? (
        <DataTable<Draft>
          columns={[
            { key: "component", header: "Component", render: (draft) => draft.component },
            { key: "label", header: "Label", render: (draft) => draft.labelName },
            { key: "language", header: "Language", render: (draft) => header(draft.lcid) },
            {
              key: "error",
              header: "Error",
              render: (draft) => <span className="break-words text-danger">{draft.error}</span>,
            },
          ]}
          rows={failed}
          getRowKey={(draft) => draft.id}
        />
      ) : null}
      <div className="flex justify-end gap-2">
        {publish.status === "failed" ? (
          <Button onClick={onRetryPublish}>Retry publish</Button>
        ) : null}
        <Button variant={publish.status === "failed" ? "secondary" : "primary"} onClick={onClose}>
          Close
        </Button>
      </div>
    </>
  );
}
