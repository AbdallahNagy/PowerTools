import { useEffect, useMemo, useState } from "react";

import { Button, Modal } from "../../../../shared/ui";
import { useStepEditDetails, useStepMutations, type StepDraft, type StepPreflight } from "../../api/useStepMutations";
import type { PluginHandler, PluginStep } from "../../model/contracts";
import type { ReportMutationFailure, ReportMutationResult } from "../../model/pluginRegistrationError";

interface Props { connectionName: string | null; plugin: PluginHandler & { kind: "plugin" }; step?: PluginStep | null;
  operation: "create" | "update"; onClose: () => void;
  onMutationResult: ReportMutationResult; onMutationFailure: ReportMutationFailure; }

export function StepDialog({ connectionName, plugin, step, operation, onClose, onMutationResult, onMutationFailure }: Props) {
  const mutations = useStepMutations(connectionName);
  const editDetails = useStepEditDetails(connectionName, operation === "update" ? step?.id ?? null : null);
  const options = mutations.options.data;
  const [messageId, setMessageId] = useState("");
  const selectedMessageId = messageId || options?.messages[0]?.id || "";
  const matchingFilters = options?.filters.filter(item => item.messageId === selectedMessageId) ?? [];
  const [filterId, setFilterId] = useState("");
  const selectedFilter = matchingFilters.find(item => item.id === filterId) ?? matchingFilters[0];
  const [attributesText, setAttributesText] = useState("");
  const [secureReplacement, setSecureReplacement] = useState("");
  const [stage, setStage] = useState(step?.stage ?? 40);
  const [mode, setMode] = useState(step?.mode ?? 0);
  const [rank, setRank] = useState(step?.rank ?? 1);
  const [userId, setUserId] = useState("");
  const [unsecure, setUnsecure] = useState("");
  const [preview, setPreview] = useState<StepPreflight | null>(null);
  const isReadOnly = operation === "update" && Boolean(step?.isManaged || !step?.isCustomizable);
  const canEdit = mutations.options.isSuccess && (operation === "create" || editDetails.isSuccess) && !isReadOnly;
  useEffect(() => {
    const value = editDetails.data; if (!value) return;
    setMessageId(value.sdkMessageId); setFilterId(value.sdkMessageFilterId); setStage(value.stage);
    setMode(value.mode); setRank(value.rank); setAttributesText(value.filteringAttributes.join(", "));
    setUserId(value.impersonatingUserId ?? ""); setUnsecure(value.unsecureConfiguration ?? "");
  }, [editDetails.data]);
  const attributes = useMemo(() => attributesText.split(",").map(value => value.trim().toLowerCase()).filter(Boolean), [attributesText]);
  const primaryKeySelected = Boolean(selectedFilter?.primaryIdAttribute
    && attributes.includes(selectedFilter.primaryIdAttribute.toLowerCase()));
  const updateWithoutFilters = options?.messages.find(item => item.id === selectedMessageId)?.name === "Update" && attributes.length === 0;
  const previewDisabledReason = isReadOnly
    ? "This step cannot be updated."
    : mutations.preflight.isPending
      ? "Preparing the preview…"
      : !mutations.options.isSuccess || operation === "update" && !editDetails.isSuccess
        ? "Step details and choices must load before a preview can be created."
        : !selectedFilter
          ? "No available message filter matches this step."
          : primaryKeySelected
            ? "Remove the primary key from filtering attributes before creating a preview."
            : null;
  const draft: StepDraft | null = selectedFilter ? {
    pluginTypeId: plugin.id, sdkMessageId: selectedMessageId, sdkMessageFilterId: selectedFilter.id,
    primaryTable: selectedFilter.primaryTable, secondaryTable: selectedFilter.secondaryTable,
    stage, mode, rank, filteringAttributes: attributes, impersonatingUserId: userId || null,
    unsecureConfiguration: unsecure || null, replacementSecureConfiguration: secureReplacement || null,
    expectedVersions: editDetails.data?.expectedVersions ?? (step ? { [plugin.id]: plugin.versionNumber, [step.id]: step.versionNumber } : { [plugin.id]: plugin.versionNumber }),
    impersonatingUserAction: operation === "create" ? (userId ? "set" : "clear")
      : userId === (editDetails.data?.impersonatingUserId ?? "") ? "keep" : userId ? "set" : "clear",
    unsecureConfigurationAction: operation === "create" ? (unsecure ? "set" : "clear")
      : unsecure === (editDetails.data?.unsecureConfiguration ?? "") ? "keep" : unsecure ? "set" : "clear",
  } : null;
  const title = operation === "create" ? "Register step" : "Update step";
  const submit = async () => { if (!draft) return; try { setPreview(await mutations.preflight.mutateAsync({ operation, stepId: step?.id ?? null, draft })); }
    catch (error) { await onMutationFailure(error, { phase: "read", affectedComponentId: step?.id ?? plugin.id, retry: () => void submit() }); } };
  const confirm = async () => { if (!draft || !preview) return; try { const result = await mutations.execute.mutateAsync({ operation, stepId: step?.id ?? null, draft, token: preview.plan.token });
      await onMutationResult(result, result.step?.id ?? step?.id ?? plugin.id); }
    catch (error) { await onMutationFailure(error, { phase: "execute", affectedComponentId: step?.id ?? plugin.id }); } };
  return <>
    <Modal open title={title} onClose={onClose} widthClass="max-w-xl"><div role="dialog" aria-label={title} className="flex flex-col gap-3">
      {operation === "update" && editDetails.isPending ? <p role="status">Loading current step details…</p> : null}
      {mutations.options.isPending ? <p role="status">Loading step choices…</p> : null}
      {operation === "update" && editDetails.isError ? <div role="alert" className="text-red-300"><p>Unable to load step details.</p><Button type="button" variant="secondary" onClick={() => void editDetails.refetch()}>Retry step details</Button></div> : null}
      {mutations.options.isError ? <div role="alert" className="text-red-300"><p>Unable to load step choices.</p><Button type="button" variant="secondary" onClick={() => void mutations.options.refetch()}>Retry step choices</Button></div> : null}
      {isReadOnly ? <p role="status">This step is managed or not customizable, so it can be inspected but not updated.</p> : null}
      {previewDisabledReason ? <p role="status">{previewDisabledReason}</p> : null}
      <fieldset disabled={!canEdit} className="contents">
      <label className="text-sm">Message<select aria-label="Message" value={selectedMessageId} onChange={event => { setMessageId(event.target.value); setFilterId(""); }} className="w-full bg-[#3c3c3c] p-2">{options?.messages.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="text-sm">Message filter<select aria-label="Message filter" value={selectedFilter?.id ?? ""} onChange={event => setFilterId(event.target.value)} className="w-full bg-[#3c3c3c] p-2">{matchingFilters.map(item => <option key={item.id} value={item.id}>{filterLabel(item)}</option>)}</select></label>
      <div className="grid grid-cols-3 gap-2"><label>Stage<select aria-label="Stage" value={stage} onChange={event => setStage(Number(event.target.value))}><option value={10}>PreValidation</option><option value={20}>PreOperation</option><option value={40}>PostOperation</option></select></label><label>Mode<select aria-label="Mode" value={mode} onChange={event => setMode(Number(event.target.value))}><option value={0}>Synchronous</option>{stage === 40 ? <option value={1}>Asynchronous</option> : null}</select></label><label>Rank<input aria-label="Rank" type="number" value={rank} onChange={event => setRank(Number(event.target.value))} /></label></div>
      <label>Filtering attributes<input aria-label="Filtering attributes" value={attributesText} onChange={event => setAttributesText(event.target.value)} className="w-full bg-[#3c3c3c] p-2" /></label>
      {updateWithoutFilters ? <p role="status" className="text-amber-300">Update steps should select filtering attributes.</p> : null}
      {primaryKeySelected ? <p role="alert" className="text-red-300">The primary key cannot be used as an Update filtering attribute.</p> : null}
      <p className="text-xs text-[#858585]">{step?.secureConfigExists ? "Stored secure configuration exists. " : ""}Stored secure configuration is not displayed.</p>
      <label>Impersonating user<select aria-label="Impersonating user" value={userId} onChange={event => setUserId(event.target.value)} className="w-full bg-[#3c3c3c] p-2"><option value="">Calling user</option>{options?.enabledUsers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Unsecure configuration<textarea aria-label="Unsecure configuration" value={unsecure} onChange={event => setUnsecure(event.target.value)} className="w-full bg-[#3c3c3c] p-2" /></label>
      <label>Replacement secure configuration<input aria-label="Replacement secure configuration" type="password" value={secureReplacement} onChange={event => setSecureReplacement(event.target.value)} className="w-full bg-[#3c3c3c] p-2" /></label>
      </fieldset>
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => void submit()} disabled={!draft || !canEdit || primaryKeySelected || mutations.preflight.isPending}>Preview changes</Button></div>
    </div></Modal>
    {preview ? <Modal open title="Step impact preview" onClose={() => setPreview(null)} widthClass="max-w-lg"><div role="dialog" aria-label="Step impact preview" className="flex flex-col gap-3"><p>{preview.after.message} {preview.after.primaryTable}</p><dl>{(preview.plan.changes ?? []).map(item => <div key={item.field}><dt className="font-semibold">{label(item.field)}: {item.field === "secureConfigurationAction" ? display(item.after, "Keep") : `${display(item.before, "New")} → ${display(item.after, "Empty")}`}</dt></div>)}</dl>{preview.plan.warnings.map(item => <p key={item.code} role="status" className="text-amber-300">{item.message}</p>)}{preview.plan.blockers.map(item => <p key={item.code} role="alert" className="text-red-300">{item.message}</p>)}<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setPreview(null)}>Cancel</Button><Button disabled={preview.plan.blockers.length > 0 || mutations.execute.isPending} onClick={() => void confirm()}>Confirm</Button></div></div></Modal> : null}
  </>;
}
function display(value: string | null, fallback: string) {
  if (value === null) return fallback;
  return value === "keep" || value === "set" ? value[0].toUpperCase() + value.slice(1) : value;
}

function label(value: string) {
  if (value === "rank") return "Rank";
  if (value === "secureConfigurationAction") return "Secure configuration";
  return value;
}

function filterLabel(filter: { primaryTable: string; secondaryTable: string | null }) {
  return filter.secondaryTable ? `${filter.primaryTable} · ${filter.secondaryTable}` : filter.primaryTable;
}
