import { useEffect, useMemo, useState } from "react";
import { Button, Checkbox, Modal, Spinner, useToast } from "../../../../shared/ui";
import { useEntityAttributes } from "../../api/useEntityAttributes";
import { useStepMutations } from "../../api/useStepMutations";
import { useStepOptions } from "../../api/useStepOptions";
import { MODE_LABELS, STAGE_LABELS, type RegistrationProblem, type StepDto } from "../../model/contracts";
import { problemFor, toRegistrationError } from "../../model/apiError";
import {
  applyDefaultMessage,
  asyncAutoDeleteEnabled,
  asyncModeAllowed,
  createStepForm,
  deploymentFlags,
  filteringAttributesEnabled,
  filteringAttributesSummary,
  preStageAllowed,
  primaryEntitiesForMessage,
  primaryEntityEnabled,
  secondaryEntitiesForPrimary,
  secondaryEntityEnabled,
  selectMessage,
  selectMode,
  selectPrimaryEntity,
  selectSecondaryEntity,
  selectStage,
  toStepDraft,
  toggleDeployment,
  usersForSelect,
  type StepFormState,
} from "../../model/stepForm";
import { AttributePickerModal } from "./AttributePickerModal";
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
  const [pickerOpen, setPickerOpen] = useState(false);

  const currentFilter = step?.filterId
    ? {
        id: step.filterId,
        primaryEntity: step.primaryEntity,
        secondaryEntity: step.secondaryEntity,
      }
    : undefined;

  useEffect(() => {
    if (!open) return;
    setForm(createStepForm(step, pluginTypeId));
    setProblems([]);
    setPickerOpen(false);
  }, [open, step, pluginTypeId]);

  useEffect(() => {
    if (!open || step) return;
    setForm((current) => applyDefaultMessage(current, optionsQuery.data));
  }, [open, optionsQuery.data, step]);

  const selectedMessage = optionsQuery.data?.messages.find(
    (message) => message.id === form.messageId,
  );
  const messageName = selectedMessage?.name ?? step?.messageName ?? "";
  const primaryEntities = primaryEntitiesForMessage(
    optionsQuery.data,
    form.messageId,
    currentFilter,
  );
  const secondaryEntities = secondaryEntitiesForPrimary(
    optionsQuery.data,
    form.messageId,
    form.primaryEntity,
    currentFilter,
  );
  const primaryEnabled = primaryEntityEnabled(
    optionsQuery.data,
    form.messageId,
    currentFilter,
  );
  const secondaryEnabled = secondaryEntityEnabled(
    optionsQuery.data,
    form.messageId,
    form.primaryEntity,
    currentFilter,
  );
  const attributesEnabled = filteringAttributesEnabled(messageName, form.primaryEntity);
  const attributesQuery = useEntityAttributes(
    open ? connectionName : null,
    attributesEnabled ? form.primaryEntity : null,
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
  const flags = deploymentFlags(form.supportedDeployment);
  const asyncDeleteEnabled = asyncAutoDeleteEnabled(form.mode);

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

  const closeDialog = () => {
    if (pickerOpen || isPending) return;
    onClose();
  };

  return (
    <>
      <Modal
        open={open}
        title={step ? "Update step" : "Register step"}
        onClose={closeDialog}
        widthClass="max-w-5xl"
        busy={isPending}
        busyLabel={step ? "Updating step…" : "Registering step…"}
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
            <div className="grid grid-cols-2 gap-6 min-h-0">
              <div className="flex flex-col gap-3">
                <FormField label="Message" htmlFor="step-message" problem={problemFor(problems, "messageId")}>
                  <select
                    id="step-message"
                    className={fieldControlClass}
                    value={form.messageId}
                    onChange={(event) =>
                      setForm((current) =>
                        selectMessage(current, event.target.value, optionsQuery.data, currentFilter),
                      )
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
                <FormField
                  label="Primary entity"
                  htmlFor="step-primary-entity"
                  problem={problemFor(problems, "filterId")}
                  disabled={!primaryEnabled}
                >
                  <select
                    id="step-primary-entity"
                    className={fieldControlClass}
                    value={form.primaryEntity}
                    disabled={!primaryEnabled}
                    onChange={(event) =>
                      setForm((current) =>
                        selectPrimaryEntity(
                          current,
                          event.target.value,
                          optionsQuery.data,
                          currentFilter,
                        ),
                      )
                    }
                  >
                    <option value="">— select —</option>
                    {primaryEntities.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField
                  label="Secondary entity"
                  htmlFor="step-secondary-entity"
                  disabled={!secondaryEnabled}
                >
                  <select
                    id="step-secondary-entity"
                    className={fieldControlClass}
                    value={form.secondaryEntity}
                    disabled={!secondaryEnabled}
                    onChange={(event) =>
                      setForm((current) =>
                        selectSecondaryEntity(
                          current,
                          event.target.value,
                          optionsQuery.data,
                          currentFilter,
                        ),
                      )
                    }
                  >
                    <option value="">— select —</option>
                    {secondaryEntities.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField
                  label="Filtering attributes"
                  problem={problemFor(problems, "filteringAttributes")}
                  disabled={!attributesEnabled}
                >
                  <button
                    type="button"
                    className={`${fieldControlClass} text-left ${
                      attributesEnabled ? "" : "cursor-not-allowed"
                    }`}
                    disabled={!attributesEnabled}
                    onClick={() => setPickerOpen(true)}
                  >
                    {filteringAttributesSummary(form.filteringAttributes.length)}
                  </button>
                </FormField>
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
                <div className="grid grid-cols-3 gap-3">
                  <FormField label="Stage" problem={problemFor(problems, "stage")}>
                    <div className="flex flex-col gap-1">
                      {[10, 20, 40].map((stage) => {
                        const disabled = !preStageAllowed(form.mode) && stage !== 40;
                        return (
                          <label
                            key={stage}
                            className={`flex items-center gap-2 text-sm ${
                              disabled
                                ? "text-[var(--color-text-dark-gray)] cursor-not-allowed"
                                : "text-[var(--color-text-gray)]"
                            }`}
                          >
                            <input
                              type="radio"
                              name="step-stage"
                              checked={form.stage === stage}
                              disabled={disabled}
                              onChange={() => setForm((current) => selectStage(current, stage))}
                            />
                            {STAGE_LABELS[stage]}
                          </label>
                        );
                      })}
                    </div>
                  </FormField>
                  <FormField label="Execution mode" problem={problemFor(problems, "mode")}>
                    <div className="flex flex-col gap-1">
                      {([0, 1] as const).map((mode) => {
                        const disabled = mode === 1 && !asyncModeAllowed(form.stage);
                        return (
                          <label
                            key={mode}
                            className={`flex items-center gap-2 text-sm ${
                              disabled
                                ? "text-[var(--color-text-dark-gray)] cursor-not-allowed"
                                : "text-[var(--color-text-gray)]"
                            }`}
                          >
                            <input
                              type="radio"
                              name="step-mode"
                              checked={form.mode === mode}
                              disabled={disabled}
                              onChange={() => setForm((current) => selectMode(current, mode))}
                            />
                            {MODE_LABELS[mode]}
                          </label>
                        );
                      })}
                    </div>
                  </FormField>
                  <FormField
                    label="Deployment"
                    problem={problemFor(problems, "supportedDeployment")}
                  >
                    <div className="flex flex-col gap-1">
                      <label className="flex items-center gap-2 text-sm text-[var(--color-text-gray)]">
                        <Checkbox
                          checked={flags.server}
                          onChange={(checked) =>
                            setForm((current) => ({
                              ...current,
                              supportedDeployment: toggleDeployment(
                                current.supportedDeployment,
                                "server",
                                checked,
                              ),
                            }))
                          }
                        />
                        Server
                      </label>
                      <label className="flex items-center gap-2 text-sm text-[var(--color-text-gray)]">
                        <Checkbox
                          checked={flags.offline}
                          onChange={(checked) =>
                            setForm((current) => ({
                              ...current,
                              supportedDeployment: toggleDeployment(
                                current.supportedDeployment,
                                "offline",
                                checked,
                              ),
                            }))
                          }
                        />
                        Offline
                      </label>
                    </div>
                  </FormField>
                </div>
                <label
                  className={`flex items-center gap-2 text-sm ${
                    asyncDeleteEnabled
                      ? "text-[var(--color-text-gray)]"
                      : "text-[var(--color-text-dark-gray)] opacity-60 cursor-not-allowed"
                  }`}
                >
                  <Checkbox
                    checked={form.asyncAutoDelete}
                    disabled={!asyncDeleteEnabled}
                    onChange={(checked) =>
                      setForm((current) => ({ ...current, asyncAutoDelete: checked }))
                    }
                  />
                  Delete completed async jobs
                </label>
              </div>

              <div className="flex flex-col gap-3">
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
                    className={`${fieldControlClass} min-h-28`}
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
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={closeDialog} disabled={isPending}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void save()} disabled={isPending}>
                {step ? "Update" : "Register"}
              </Button>
            </div>
          </>
        )}
      </Modal>
      <AttributePickerModal
        open={open && pickerOpen}
        attributes={attributeChoices}
        selected={form.filteringAttributes}
        isLoading={attributesQuery.isLoading}
        onChange={(filteringAttributes) =>
          setForm((current) => ({ ...current, filteringAttributes }))
        }
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}
