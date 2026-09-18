import { useEffect, useState } from "react";

import { Button, Modal, Spinner } from "../../../../shared/ui";
import {
  useStepEditDetails,
  useStepFilterMetadata,
  useStepMutations,
  type StepDraft,
} from "../../api/useStepMutations";
import type { PluginHandler, PluginStep } from "../../model/contracts";
import type { ReportMutationFailure, ReportMutationResult } from "../../model/pluginRegistrationError";
import { SearchableMultiSelect, SearchableSelect } from "../SearchableSelect";
import { fieldClass } from "../formStyles";

interface Props {
  connectionName: string | null;
  plugin: PluginHandler & { kind: "plugin" };
  step?: PluginStep | null;
  operation: "create" | "update";
  onClose: () => void;
  onMutationResult: ReportMutationResult;
  onMutationFailure: ReportMutationFailure;
}

type SecureAction = "keep" | "set" | "clear";

export function StepDialog({
  connectionName, plugin, step, operation, onClose, onMutationResult, onMutationFailure,
}: Props) {
  const mutations = useStepMutations(connectionName);
  const editDetails = useStepEditDetails(connectionName, operation === "update" ? step?.id ?? null : null);
  const options = mutations.options.data;
  const [messageId, setMessageId] = useState("");
  const [filterId, setFilterId] = useState("");
  const [attributes, setAttributes] = useState<string[]>([]);
  const [secure, setSecure] = useState("");
  const [stage, setStage] = useState(step?.stage ?? 40);
  const [mode, setMode] = useState(step?.mode ?? 0);
  const [rank, setRank] = useState(step?.rank ?? 1);
  const [userId, setUserId] = useState("");
  const [unsecure, setUnsecure] = useState("");
  const [description, setDescription] = useState(step?.description ?? "");
  const [showAllAttributesWarning, setShowAllAttributesWarning] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [initialReady, setInitialReady] = useState(false);
  const isReadOnly = operation === "update" && Boolean(step?.isManaged || !step?.isCustomizable);
  const detailsReady = operation === "create" || editDetails.isSuccess;
  const optionsReady = mutations.options.isSuccess;
  const selectedMessageId = messageId || options?.messages[0]?.id || "";
  const matchingFilters = options?.filters.filter((item) => item.messageId === selectedMessageId) ?? [];
  const currentFilterId = editDetails.data?.sdkMessageFilterId ?? "";
  const currentUserId = editDetails.data?.impersonatingUserId ?? "";
  const currentFilterUnavailable = Boolean(
    currentFilterId && !matchingFilters.some((item) => item.id === currentFilterId),
  );
  const selectedFilter = matchingFilters.find((item) => item.id === (filterId || currentFilterId))
    ?? (currentFilterUnavailable ? undefined : matchingFilters[0]);
  const activeFilterId = filterId || (currentFilterUnavailable ? currentFilterId : selectedFilter?.id || "");
  const filterMetadata = useStepFilterMetadata(connectionName, activeFilterId || null);
  const metadataReady = !activeFilterId || filterMetadata.isSuccess || filterMetadata.isError;
  const formError = mutations.options.isError || (operation === "update" && editDetails.isError);
  useEffect(() => {
    if (optionsReady && detailsReady && metadataReady && !formError) setInitialReady(true);
  }, [detailsReady, formError, metadataReady, optionsReady]);
  const formLoading = !initialReady && !formError;
  const canEdit = !formLoading && !formError && !isReadOnly;
  const retryLoad = () => {
    if (mutations.options.isError) void mutations.options.refetch();
    if (operation === "update" && editDetails.isError) void editDetails.refetch();
    if (filterMetadata.isError) void filterMetadata.refetch();
  };

  useEffect(() => {
    const value = editDetails.data;
    if (!value) return;
    setMessageId(value.sdkMessageId);
    setFilterId(value.sdkMessageFilterId);
    setStage(value.stage);
    setMode(value.mode);
    setRank(value.rank);
    setAttributes(value.filteringAttributes);
    setUserId(value.impersonatingUserId ?? "");
    setUnsecure(value.unsecureConfiguration ?? "");
    setSecure(value.secureConfiguration ?? "");
    setDescription(value.description ?? step?.description ?? "");
  }, [editDetails.data, step?.description]);

  const primaryIdAttribute = filterMetadata.data?.primaryIdAttribute
    || selectedFilter?.primaryIdAttribute
    || "";
  const availableAttributes = (filterMetadata.data?.availableAttributes ?? selectedFilter?.availableAttributes ?? [])
    .filter((name) => name.length > 0);
  const primaryKeySelected = Boolean(primaryIdAttribute && attributes.includes(primaryIdAttribute.toLowerCase()));
  const selectedMessageName = options?.messages.find((item) => item.id === selectedMessageId)?.name
    ?? step?.messageLabel
    ?? "Message";
  const updateWithoutFilters = selectedMessageName === "Update" && attributes.length === 0;
  const nonPrimaryAttributes = availableAttributes.filter((name) =>
    !primaryIdAttribute || name.toLowerCase() !== primaryIdAttribute.toLowerCase(),
  );
  const allAttributesSelected = nonPrimaryAttributes.length > 1
    && nonPrimaryAttributes.every((name) => attributes.includes(name.toLowerCase()));
  const currentUserUnavailable = Boolean(
    currentUserId && !(options?.enabledUsers.some((item) => item.id === currentUserId)),
  );
  const originalSecure = editDetails.data?.secureConfiguration ?? "";
  const resolvedSecureAction: SecureAction = operation === "create"
    ? (secure ? "set" : "keep")
    : secure === originalSecure ? "keep" : secure ? "set" : "clear";
  const draft: StepDraft | null = activeFilterId ? {
    pluginTypeId: plugin.id,
    sdkMessageId: selectedMessageId || editDetails.data?.sdkMessageId || "",
    sdkMessageFilterId: activeFilterId,
    primaryTable: selectedFilter?.primaryTable ?? editDetails.data?.primaryTable ?? "",
    secondaryTable: selectedFilter?.secondaryTable ?? editDetails.data?.secondaryTable ?? null,
    stage, mode, rank, filteringAttributes: attributes, impersonatingUserId: userId || null,
    unsecureConfiguration: unsecure || null,
    replacementSecureConfiguration: resolvedSecureAction === "set" ? secure : null,
    description: description || null,
    expectedVersions: editDetails.data?.expectedVersions
      ?? (step ? { [plugin.id]: plugin.versionNumber, [step.id]: step.versionNumber } : { [plugin.id]: plugin.versionNumber }),
    impersonatingUserAction: operation === "create" ? (userId ? "set" : "clear")
      : userId === (editDetails.data?.impersonatingUserId ?? "") ? "keep" : userId ? "set" : "clear",
    unsecureConfigurationAction: operation === "create" ? (unsecure ? "set" : "clear")
      : unsecure === (editDetails.data?.unsecureConfiguration ?? "") ? "keep" : unsecure ? "set" : "clear",
    secureConfigurationAction: resolvedSecureAction,
  } : null;
  const title = operation === "create" ? "Register step" : "Update step";
  const submitLabel = operation === "create" ? "Register" : "Update";
  const submitDisabledReason = isReadOnly
    ? "This step cannot be updated."
    : formLoading
      ? "Loading step details…"
      : formError
        ? "Step details must load before they can be saved."
        : !draft
          ? "Select a message and entity."
          : primaryKeySelected
            ? "Remove the primary key from filtering attributes."
            : mutations.preflight.isPending || mutations.execute.isPending
              ? "Saving…"
              : null;

  const save = async () => {
    if (!draft) return;
    setSubmitError(null);
    try {
      const preview = await mutations.preflight.mutateAsync({ operation, stepId: step?.id ?? null, draft });
      if (preview.plan.blockers.length > 0) {
        setSubmitError(preview.plan.blockers.map((item) => item.message).join(" "));
        return;
      }
      const result = await mutations.execute.mutateAsync({
        operation, stepId: step?.id ?? null, draft, token: preview.plan.token,
      });
      await onMutationResult(result, result.step?.id ?? step?.id ?? plugin.id);
    } catch (error) {
      await onMutationFailure(error, { phase: "execute", affectedComponentId: step?.id ?? plugin.id });
    }
  };
  const requestSave = () => {
    if (allAttributesSelected) {
      setShowAllAttributesWarning(true);
      return;
    }
    void save();
  };

  const entityOptions = [
    ...(currentFilterUnavailable ? [{
      id: currentFilterId,
      label: entityLabel(editDetails.data?.primaryTable ?? "entity", editDetails.data?.secondaryTable ?? null),
      unavailable: true,
    }] : []),
    ...matchingFilters
      .filter((item) => item.primaryTable && item.primaryTable.toLowerCase() !== "none")
      .map((item) => ({
        id: item.id,
        label: entityLabel(item.primaryTable, item.secondaryTable),
      })),
  ];
  const messageOptions = (options?.messages ?? []).map((item) => ({ id: item.id, label: item.name }));
  const userOptions = [
    { id: "", label: "Calling user" },
    ...(currentUserUnavailable ? [{ id: currentUserId, label: "Current user", unavailable: true }] : []),
    ...(options?.enabledUsers ?? []).map((item) => ({ id: item.id, label: item.name })),
  ];

  return (
    <>
      <Modal open title={title} onClose={onClose} widthClass="max-w-4xl">
        <div role="dialog" aria-label={title} className="flex flex-col gap-4">
          {formLoading && !formError ? (
            <div role="status" className="flex min-h-48 items-center justify-center gap-2 text-sm text-[#858585]">
              <Spinner />
              Loading step details…
            </div>
          ) : formError ? (
            <div role="alert" className="flex min-h-48 flex-col items-center justify-center gap-3 text-red-300">
              <p>Unable to load step details.</p>
              <Button type="button" variant="secondary" onClick={retryLoad}>Retry</Button>
            </div>
          ) : (
            <>
              {isReadOnly ? (
                <p role="status">This step is managed or not customizable, so it can be inspected but not updated.</p>
              ) : null}
              <fieldset disabled={!canEdit} className="grid grid-cols-2 gap-6">
                <div className="flex flex-col gap-3">
                  <SearchableSelect
                    label="Message"
                    value={selectedMessageId}
                    options={messageOptions}
                    onChange={(id) => { setMessageId(id); setFilterId(""); setAttributes([]); }}
                    disabled={!canEdit}
                  />
                  <SearchableSelect
                    label="Entity"
                    value={activeFilterId}
                    options={entityOptions}
                    onChange={(id) => { setFilterId(id); setAttributes([]); }}
                    disabled={!canEdit}
                  />
                  <SearchableMultiSelect
                    label="Filtering attributes"
                    values={attributes}
                    options={availableAttributes.map((name) => ({ id: name, label: name }))}
                    onChange={(ids) => setAttributes(ids.map((value) => value.toLowerCase()))}
                    disabled={!canEdit}
                  />
                  {updateWithoutFilters ? <p role="status" className="text-amber-300">Update steps should select filtering attributes.</p> : null}
                  {primaryKeySelected ? <p role="alert" className="text-red-300">The primary key cannot be used as an Update filtering attribute.</p> : null}
                  <SearchableSelect
                    label="Run in user's context"
                    value={userId}
                    options={userOptions}
                    onChange={setUserId}
                    disabled={!canEdit}
                  />
                  <fieldset className="flex flex-col gap-2">
                    <legend className="text-xs tracking-wider text-[#858585]">Stage</legend>
                    <label className="flex items-center gap-2 text-sm text-[var(--color-text-gray)]">
                      <input type="radio" name="step-stage" aria-label="PreValidation" checked={stage === 10} onChange={() => { setStage(10); setMode(0); }} />
                      PreValidation
                    </label>
                    <label className="flex items-center gap-2 text-sm text-[var(--color-text-gray)]">
                      <input type="radio" name="step-stage" aria-label="PreOperation" checked={stage === 20} onChange={() => { setStage(20); setMode(0); }} />
                      PreOperation
                    </label>
                    <label className="flex items-center gap-2 text-sm text-[var(--color-text-gray)]">
                      <input type="radio" name="step-stage" aria-label="PostOperation" checked={stage === 40} onChange={() => setStage(40)} />
                      PostOperation
                    </label>
                  </fieldset>
                  <fieldset className="flex flex-col gap-2">
                    <legend className="text-xs tracking-wider text-[#858585]">Execution mode</legend>
                    <label className="flex items-center gap-2 text-sm text-[var(--color-text-gray)]">
                      <input type="radio" name="step-mode" aria-label="Synchronous" checked={mode === 0} onChange={() => setMode(0)} />
                      Synchronous
                    </label>
                    <label className="flex items-center gap-2 text-sm text-[var(--color-text-gray)]">
                      <input type="radio" name="step-mode" aria-label="Asynchronous" checked={mode === 1} disabled={stage !== 40} onChange={() => setMode(1)} />
                      Asynchronous
                    </label>
                  </fieldset>
                  <label className="flex flex-col gap-1 text-xs tracking-wider text-[#858585]">
                    Rank
                    <input aria-label="Rank" type="number" value={rank} onChange={(event) => setRank(Number(event.target.value))} className={fieldClass} />
                  </label>
                </div>
                <div className="flex flex-col gap-3">
                  <label className="flex flex-col gap-1 text-xs tracking-wider text-[#858585]">
                    Description
                    <textarea aria-label="Description" value={description} onChange={(event) => setDescription(event.target.value)} className={`${fieldClass} min-h-24`} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs tracking-wider text-[#858585]">
                    Unsecure configuration
                    <textarea aria-label="Unsecure configuration" value={unsecure} onChange={(event) => setUnsecure(event.target.value)} className={`${fieldClass} min-h-24`} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs tracking-wider text-[#858585]">
                    Secure configuration
                    <textarea aria-label="Secure configuration" value={secure} onChange={(event) => setSecure(event.target.value)} className={`${fieldClass} min-h-24`} />
                  </label>
                </div>
              </fieldset>
              {submitError ? <p role="alert" className="text-red-300">{submitError}</p> : null}
              {submitDisabledReason && canEdit ? <p role="status" className="text-sm text-[#858585]">{submitDisabledReason}</p> : null}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button onClick={requestSave} disabled={!draft || !canEdit || Boolean(submitDisabledReason)}>
                  {submitLabel}
                </Button>
              </div>
            </>
          )}
          {formLoading || formError ? (
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
            </div>
          ) : null}
        </div>
      </Modal>
      {showAllAttributesWarning ? (
        <Modal open title="All attributes selected" onClose={() => setShowAllAttributesWarning(false)} widthClass="max-w-md">
          <div role="dialog" aria-label="All attributes selected" className="flex flex-col gap-3">
            <p>Selecting all filtering attributes is highly discouraged for performance reasons.</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowAllAttributesWarning(false)}>Change selection</Button>
              <Button onClick={() => { setShowAllAttributesWarning(false); void save(); }}>Do it anyway</Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function entityLabel(primaryTable: string, secondaryTable: string | null) {
  return secondaryTable ? `${primaryTable} · ${secondaryTable}` : primaryTable;
}
