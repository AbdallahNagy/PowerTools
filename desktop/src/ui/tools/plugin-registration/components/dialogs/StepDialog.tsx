import { useEffect, useMemo, useState } from "react";
import { Button, Checkbox, Combobox, Input, Modal, Spinner, Textarea, useToast } from "../../../../shared/ui";
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
  defaultStepName,
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
  connectionId: string;
  pluginTypeId: string;
  step?: StepDto;
  onClose: () => void;
}

export function StepDialog({
  open,
  connectionId,
  pluginTypeId,
  step,
  onClose,
}: StepDialogProps) {
  const { showToast } = useToast();
  const optionsQuery = useStepOptions(open ? connectionId : null);
  const mutations = useStepMutations(connectionId);
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
    open ? connectionId : null,
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
    let draft = toStepDraft(form);
    if (!step && !draft.name) {
      draft = { ...draft, name: defaultStepName(messageName, form.primaryEntity) };
    }
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
                  <Combobox
                    id="step-message"
                    className="[&>input]:bg-raised"
                    value={form.messageId}
                    options={(optionsQuery.data?.messages ?? []).map((message) => ({
                      value: message.id,
                      label: message.name,
                    }))}
                    placeholder="— select —"
                    emptyMessage="No messages match."
                    onChange={(messageId) =>
                      setForm((current) =>
                        selectMessage(current, messageId, optionsQuery.data, currentFilter),
                      )
                    }
                  />
                </FormField>
                <FormField
                  label="Primary entity"
                  htmlFor="step-primary-entity"
                  problem={problemFor(problems, "filterId")}
                  disabled={!primaryEnabled}
                >
                  <Combobox
                    id="step-primary-entity"
                    className="[&>input]:bg-raised"
                    value={form.primaryEntity}
                    options={primaryEntities.map((name) => ({ value: name, label: name }))}
                    placeholder="— select —"
                    emptyMessage="No tables match."
                    disabled={!primaryEnabled}
                    onChange={(entity) =>
                      setForm((current) =>
                        selectPrimaryEntity(current, entity, optionsQuery.data, currentFilter),
                      )
                    }
                  />
                </FormField>
                <FormField
                  label="Secondary entity"
                  htmlFor="step-secondary-entity"
                  disabled={!secondaryEnabled}
                >
                  <Combobox
                    id="step-secondary-entity"
                    className="[&>input]:bg-raised"
                    value={form.secondaryEntity}
                    options={secondaryEntities.map((name) => ({ value: name, label: name }))}
                    placeholder="— select —"
                    emptyMessage="No tables match."
                    disabled={!secondaryEnabled}
                    onChange={(entity) =>
                      setForm((current) =>
                        selectSecondaryEntity(current, entity, optionsQuery.data, currentFilter),
                      )
                    }
                  />
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
                  <Combobox
                    id="step-user"
                    className="[&>input]:bg-raised"
                    value={form.impersonatingUserId}
                    options={[
                      { value: "", label: "Calling user" },
                      ...users.map((user) => ({
                        value: user.id,
                        label: `${user.fullName}${user.unavailable ? " (unavailable)" : ""}`,
                      })),
                    ]}
                    emptyMessage="No users match."
                    onChange={(impersonatingUserId) =>
                      setForm((current) => ({ ...current, impersonatingUserId }))
                    }
                  />
                </FormField>
                <FormField label="Execution order" htmlFor="step-rank" problem={problemFor(problems, "rank")}>
                  <Input
                    id="step-rank"
                    type="number"
                    className="bg-raised"
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
                                ? "text-fg-muted cursor-not-allowed"
                                : "text-fg"
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
                                ? "text-fg-muted cursor-not-allowed"
                                : "text-fg"
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
                      <label className="flex items-center gap-2 text-sm text-fg">
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
                      <label className="flex items-center gap-2 text-sm text-fg">
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
                      ? "text-fg"
                      : "text-fg-muted opacity-60 cursor-not-allowed"
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
                  <Input
                    id="step-name"
                    className="bg-raised"
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </FormField>
                <FormField label="Description" htmlFor="step-description">
                  <Input
                    id="step-description"
                    className="bg-raised"
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
                  <Textarea
                    id="step-configuration"
                    className="bg-raised min-h-28"
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
                    <Textarea
                      aria-label="Replacement secure configuration"
                      className="bg-raised min-h-20"
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
