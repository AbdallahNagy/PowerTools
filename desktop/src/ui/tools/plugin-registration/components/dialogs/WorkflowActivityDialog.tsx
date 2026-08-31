import { useState } from "react";

import { Button, Modal } from "../../../../shared/ui";
import { type WorkflowActivityDraft, type WorkflowActivityPreflight, useWorkflowActivityMutations } from "../../api/useWorkflowActivityMutations";
import type { PluginHandler } from "../../model/contracts";
import { MutationImpactPreviewDialog } from "./ImpactPreviewDialog";

export function WorkflowActivityDialog({ connectionName, activity, onClose, refreshCatalog }: { connectionName: string | null; activity: PluginHandler & { kind: "workflowActivity" }; onClose: () => void; refreshCatalog: () => Promise<unknown> }) {
  const mutations = useWorkflowActivityMutations(connectionName, refreshCatalog);
  const [name, setName] = useState(activity.name);
  const [friendlyName, setFriendlyName] = useState(activity.friendlyName ?? "");
  const [group, setGroup] = useState(activity.workflowActivityGroupName ?? "");
  const [description, setDescription] = useState(activity.description ?? "");
  const [preview, setPreview] = useState<WorkflowActivityPreflight | null>(null);
  const draft: WorkflowActivityDraft = { workflowActivityId: activity.id, name, friendlyName: friendlyName || null,
    workflowActivityGroupName: group || null, description: description || null, expectedVersions: { [activity.id]: activity.versionNumber } };
  const submit = async () => setPreview(await mutations.preflight.mutateAsync(draft));
  const confirm = async () => { if (!preview) return; const result = await mutations.execute.mutateAsync({ draft, token: preview.plan.token }); if (result.succeededAndVerified) onClose(); };
  return <>
    <Modal open title="Update workflow activity" onClose={onClose} widthClass="max-w-lg"><div role="dialog" aria-label="Update workflow activity" className="flex flex-col gap-3">
      <p className="text-sm text-[#858585]">Registration metadata only. Workflow definitions and arguments are read-only.</p>
      <label>Name<input aria-label="Name" value={name} onChange={event => setName(event.target.value)} className="w-full bg-[#3c3c3c] p-2" /></label>
      <label>Friendly name<input aria-label="Friendly name" value={friendlyName} onChange={event => setFriendlyName(event.target.value)} className="w-full bg-[#3c3c3c] p-2" /></label>
      <label>Workflow activity group name<input aria-label="Workflow activity group name" value={group} onChange={event => setGroup(event.target.value)} className="w-full bg-[#3c3c3c] p-2" /></label>
      <label>Description<textarea aria-label="Description" value={description} onChange={event => setDescription(event.target.value)} className="w-full bg-[#3c3c3c] p-2" /></label>
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!name.trim() || mutations.preflight.isPending} onClick={() => void submit()}>Preview changes</Button></div>
    </div></Modal>
    {preview ? <MutationImpactPreviewDialog title="Workflow activity impact preview" environment={connectionName ?? ""} component={activity.typeName} changes={preview.plan.changes} warnings={preview.plan.warnings} blockers={preview.plan.blockers} confirmation={preview.plan.confirmation.message} executing={mutations.execute.isPending} onCancel={() => setPreview(null)} onConfirm={() => void confirm()} /> : null}
  </>;
}
