import { useId } from "react";
import { Alert, Button, Checkbox, DataTable, Field, Input, Modal, ProgressBar, Select } from "../../../shared/ui";
import { summarizeByScope, type Draft, type Drafts } from "../model/drafts";
import { languageHeader, plural } from "../model/labels";
import { solutionNeedsAttention, uniqueNameFrom, type SolutionTargetDraft } from "../model/solutionTarget";
import type { Language, PublisherInfo, SolutionFailure, SolutionInfo, SolutionResult } from "../model/types";
import type { ApplyState } from "../state/useTranslator";

/** The optional "Add changed components to a solution" section. Absent when the source is a solution. */
export interface SolutionOption {
  target: SolutionTargetDraft;
  onChange: (target: SolutionTargetDraft) => void;
  errors: Partial<Record<keyof SolutionTargetDraft, string>>;
  solutions: readonly SolutionInfo[];
  solutionsLoading: boolean;
  solutionsError: string | null;
  publishers: readonly PublisherInfo[];
  publishersLoading: boolean;
  publishersError: string | null;
}

interface ApplyModalProps {
  state: ApplyState;
  drafts: Drafts;
  languages: readonly Language[];
  solutionOption: SolutionOption | null;
  onConfirm: () => void;
  onClose: () => void;
  onRetryPublish: () => void;
}

export function ApplyModal({
  state,
  drafts,
  languages,
  solutionOption,
  onConfirm,
  onClose,
  onRetryPublish,
}: ApplyModalProps) {
  const open = state.phase !== "closed";
  const running = state.phase === "running";
  const busy = running || (state.phase === "result" && state.publishing);
  const busyLabel = running
    ? state.job?.phase === "publishing"
      ? `Publishing ${plural(publishCount(state.job.publish.targets), "component")}…`
      : state.job?.phase === "solution"
        ? `Adding components to ${solutionName(state.job.solution)}…`
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
        <ConfirmBody
          drafts={drafts}
          error={state.error}
          solutionOption={solutionOption}
          onConfirm={onConfirm}
          onCancel={onClose}
        />
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

function solutionName(solution: SolutionResult | undefined) {
  return solution?.friendlyName ?? solution?.uniqueName ?? "the solution";
}

function ConfirmBody({
  drafts,
  error,
  solutionOption,
  onConfirm,
  onCancel,
}: {
  drafts: Drafts;
  error: string | null;
  solutionOption: SolutionOption | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const summary = summarizeByScope(drafts);
  const solutionInvalid = !!solutionOption && Object.keys(solutionOption.errors).length > 0;
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
      {solutionOption ? <SolutionTargetFields option={solutionOption} /> : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onConfirm} disabled={drafts.size === 0 || solutionInvalid}>
          Apply and publish
        </Button>
      </div>
    </>
  );
}

function SolutionTargetFields({ option }: { option: SolutionOption }) {
  const { target, onChange, errors } = option;
  const set = (patch: Partial<SolutionTargetDraft>) => onChange({ ...target, ...patch });
  const modeName = useId();

  return (
    <fieldset className="flex flex-col gap-3 rounded-sm border border-line p-3">
      <label className="flex items-center gap-2 text-sm text-fg">
        <Checkbox checked={target.enabled} onChange={(enabled) => set({ enabled })} />
        Add changed components to a solution
      </label>
      {target.enabled ? (
        <>
          <div role="radiogroup" aria-label="Solution" className="flex gap-4 text-sm text-fg">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={modeName}
                className="accent-accent"
                checked={target.mode === "existing"}
                onChange={() => set({ mode: "existing" })}
              />
              Existing solution
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={modeName}
                className="accent-accent"
                checked={target.mode === "new"}
                onChange={() => set({ mode: "new" })}
              />
              New solution
            </label>
          </div>
          {target.mode === "existing" ? (
            <ExistingSolutionField option={option} />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Display name" error={errors.friendlyName}>
                <Input
                  value={target.friendlyName}
                  onChange={(event) =>
                    set({
                      friendlyName: event.target.value,
                      ...(target.uniqueNameEdited ? {} : { uniqueName: uniqueNameFrom(event.target.value) }),
                    })
                  }
                />
              </Field>
              <Field label="Unique name" error={errors.uniqueName}>
                <Input
                  className="font-mono"
                  value={target.uniqueName}
                  onChange={(event) => set({ uniqueName: event.target.value, uniqueNameEdited: true })}
                />
              </Field>
              <Field
                label="Publisher"
                error={option.publishersError ?? errors.publisherId}
                hint={
                  !option.publishersLoading && option.publishers.length === 0 && !option.publishersError
                    ? "No publisher can be used. Read-only publishers are not listed."
                    : undefined
                }
              >
                <Select
                  value={target.publisherId}
                  disabled={option.publishersLoading || option.publishers.length === 0}
                  onChange={(event) => set({ publisherId: event.target.value })}
                >
                  <option value="">{option.publishersLoading ? "Loading publishers…" : "Choose a publisher"}</option>
                  {option.publishers.map((publisher) => (
                    <option key={publisher.publisherId} value={publisher.publisherId}>
                      {publisher.prefix ? `${publisher.friendlyName} (${publisher.prefix})` : publisher.friendlyName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Version" error={errors.version}>
                <Input value={target.version} onChange={(event) => set({ version: event.target.value })} />
              </Field>
            </div>
          )}
          <p className="text-xs text-fg-muted">
            Only the components whose labels change are added. A table is added without its other components.
          </p>
        </>
      ) : null}
    </fieldset>
  );
}

function ExistingSolutionField({ option }: { option: SolutionOption }) {
  const { target, onChange, errors } = option;
  const empty = !option.solutionsLoading && !option.solutionsError && option.solutions.length === 0;
  return (
    <Field
      label="Unmanaged solution"
      error={option.solutionsError ?? errors.existing}
      hint={empty ? "This environment has no unmanaged solution. Create a new one instead." : undefined}
    >
      <Select
        value={target.existing}
        disabled={option.solutionsLoading || option.solutions.length === 0}
        onChange={(event) => onChange({ ...target, existing: event.target.value })}
      >
        <option value="">{option.solutionsLoading ? "Loading solutions…" : "Choose a solution"}</option>
        {option.solutions.map((solution) => (
          <option key={solution.solutionId} value={solution.uniqueName}>
            {solution.friendlyName}
          </option>
        ))}
      </Select>
    </Field>
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
  const solution = job.solution;
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
      {solution && solutionNeedsAttention(solution) ? (
        <Alert tone={solution.status === "partial" ? "warn" : "danger"}>
          {solution.status === "partial"
            ? `Labels were saved. ${solution.added} of ${solution.added + solution.failed} components were added to ${solutionName(solution)}.`
            : `Labels were saved but adding components to ${solutionName(solution)} failed: ${solution.message ?? "Unknown error."}`}
        </Alert>
      ) : null}
      {solution?.status === "succeeded" ? (
        <p className="text-sm text-fg">
          {`Added ${plural(solution.added, "component")} to ${solutionName(solution)}.`}
        </p>
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
      {solution && solution.failures.length > 0 ? (
        <DataTable<SolutionFailure>
          columns={[
            { key: "component", header: "Solution component", render: (item) => item.component },
            {
              key: "error",
              header: "Error",
              render: (item) => <span className="break-words text-danger">{item.message}</span>,
            },
          ]}
          rows={solution.failures}
          getRowKey={(item) => `${item.componentType}:${item.component}`}
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
