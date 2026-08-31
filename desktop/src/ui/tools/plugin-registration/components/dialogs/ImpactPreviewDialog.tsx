import { Button, Modal } from "../../../../shared/ui";
import type { AssemblyMutationPreflight } from "../../api/useAssemblyMutations";
import { TypedNameConfirmation } from "./TypedNameConfirmationDialog";

interface ImpactPreviewDialogProps {
  preflight: AssemblyMutationPreflight | null;
  executing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ImpactPreviewDialog({ preflight, executing, onCancel, onConfirm }: ImpactPreviewDialogProps) {
  if (!preflight) return null;
  const blockers = preflight.impact.blockers;
  return (
    <Modal open title="Assembly impact preview" onClose={onCancel} widthClass="max-w-xl">
      <div role="dialog" aria-label="Assembly impact preview" className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-[#858585]">Before identity</dt><dd>{identity(preflight.impact.previousIdentity)}</dd>
          <dt className="text-[#858585]">After identity</dt><dd>{identity(preflight.impact.currentIdentity)}</dd>
          <dt className="text-[#858585]">Before SHA-256</dt><dd className="break-all">{preflight.impact.previousSha256 ?? "Unavailable"}</dd>
          <dt className="text-[#858585]">After SHA-256</dt><dd className="break-all">{preflight.impact.currentSha256}</dd>
          <dt className="text-[#858585]">Before size</dt><dd>{size(preflight.impact.previousSize)}</dd>
          <dt className="text-[#858585]">After size</dt><dd>{size(preflight.impact.currentSize)}</dd>
          <dt className="text-[#858585]">Storage / isolation</dt><dd>{preflight.impact.previousSourceType ?? "New"} / {preflight.impact.previousIsolationMode ?? "New"} → {preflight.impact.currentSourceType} / {preflight.impact.currentIsolationMode}</dd>
          <dt className="text-[#858585]">Confirmation</dt><dd>{preflight.plan.confirmation.level}: {preflight.plan.confirmation.message}</dd>
        </dl>
        <ImpactList label="Plug-ins" values={[...preflight.impact.addedPlugins.map((value) => `Added: ${value}`), ...preflight.impact.unchangedPlugins.map((value) => `Unchanged: ${value}`), ...preflight.impact.changedPlugins.map((value) => `Changed: ${value}`), ...preflight.impact.removedPlugins.map((value) => `Removed: ${value}`)]} />
        <ImpactList label="Workflow activities" values={[...preflight.impact.addedWorkflowActivities.map((value) => `Added: ${value}`), ...preflight.impact.changedWorkflowActivities.map((value) => `Changed: ${value}`), ...preflight.impact.removedWorkflowActivities.map((value) => `Removed: ${value}`), ...preflight.impact.workflowContractDifferences.map((value) => `${value.typeName}.${value.argumentName}: ${value.change}${value.isBreaking ? " (breaking)" : ""}`)]} />
        <ImpactList label="Owned steps and images" values={preflight.impact.ownedStepsAndImages} />
        <ImpactList label="Dependencies" values={preflight.impact.dependencies} />
        {preflight.impact.warnings.map((warning) => <p key={warning.code} role="status" className="text-amber-300">{warning.message}</p>)}
        {blockers.map((blocker) => <p key={blocker.code} role="alert" className="text-red-300">{blocker.message}</p>)}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button type="button" onClick={onConfirm} disabled={blockers.length > 0 || executing}>
            {executing ? "Registering…" : "Confirm"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function identity(value: AssemblyMutationPreflight["impact"]["previousIdentity"]) {
  return value ? `${value.name}, ${value.version}, ${value.culture}, ${value.publicKeyToken}` : "Not registered";
}

function size(value: number | null) { return value === null ? "Unavailable" : `${value} bytes`; }

function ImpactList({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return <section aria-label={label}><h4 className="text-sm font-semibold">{label}</h4><ul className="list-disc pl-5 text-sm">{values.map((value) => <li key={value}>{value}</li>)}</ul></section>;
}

export function MutationImpactPreviewDialog({ title, environment, component, changes, warnings, blockers, confirmation, executing, confirmDisabled, typedNameConfirmation, onCancel, onConfirm }: {
  title: string; environment: string; component: string; changes: { field: string; before: string | null; after: string | null }[];
  warnings: { code: string; message: string }[]; blockers: { code: string; message: string }[]; confirmation: string;
  executing: boolean; confirmDisabled?: boolean; typedNameConfirmation?: { componentLabel: string; requiredName: string; value: string; onChange: (value: string) => void };
  onCancel: () => void; onConfirm: () => void;
}) {
  return <Modal open title={title} onClose={onCancel} widthClass="max-w-lg"><div role="dialog" aria-label={title} className="flex flex-col gap-3">
    <p>{environment} · {component}</p><p>{confirmation}</p>
    {changes.map(item => <p key={item.field}>{item.field === "attributes" ? "Attributes" : item.field}: {item.before ?? "New"} → {item.after ?? "Empty"}</p>)}
    {warnings.map(item => <p role="status" key={item.code}>{item.message}</p>)}{blockers.map(item => <p role="alert" key={item.code}>{item.message}</p>)}
    {typedNameConfirmation ? <TypedNameConfirmation {...typedNameConfirmation} /> : null}
    <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button disabled={blockers.length > 0 || executing || confirmDisabled} onClick={onConfirm}>Confirm</Button></div>
  </div></Modal>;
}
