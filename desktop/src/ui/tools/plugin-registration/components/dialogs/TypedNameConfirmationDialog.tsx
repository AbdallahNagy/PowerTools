import { useEffect, useMemo, useState } from "react";

import { Button, Modal } from "../../../../shared/ui";
import { useStepMutations, type StepDraft, type StepOperation } from "../../api/useStepMutations";
import type { PluginHandler, PluginStep } from "../../model/contracts";

interface Props { connectionName: string | null; plugin: PluginHandler & { kind: "plugin" }; step: PluginStep;
  operation: "enable" | "disable" | "unregister"; onClose: () => void; refreshCatalog: () => Promise<unknown>; }
export function TypedNameConfirmationDialog({ connectionName, plugin, step, operation, onClose, refreshCatalog }: Props) {
  const mutations = useStepMutations(connectionName, refreshCatalog);
  const [typedName, setTypedName] = useState("");
  const options = mutations.options.data;
  const message = options?.messages.find(item => item.name === step.messageLabel);
  const filter = options?.filters.find(item => item.messageId === message?.id && item.primaryTable.toLowerCase() === step.primaryTableLabel?.toLowerCase());
  const draft = useMemo<StepDraft | null>(() => message && filter ? ({ pluginTypeId: plugin.id, sdkMessageId: message.id,
    sdkMessageFilterId: filter.id, primaryTable: filter.primaryTable, secondaryTable: filter.secondaryTable,
    stage: step.stage, mode: step.mode, rank: step.rank, filteringAttributes: [], impersonatingUserId: null,
    unsecureConfiguration: null, replacementSecureConfiguration: null,
    impersonatingUserAction: "keep", unsecureConfigurationAction: "keep",
    expectedVersions: { [plugin.id]: plugin.versionNumber, [step.id]: step.versionNumber } }) : null,
  [filter, message, plugin.id, plugin.versionNumber, step]);
  useEffect(() => { if (draft && !mutations.preflight.data && !mutations.preflight.isPending) void mutations.preflight.mutateAsync({ operation, stepId: step.id, draft }); }, [draft, mutations.preflight, operation, step.id]);
  const title = operation === "unregister" ? "Unregister step" : `${operation === "enable" ? "Enable" : "Disable"} step`;
  const execute = async () => { const plan = mutations.preflight.data; if (!draft || !plan) return; const result = await mutations.execute.mutateAsync({ operation: operation as StepOperation, stepId: step.id, draft, token: plan.plan.token, typedName: operation === "unregister" ? typedName : undefined }); if (result.succeededAndVerified) onClose(); };
  const blocked = !mutations.preflight.data || mutations.preflight.data.plan.blockers.length > 0 || (operation === "unregister" && typedName !== step.name);
  return <Modal open title={title} onClose={onClose} widthClass="max-w-lg"><div role="dialog" aria-label={title} className="flex flex-col gap-3">
    {operation === "unregister" ? <TypedNameConfirmation componentLabel="step" requiredName={step.name} value={typedName} onChange={setTypedName} /> : <p>{connectionName}: {step.messageLabel} · {step.primaryTableLabel} · {step.stageLabel}. Execution is {operation === "enable" ? "starting" : "stopping"}.</p>}
    {mutations.preflight.data?.plan.blockers.map(item => <p role="alert" key={item.code}>{item.message}</p>)}
    <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={blocked || mutations.execute.isPending} onClick={() => void execute()}>{title}</Button></div>
  </div></Modal>;
}

export function TypedNameConfirmation({ componentLabel, requiredName, value, onChange }: { componentLabel: string; requiredName: string; value: string; onChange: (value: string) => void }) {
  return <><p>Deleting this {componentLabel} requires its exact name.</p><label>Type {requiredName} to confirm<input aria-label={`Type ${requiredName} to confirm`} value={value} onChange={event => onChange(event.target.value)} className="w-full bg-[#3c3c3c] p-2" /></label></>;
}
