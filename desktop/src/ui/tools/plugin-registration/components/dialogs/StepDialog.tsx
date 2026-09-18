import { useEffect, useMemo, useState } from "react";
import { Button, Checkbox, Modal, Spinner, useToast } from "../../../../shared/ui";
import { useEntityAttributes } from "../../api/useEntityAttributes";
import { useStepMutations } from "../../api/useStepMutations";
import { useStepOptions } from "../../api/useStepOptions";
import { MODE_LABELS, STAGE_LABELS, type RegistrationProblem, type StepDto } from "../../model/contracts";
import { problemFor, toRegistrationError } from "../../model/apiError";
import {
  applyDefaultMessage,
  createStepForm,
  filterLabel,
  filtersForMessage,
  messageSupportsFilteringAttributes,
  toStepDraft,
  usersForSelect,
  type StepFormState,
} from "../../model/stepForm";
import { FormField, fieldControlClass } from "./FormField";

interface StepDialogProps {
  open: boolean;
  connectionName: string;
  pluginTypeId: string;
  step?: StepDto;
  onClose: () => void;
}

export function StepDialog({
  open,
  connectionName,
  pluginTypeId,
  step,
  onClose,
}: StepDialogProps) {
  const { showToast } = useToast();
  const optionsQuery = useStepOptions(open ? connectionName : null);
  const mutations = useStepMutations(connectionName);
  const [form, setForm] = useState<StepFormState>(() =>
    createStepForm(step, pluginTypeId),
  );
  const [problems, setProblems] = useState<RegistrationProblem[]>([]);

  useEffect(() => {
    if (!open) return;
    setForm(createStepForm(step, pluginTypeId));
    setProblems([]);
  }, [open, step, pluginTypeId]);

  useEffect(() => {
    if (!open || step) return;
    setForm((current) => applyDefaultMessage(current, optionsQuery.data));
  }, [open, optionsQuery.data, step]);

  const selectedMessage = optionsQuery.data?.messages.find(
    (message) => message.id === form.messageId,
  );
  const messageName = selectedMessage?.name ?? step?.messageName ?? "";
  const filters = filtersForMessage(
    optionsQuery.data,
    form.messageId,
    step?.filterId
      ? {
          id: step.filterId,
          primaryEntity: step.primaryEntity,
          secondaryEntity: step.secondaryEntity,
        }
      : undefined,
  );
  const selectedFilter = filters.find((filter) => filter.id === form.filterId);
  const primaryEntity = selectedFilter?.primaryEntity ?? step?.primaryEntity ?? null;
  const attributesQuery = useEntityAttributes(
    open ? connectionName : null,
    messageSupportsFilteringAttributes(messageName) ? primaryEntity : null,
  );
  const users = usersForSelect(
    optionsQuery.data,
    step?.impersonatingUserId
      ? { id: step.impersonatingUserId, fullName: step.impersonatingUserName }
      : undefined,
  );

  const attributeChoices = useMemo(() => {
    const rows = attributesQuery.data ?? [];
    if (messageName === "Update") return rows.filter((row) => !row.isPrimaryId);
    return rows;
  }, [attributesQuery.data, messageName]);

  const isPending = mutations.create.isPending || mutations.update.isPending;

  const save = async () => {
    setProblems([]);
    const draft = toStepDraft(form);
    try {
      if (step) await mutations.update.mutateAsync({ id: step.id, draft });
      else await mutations.create.mutateAsync(draft);
      showToast(step ? "Step updated." : "Step registered.", "success");
      onClose();
    } catch (error) {
      const parsed = toRegistrationError(error);
      setProblems(parsed.problems);
      showToast(parsed.message, "error");
    }
  };

  return (
    <Modal
      open={open}
      title={step ? "Update step" : "Register step"}
      onClose={onClose}
      widthClass="max-w-3xl"
    >
      {optionsQuery.isLoading ? (
        <div className="flex justify-center p-6">
          <Spinner />
        </div>
      ) : optionsQuery.isError ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            {optionsQuery.error instanceof Error
              ? optionsQuery.error.message
              : "Step options could not be loaded."}
          </p>
          <Button type="button" variant="secondary" onClick={() => void optionsQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Message" htmlFor="step-message" problem={problemFor(problems, "messageId")}>
              <select
                id="step-message"
                className={fieldControlClass}
                value={form.messageId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    messageId: event.target.value,
                    filterId: "",
                    filteringAttributes: [],
                  }))
                }
              >
                <option value="">— select —</option>
                {optionsQuery.data?.messages.map((message) => (
                  <option key={message.id} value={message.id}>
                    {message.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Primary entity" htmlFor="step-filter" problem={problemFor(problems, "filterId")}>
              <select
                id="step-filter"
                className={fieldControlClass}
                value={form.filterId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    filterId: event.target.value,
                    filteringAttributes: [],
                  }))
                }
              >
                <option value="">none</option>
                {filters.map((filter) => (
                  <option key={filter.id} value={filter.id}>
                    {filterLabel(filter)}
                    {filter.unavailable ? " (unavailable)" : ""}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Execution order" htmlFor="step-rank" problem={problemFor(problems, "rank")}>
              <input
                id="step-rank"
                type="number"
                className={fieldControlClass}
                value={form.rank}
                onChange={(event) =>
                  setForm((current) => ({ ...current, rank: Number(event.target.value) }))
                }
              />
            </FormField>
            <FormField label="Stage" htmlFor="step-stage" problem={problemFor(problems, "stage")}>
              <select
                id="step-stage"
                className={fieldControlClass}
                value={form.stage}
                onChange={(event) =>
                  setForm((current) => ({ ...current, stage: Number(event.target.value) }))
                }
              >
                {[10, 20, 40].map((stage) => (
                  <option key={stage} value={stage}>
                    {STAGE_LABELS[stage]}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Execution mode" htmlFor="step-mode" problem={problemFor(problems, "mode")}>
              <select
                id="step-mode"
                className={fieldControlClass}
                value={form.mode}
                onChange={(event) =>
                  setForm((current) => ({ ...current, mode: Number(event.target.value) }))
                }
              >
                {[0, 1].map((mode) => (
                  <option key={mode} value={mode}>
                    {MODE_LABELS[mode]}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField
              label="Deployment"
              htmlFor="step-deployment"
              problem={problemFor(problems, "supportedDeployment")}
            >
              <select
                id="step-deployment"
                className={fieldControlClass}
                value={form.supportedDeployment}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    supportedDeployment: Number(event.target.value),
                  }))
                }
              >
                <option value={0}>Server</option>
                <option value={1}>Offline</option>
                <option value={2}>Both</option>
              </select>
            </FormField>
          </div>

          <FormField label="Name" htmlFor="step-name" problem={problemFor(problems, "name")}>
            <input
              id="step-name"
              className={fieldControlClass}
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
            />
          </FormField>

          {messageSupportsFilteringAttributes(messageName) && primaryEntity && primaryEntity !== "none" ? (
            <FormField
              label="Filtering attributes"
              problem={problemFor(problems, "filteringAttributes")}
            >
              <div className="max-h-40 overflow-auto border border-[var(--color-border-dark)] p-2 flex flex-col gap-1">
                {attributeChoices.map((attribute) => (
                  <label
                    key={attribute.logicalName}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={form.filteringAttributes.includes(attribute.logicalName)}
                      onChange={(checked) =>
                        setForm((current) => ({
                          ...current,
                          filteringAttributes: checked
                            ? [...current.filteringAttributes, attribute.logicalName]
                            : current.filteringAttributes.filter(
                                (name) => name !== attribute.logicalName,
                              ),
                        }))
                      }
                    />
                    <span>
                      {attribute.displayName}{" "}
                      <span className="text-[var(--color-text-dark-gray)]">
                        ({attribute.logicalName})
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </FormField>
          ) : null}

          <FormField label="Impersonating user" htmlFor="step-user">
            <select
              id="step-user"
              className={fieldControlClass}
              value={form.impersonatingUserId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  impersonatingUserId: event.target.value,
                }))
              }
            >
              <option value="">Calling user</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName}
                  {user.unavailable ? " (unavailable)" : ""}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Description" htmlFor="step-description">
            <input
              id="step-description"
              className={fieldControlClass}
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
            />
          </FormField>

          <FormField
            label="Unsecure configuration"
            htmlFor="step-configuration"
            problem={problemFor(problems, "configuration")}
          >
            <textarea
              id="step-configuration"
              className={`${fieldControlClass} min-h-20`}
              value={form.configuration}
              onChange={(event) =>
                setForm((current) => ({ ...current, configuration: event.target.value }))
              }
            />
          </FormField>

          <FormField
            label="Secure configuration"
            problem={problemFor(problems, "secureConfiguration")}
          >
            <div className="flex gap-4 text-sm mb-2">
              {(["keep", "replace", "clear"] as const)
                .filter((action) => step || action !== "clear")
                .map((action) => (
                  <label key={action} className="flex items-center gap-1">
                    <input
                      type="radio"
                      name="secure-action"
                      checked={form.secureConfigurationAction === action}
                      onChange={() =>
                        setForm((current) => ({
                          ...current,
                          secureConfigurationAction: action,
                        }))
                      }
                    />
                    {action === "keep"
                      ? step
                        ? "Keep existing"
                        : "None"
                      : action === "replace"
                        ? "Replace"
                        : "Clear"}
                  </label>
                ))}
            </div>
            {form.secureConfigurationAction === "replace" ? (
              <textarea
                aria-label="Replacement secure configuration"
                className={`${fieldControlClass} min-h-20`}
                value={form.secureConfiguration}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    secureConfiguration: event.target.value,
                  }))
                }
              />
            ) : null}
          </FormField>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.asyncAutoDelete}
              onChange={(checked) =>
                setForm((current) => ({ ...current, asyncAutoDelete: checked }))
              }
            />
            Delete completed async jobs
          </label>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void save()} disabled={isPending}>
              {step ? "Update" : "Register"}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
