import { useEffect, useMemo, useState } from "react";

import { Button, Modal } from "../../../../shared/ui";
import { type AssemblyInspection, type AssemblyMutationPreflight, useAssemblyMutations } from "../../api/useAssemblyMutations";
import type { PluginAssembly } from "../../model/contracts";
import type { ReportMutationFailure, ReportMutationResult } from "../../model/pluginRegistrationError";
import { ImpactPreviewDialog } from "./ImpactPreviewDialog";

interface AssemblyDialogProps {
  assembly: PluginAssembly | null;
  connectionName: string | null;
  onClose: () => void;
  onVerified: (assembly: PluginAssembly) => void;
  onMutationResult: ReportMutationResult;
  onMutationFailure: ReportMutationFailure;
}

export function AssemblyDialog({ assembly, connectionName, onClose, onVerified, onMutationResult, onMutationFailure }: AssemblyDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<AssemblyInspection | null>(null);
  const [preflight, setPreflight] = useState<AssemblyMutationPreflight | null>(null);
  const [hashMismatch, setHashMismatch] = useState(false);
  const mutations = useAssemblyMutations(connectionName);
  const operation = assembly ? "update" : "register";
  const diagnostics = inspection?.diagnostics ?? [];
  const hasCompatibilityError = diagnostics.some(isCompatibilityError);
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
    try {
      const result = await mutations.analyze.mutateAsync(selected);
      setInspection(result);
    } catch (error) {
      await onMutationFailure(error, { phase: "read", affectedComponentId: assembly?.id, retry: () => void selectFile(selected) });
    }
  };
  const preview = async () => {
    if (!file || !draft || !inspection) return;
    try {
      const result = await mutations.preflight.mutateAsync({ file, draft });
      if (result.draft.inspection.sha256 !== inspection.sha256) {
        setHashMismatch(true);
        return;
      }
      setPreflight(result);
    } catch (error) {
      await onMutationFailure(error, { phase: "read", affectedComponentId: assembly?.id, retry: () => void preview() });
    }
  };
  const confirm = async () => {
    if (!file || !draft || !preflight) return;
    try {
      const result = await mutations.execute.mutateAsync({ file, draft, token: preflight.plan.token });
      if (result.assembly) onVerified(result.assembly);
      await onMutationResult(result, result.assembly?.id ?? assembly?.id);
    } catch (error) {
      await onMutationFailure(error, { phase: "execute", affectedComponentId: assembly?.id });
    }
  };
  const title = assembly ? "Update assembly" : "Register assembly";
  return <>
    <Modal open title={title} onClose={close} widthClass="max-w-lg">
      <div role="dialog" aria-label={title} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Upload assembly DLL</span>
          <label className="relative flex cursor-pointer items-center gap-3 rounded-sm border border-dashed border-[#555] bg-[#2a2d2e] px-3 py-3 text-sm transition-colors hover:border-[#007fd4] focus-within:border-[#007fd4]">
            <input className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Assembly DLL" type="file" accept=".dll" onChange={(event) => void selectFile(event.target.files?.[0] ?? null)} />
            <span className="rounded-sm bg-[#007fd4] px-3 py-1.5 font-medium text-white">Choose DLL file</span>
            <span className="truncate text-[#cccccc]">{file?.name ?? "No file selected"}</span>
          </label>
          <p className="text-xs text-[#858585]">DLL files only</p>
        </div>
        <p className="text-sm text-[#858585]">Isolation: Sandbox · Storage: Database</p>
        {inspection ? <p role="status" className="text-sm">{inspection.identity.name} {inspection.identity.version}</p> : null}
        {diagnostics.map((diagnostic) => (
          <div key={diagnostic.code} role={isCompatibilityError(diagnostic) ? "alert" : "status"} className="text-sm">
            <p>{safeCompatibilityMessage(diagnostic.code)}</p>
            {isCompatibilityError(diagnostic) ? <p className="text-xs text-[#858585]">Select a compatible DLL and analyze it again.</p> : null}
          </div>
        ))}
        {mutations.analyze.error || mutations.preflight.error ? <p role="alert">The assembly could not be analyzed.</p> : null}
        {hashMismatch ? <p role="alert">The uploaded DLL changed after analysis. Select it again and create a new preview.</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={close}>Cancel</Button>
          <Button type="button" onClick={() => void preview()} disabled={!draft || hasCompatibilityError || mutations.preflight.isPending}>Preview impact</Button>
        </div>
      </div>
    </Modal>
    <ImpactPreviewDialog preflight={preflight} executing={mutations.execute.isPending} onCancel={() => setPreflight(null)} onConfirm={() => void confirm()} />
  </>;
}

function isCompatibilityError(diagnostic: AssemblyInspection["diagnostics"][number]): boolean {
  return diagnostic.severity === "Error" || diagnostic.severity === 1;
}

function safeCompatibilityMessage(code: string): string {
  switch (code) {
    case "target_framework_unsupported":
      return "The assembly target framework is not supported. Build it for .NET Framework 4.6.2 and select the rebuilt DLL.";
    case "runtime_version_unsupported":
      return "The assembly metadata runtime is not supported. Build it for the supported .NET Framework runtime and select the rebuilt DLL.";
    case "target_framework_unknown":
      return "The assembly does not declare a target framework. Confirm that it targets .NET Framework 4.6.2 before registering it.";
    default:
      return "The assembly has a compatibility issue. Select a compatible DLL and analyze it again.";
  }
}
