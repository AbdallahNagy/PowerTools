import { useEffect, useMemo, useState } from "react";

import { Button, Modal } from "../../../../shared/ui";
import { type AssemblyInspection, type AssemblyMutationPreflight, useAssemblyMutations } from "../../api/useAssemblyMutations";
import type { PluginAssembly } from "../../model/contracts";
import { ImpactPreviewDialog } from "./ImpactPreviewDialog";

interface AssemblyDialogProps {
  assembly: PluginAssembly | null;
  connectionName: string | null;
  onClose: () => void;
  onVerified: (assembly: PluginAssembly) => void;
  refreshCatalog: () => Promise<unknown>;
}

export function AssemblyDialog({ assembly, connectionName, onClose, onVerified, refreshCatalog }: AssemblyDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<AssemblyInspection | null>(null);
  const [preflight, setPreflight] = useState<AssemblyMutationPreflight | null>(null);
  const [hashMismatch, setHashMismatch] = useState(false);
  const mutations = useAssemblyMutations(connectionName, refreshCatalog, onVerified);
  const operation = assembly ? "update" : "register";
  const draft = useMemo(() => !file || !inspection ? null : ({
    fileName: file.name, operation, assemblyId: assembly?.id ?? null,
    requestedIsolationMode: 2, requestedSourceType: 0,
    expectedAssemblyVersionNumber: assembly?.versionNumber ?? null,
    expectedHandlerVersionNumbers: Object.fromEntries((assembly?.handlers ?? []).map((handler) => [handler.id, handler.versionNumber])),
    inspection,
  } as const), [assembly, file, inspection, operation]);

  useEffect(() => () => { setFile(null); setInspection(null); }, []);
  const close = () => { setFile(null); setInspection(null); setPreflight(null); setHashMismatch(false); onClose(); };
  const selectFile = async (selected: File | null) => {
    setFile(selected); setInspection(null); setPreflight(null); setHashMismatch(false);
    if (!selected) return;
    const result = await mutations.analyze.mutateAsync(selected);
    setInspection(result);
  };
  const preview = async () => {
    if (!file || !draft || !inspection) return;
    const result = await mutations.preflight.mutateAsync({ file, draft });
    if (result.draft.inspection.sha256 !== inspection.sha256) {
      setHashMismatch(true);
      return;
    }
    setPreflight(result);
  };
  const confirm = async () => {
    if (!file || !draft || !preflight) return;
    const result = await mutations.execute.mutateAsync({ file, draft, token: preflight.plan.token });
    if (result.succeededAndVerified) close();
  };
  const title = assembly ? "Update assembly" : "Register assembly";
  return <>
    <Modal open title={title} onClose={close} widthClass="max-w-lg">
      <div role="dialog" aria-label={title} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">Assembly DLL
          <input aria-label="Assembly DLL" type="file" accept=".dll" onChange={(event) => void selectFile(event.target.files?.[0] ?? null)} />
        </label>
        <p className="text-sm text-[#858585]">Isolation: Sandbox · Storage: Database</p>
        {inspection ? <p role="status" className="text-sm">{inspection.identity.name} {inspection.identity.version}</p> : null}
        {mutations.analyze.error || mutations.preflight.error ? <p role="alert">The assembly could not be analyzed.</p> : null}
        {hashMismatch ? <p role="alert">The uploaded DLL changed after analysis. Select it again and create a new preview.</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={close}>Cancel</Button>
          <Button type="button" onClick={() => void preview()} disabled={!draft || mutations.preflight.isPending}>Preview impact</Button>
        </div>
      </div>
    </Modal>
    <ImpactPreviewDialog preflight={preflight} executing={mutations.execute.isPending} onCancel={() => setPreflight(null)} onConfirm={() => void confirm()} />
  </>;
}
