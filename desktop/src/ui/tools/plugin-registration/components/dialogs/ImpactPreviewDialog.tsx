import { Button, Modal } from "../../../../shared/ui";
import { TypedNameConfirmation } from "./TypedNameConfirmationDialog";

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
