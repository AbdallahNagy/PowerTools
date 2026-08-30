import { useMemo, useState } from "react";
import { Button, Modal } from "../../../../shared/ui";
import { useImageMutations, type ImageDraft, type ImageOperation, type ImagePreflight } from "../../api/useImageMutations";
import type { PluginImage, PluginStep } from "../../model/contracts";

interface Props { connectionName: string | null; step: PluginStep; image: PluginImage | null; operation: ImageOperation;
  onClose: () => void; refreshCatalog: () => Promise<unknown>; }
export function ImageDialog({ connectionName, step, image, operation, onClose, refreshCatalog }: Props) {
  const mutations = useImageMutations(connectionName, refreshCatalog);
  const [alias, setAlias] = useState(image?.entityAlias ?? "");
  const [imageType, setImageType] = useState(() => image ? labelType(image.imageTypeLabel) : defaultType(step));
  const [columns, setColumns] = useState(image?.attributes.join(", ") ?? "");
  const [preview, setPreview] = useState<ImagePreflight | null>(null);
  const [typedName, setTypedName] = useState("");
  const attributes = useMemo(() => columns.split(",").map(x => x.trim().toLowerCase()).filter(Boolean), [columns]);
  const allColumns = attributes.includes("*");
  const draft: ImageDraft = { stepId: step.id, imageType, alias, messagePropertyName: "Target", attributes,
    expectedVersions: image ? { [step.id]: step.versionNumber, [image.id]: image.versionNumber } : { [step.id]: step.versionNumber } };
  const title = operation === "create" ? "Register image" : operation === "update" ? "Update image" : "Unregister image";
  const submit = async () => setPreview(await mutations.preflight.mutateAsync({ operation, imageId: image?.id ?? null, draft }));
  const confirm = async () => { if (!preview) return; const result = await mutations.execute.mutateAsync({ operation,
    imageId: image?.id ?? null, draft, token: preview.plan.token, typedName: operation === "unregister" ? typedName : undefined });
    if (result.succeededAndVerified) onClose(); };
  if (operation === "unregister") return <Modal open title={title} onClose={onClose} widthClass="max-w-lg"><div role="dialog" aria-label={title} className="flex flex-col gap-3">
    <p>Deleting this image requires its exact name.</p><label>Type {image?.name} to confirm<input aria-label={`Type ${image?.name} to confirm`} value={typedName} onChange={e => setTypedName(e.target.value)} /></label>
    {!preview ? <Button onClick={() => void submit()}>Preview unregister</Button> : <><Preview preview={preview} /><Button disabled={typedName !== image?.name || preview.plan.blockers.length > 0} onClick={() => void confirm()}>Unregister image</Button></>}
    <Button variant="secondary" onClick={onClose}>Cancel</Button></div></Modal>;
  return <><Modal open title={title} onClose={onClose} widthClass="max-w-xl"><div role="dialog" aria-label={title} className="flex flex-col gap-3">
    <label>Image type<select aria-label="Image type" value={imageType} onChange={e => setImageType(Number(e.target.value))}>{types(step).map(x => <option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
    <label>Image alias<input aria-label="Image alias" value={alias} onChange={e => setAlias(e.target.value)} /></label>
    <label>Message property<input aria-label="Message property" value="Target" readOnly /></label>
    <label>Selected columns<input aria-label="Selected columns" value={columns} onChange={e => setColumns(e.target.value)} /></label>
    {allColumns ? <p role="alert">All columns is not allowed; select explicit columns.</p> : null}
    <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!alias.trim() || attributes.length === 0 || allColumns || mutations.preflight.isPending} onClick={() => void submit()}>Preview changes</Button></div>
  </div></Modal>{preview ? <Modal open title="Image impact preview" onClose={() => setPreview(null)} widthClass="max-w-lg"><div role="dialog" aria-label="Image impact preview" className="flex flex-col gap-3"><Preview preview={preview} /><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setPreview(null)}>Cancel</Button><Button disabled={preview.plan.blockers.length > 0 || mutations.execute.isPending} onClick={() => void confirm()}>Confirm</Button></div></div></Modal> : null}</>;
}
function Preview({ preview }: { preview: ImagePreflight }) { return <>{preview.plan.changes.map(x => <p key={x.field}>{label(x.field)}: {x.before ?? "New"} → {x.after ?? "Empty"}</p>)}{preview.plan.warnings.map(x => <p role="status" key={x.code}>{x.message}</p>)}{preview.plan.blockers.map(x => <p role="alert" key={x.code}>{x.message}</p>)}</>; }
function label(value: string) { return value === "attributes" ? "Attributes" : value; }
function labelType(value: string) { return value.toLowerCase().includes("both") ? 2 : value.toLowerCase().includes("post") ? 1 : 0; }
function defaultType(step: PluginStep) { return step.messageLabel.toLowerCase() === "create" ? 1 : 0; }
function types(step: PluginStep) { const message = step.messageLabel.toLowerCase(); if (message === "create") return [{ value: 1, label: "Post image" }]; if (message === "delete") return [{ value: 0, label: "Pre image" }];
  return step.stage === 40 ? [{ value: 0, label: "Pre image" }, { value: 1, label: "Post image" }, { value: 2, label: "Pre and post images" }] : [{ value: 0, label: "Pre image" }]; }
