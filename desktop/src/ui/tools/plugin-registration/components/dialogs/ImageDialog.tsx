import { useMemo, useState } from "react";
import { Button, Modal } from "../../../../shared/ui";
import { useImageMutations, type ImageDraft, type ImageOperation, type ImagePreflight } from "../../api/useImageMutations";
import type { PluginImage, PluginStep } from "../../model/contracts";
import type { ReportMutationFailure, ReportMutationResult } from "../../model/pluginRegistrationError";
import { MutationImpactPreviewDialog } from "./ImpactPreviewDialog";

interface Props { connectionName: string | null; step: PluginStep; image: PluginImage | null; operation: ImageOperation;
  onClose: () => void; refreshCatalog: () => Promise<unknown>; onMutationResult: ReportMutationResult; onMutationFailure: ReportMutationFailure; }
export function ImageDialog({ connectionName, step, image, operation, onClose, onMutationResult, onMutationFailure }: Props) {
  const mutations = useImageMutations(connectionName);
  const [alias, setAlias] = useState(image?.entityAlias ?? image?.name ?? "");
  const [imageType, setImageType] = useState(() => image ? labelType(image.imageTypeLabel) : defaultType(step));
  const [columns, setColumns] = useState(image?.attributes.join(", ") ?? "");
  const [preview, setPreview] = useState<ImagePreflight | null>(null);
  const [typedName, setTypedName] = useState("");
  const attributes = useMemo(() => columns.split(",").map(x => x.trim().toLowerCase()).filter(Boolean), [columns]);
  const allColumns = attributes.includes("*");
  const draft: ImageDraft = { stepId: step.id, imageType, alias, messagePropertyName: "Target", attributes,
    expectedVersions: image ? { [step.id]: step.versionNumber, [image.id]: image.versionNumber } : { [step.id]: step.versionNumber } };
  const title = operation === "create" ? "Register image" : operation === "update" ? "Update image" : "Unregister image";
  const submit = async () => { try { setPreview(await mutations.preflight.mutateAsync({ operation, imageId: image?.id ?? null, draft })); }
    catch (error) { await onMutationFailure(error, { phase: "read", affectedComponentId: image?.id ?? step.id, retry: () => void submit() }); } };
  const confirm = async () => { if (!preview) return; try { const result = await mutations.execute.mutateAsync({ operation,
      imageId: image?.id ?? null, draft, token: preview.plan.token, typedName: operation === "unregister" ? typedName : undefined });
      await onMutationResult(result, result.image?.id ?? image?.id ?? step.id); }
    catch (error) { await onMutationFailure(error, { phase: "execute", affectedComponentId: image?.id ?? step.id }); } };
  if (operation === "unregister") return <>{!preview ? <Modal open title={title} onClose={onClose} widthClass="max-w-lg"><div role="dialog" aria-label={title} className="flex flex-col gap-3">
    <Button onClick={() => void submit()}>Preview unregister</Button>
    <Button variant="secondary" onClick={onClose}>Cancel</Button></div></Modal> : null}{preview ? <MutationImpactPreviewDialog title="Image impact preview"
      environment={connectionName ?? "No environment"} component={image?.name ?? alias} changes={preview.plan.changes}
      warnings={preview.plan.warnings} blockers={preview.plan.blockers} confirmation={preview.plan.confirmation.message}
      executing={mutations.execute.isPending} confirmDisabled={typedName !== image?.name}
      typedNameConfirmation={{ componentLabel: "image", requiredName: image?.name ?? "", value: typedName, onChange: setTypedName }}
      onCancel={() => setPreview(null)} onConfirm={() => void confirm()} /> : null}</>;
  return <><Modal open title={title} onClose={onClose} widthClass="max-w-xl"><div role="dialog" aria-label={title} className="flex flex-col gap-3">
    <label>Image type<select aria-label="Image type" value={imageType} onChange={e => setImageType(Number(e.target.value))}>{types(step).map(x => <option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
    <label>Image alias<input aria-label="Image alias" value={alias} onChange={e => setAlias(e.target.value)} /></label>
    <label>Message property<input aria-label="Message property" value="Target" readOnly /></label>
    <label>Selected columns<input aria-label="Selected columns" value={columns} onChange={e => setColumns(e.target.value)} /></label>
    {allColumns ? <p role="alert">All columns is not allowed; select explicit columns.</p> : null}
    <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!alias.trim() || attributes.length === 0 || allColumns || mutations.preflight.isPending} onClick={() => void submit()}>Preview changes</Button></div>
  </div></Modal>{preview ? <MutationImpactPreviewDialog title="Image impact preview" environment={connectionName ?? "No environment"} component={image?.name ?? alias}
    changes={preview.plan.changes} warnings={preview.plan.warnings} blockers={preview.plan.blockers} confirmation={preview.plan.confirmation.message}
    executing={mutations.execute.isPending} onCancel={() => setPreview(null)} onConfirm={() => void confirm()} /> : null}</>;
}
function labelType(value: string) { return value.toLowerCase().includes("both") ? 2 : value.toLowerCase().includes("post") ? 1 : 0; }
function defaultType(step: PluginStep) { return step.messageLabel.toLowerCase() === "create" ? 1 : 0; }
function types(step: PluginStep) { const message = step.messageLabel.toLowerCase(); if (message === "create") return [{ value: 1, label: "Post image" }]; if (message === "delete") return [{ value: 0, label: "Pre image" }];
  return step.stage === 40 ? [{ value: 0, label: "Pre image" }, { value: 1, label: "Post image" }, { value: 2, label: "Pre and post images" }] : [{ value: 0, label: "Pre image" }]; }
