import { useState } from "react";
import { Button, Modal } from "../../../../shared/ui";

type TargetKind = "assembly" | "plugin" | "workflowActivity";

export function CascadeConfirmationDialog({ open, connectionName, targetKind, assemblyName, handlerClassName, impact, blockers,
  executing, onCancel, onConfirm }: { open: boolean; connectionName: string; targetKind: TargetKind; assemblyName: string | null;
  handlerClassName: string | null; impact: { handlers: number; steps: number; images: number; enabledSteps: number; dependencies: string[]; items?: string[] };
  blockers: { code: string; message: string }[]; executing: boolean; onCancel: () => void; onConfirm: (typedName: string, acknowledged: boolean) => void; }) {
  const [typedName, setTypedName] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const requiredName = targetKind === "assembly" ? assemblyName ?? "" : handlerClassName ?? "";
  const blocked = blockers.length > 0 || typedName !== requiredName || targetKind === "assembly" && !acknowledged;
  const target = targetKind === "assembly" ? "assembly" : targetKind === "workflowActivity" ? "workflow activity" : "plug-in";
  const label = `Delete ${target}, ${impact.handlers} ${plural(impact.handlers, "handler")}, ${impact.steps} ${plural(impact.steps, "step")}, and ${impact.images} ${plural(impact.images, "image")}`;
  return <Modal open={open} title={`Unregister ${target}`} onClose={onCancel} widthClass="max-w-xl"><div role="dialog" aria-label={`Unregister ${target}`} className="flex flex-col gap-3">
    <p>{connectionName}: this transaction removes only the registration components listed below.</p>
    <p>{impact.handlers} handlers · {impact.steps} steps ({impact.enabledSteps} enabled) · {impact.images} images</p>
    {impact.items && impact.items.length > 0 ? <section aria-label="Affected registration components"><h3>Affected registration components</h3><ul>{impact.items.map(value => <li key={value}>{value}</li>)}</ul></section> : null}
    {impact.dependencies.length > 0 ? <section aria-label="External dependencies"><h3>External dependencies</h3><ul>{impact.dependencies.map(value => <li key={value}>{value}</li>)}</ul></section> : null}
    {blockers.length > 0 ? <section role="alert"><h3>Deletion blocked</h3><ul>{blockers.map(value => <li key={value.code}>{value.message}</li>)}</ul></section> : null}
    {targetKind === "assembly" ? <label><input type="checkbox" aria-label="Acknowledge assembly unregister" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} /> I understand this cannot be undone.</label> : null}
    <label>Type {requiredName} to confirm<input aria-label={`Type ${requiredName} to confirm`} value={typedName} onChange={event => setTypedName(event.target.value)} /></label>
    <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button disabled={blocked || executing} onClick={() => onConfirm(typedName, acknowledged)}>{label}</Button></div>
  </div></Modal>;
}

function plural(value: number, word: string) { return value === 1 ? word : `${word}s`; }
