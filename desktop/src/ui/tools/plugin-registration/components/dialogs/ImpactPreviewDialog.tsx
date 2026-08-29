import { Button, Modal } from "../../../../shared/ui";
import type { AssemblyMutationPreflight } from "../../api/useAssemblyMutations";

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
          <dt className="text-[#858585]">Before</dt><dd>{preflight.impact.previousIdentity?.version ?? "Not registered"}</dd>
          <dt className="text-[#858585]">After</dt><dd>{preflight.impact.currentIdentity.version}</dd>
          <dt className="text-[#858585]">SHA-256</dt><dd className="break-all">{preflight.draft.inspection.sha256}</dd>
        </dl>
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
