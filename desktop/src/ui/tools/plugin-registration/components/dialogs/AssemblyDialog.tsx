import { useEffect, useMemo, useRef, useState } from "react";

import { Button, Modal, Spinner } from "../../../../shared/ui";
import { type AssemblyInspection, type AssemblyMutationPreflight, useAssemblyMutations } from "../../api/useAssemblyMutations";
import { buildAssemblyImpactTree } from "../../model/assemblyImpactTree";
import type { PluginAssembly } from "../../model/contracts";
import type { ReportMutationFailure, ReportMutationResult } from "../../model/pluginRegistrationError";
interface AssemblyDialogProps {
  assembly: PluginAssembly | null;
  connectionName: string | null;
  onPremisesAssemblyOptions: boolean;
  onClose: () => void;
  onVerified: (assembly: PluginAssembly) => void;
  onMutationResult: ReportMutationResult;
  onMutationFailure: ReportMutationFailure;
}

const SANDBOX = 2;
const NONE = 1;
const DATABASE = 0;
const DISK = 1;

export function AssemblyDialog({
  assembly, connectionName, onPremisesAssemblyOptions, onClose, onVerified, onMutationResult, onMutationFailure,
}: AssemblyDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<AssemblyInspection | null>(null);
  const [preflight, setPreflight] = useState<AssemblyMutationPreflight | null>(null);
  const [hashMismatch, setHashMismatch] = useState(false);
  const [isolationMode, setIsolationMode] = useState(assembly?.isolationMode ?? SANDBOX);
  const [sourceType, setSourceType] = useState(assembly?.sourceType ?? DATABASE);
  const mutations = useAssemblyMutations(connectionName);
  const operation = assembly ? "update" : "register";
  const diagnostics = inspection?.diagnostics ?? [];
  const hasCompatibilityError = diagnostics.some(isCompatibilityError);
  const canEditOptions = onPremisesAssemblyOptions && !(assembly && (assembly.isManaged || !assembly.isCustomizable));
  const requestedIsolationMode = canEditOptions ? isolationMode : SANDBOX;
  const requestedSourceType = canEditOptions ? sourceType : DATABASE;
  const draft = useMemo(() => !file || !inspection ? null : ({
    fileName: file.name, operation, assemblyId: assembly?.id ?? null,
    requestedIsolationMode, requestedSourceType,
    expectedAssemblyVersionNumber: assembly?.versionNumber ?? null,
    expectedHandlerVersionNumbers: Object.fromEntries((assembly?.handlers ?? []).map((handler) => [handler.id, handler.versionNumber])),
    inspection,
  } as const), [assembly, file, inspection, operation, requestedIsolationMode, requestedSourceType]);
  const impactTree = preflight ? buildAssemblyImpactTree(preflight.impact) : [];
  const analyzing = mutations.analyze.isPending;
  const previewing = mutations.preflight.isPending;
  const preflightMutate = mutations.preflight.mutateAsync;
  const onFailure = useRef(onMutationFailure);
  onFailure.current = onMutationFailure;

  useEffect(() => () => { setFile(null); setInspection(null); }, []);

  useEffect(() => {
    if (!file || !draft || !inspection || hasCompatibilityError) return;
    let cancelled = false;
    const run = async () => {
      try {
        const result = await preflightMutate({ file, draft });
        if (cancelled) return;
        if (result.draft.inspection.sha256 !== inspection.sha256) {
          setHashMismatch(true);
          setPreflight(null);
          return;
        }
        setHashMismatch(false);
        setPreflight(result);
      } catch (error) {
        if (cancelled) return;
        setPreflight(null);
        await onFailure.current(error, { phase: "read", affectedComponentId: assembly?.id });
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [assembly?.id, draft, file, hasCompatibilityError, inspection, preflightMutate]);

  const close = () => { setFile(null); setInspection(null); setPreflight(null); setHashMismatch(false); onClose(); };
  const selectFile = async (selected: File | null) => {
    setFile(selected); setInspection(null); setPreflight(null); setHashMismatch(false);
    if (!selected) return;
    try {
      const result = await mutations.analyze.mutateAsync(selected);
      setInspection(result);
    } catch (error) {
      await onMutationFailure(error, { phase: "read", affectedComponentId: assembly?.id });
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
  const submitLabel = assembly ? "Update" : "Register";
  const blockers = preflight?.impact.blockers ?? [];
  return (
    <Modal open title={title} onClose={close} widthClass="max-w-xl">
      <div role="dialog" aria-label={title} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-xs tracking-wider text-[#858585]">Upload assembly DLL</span>
          <label className="relative flex cursor-pointer items-center gap-3 rounded-sm border border-dashed border-[#555] bg-[var(--color-bg-light)] px-3 py-3 text-sm transition-colors hover:border-[var(--color-primary)] focus-within:border-[var(--color-primary)]">
            <input className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Assembly DLL" type="file" accept=".dll" onChange={(event) => void selectFile(event.target.files?.[0] ?? null)} />
            <span className="rounded-sm bg-[var(--color-primary)] px-3 py-1.5 font-medium text-[var(--color-text-white)]">Choose DLL file</span>
            <span className="truncate text-[var(--color-text-gray)]">{file?.name ?? "No file selected"}</span>
          </label>
          <p className="text-xs text-[#858585]">DLL files only</p>
        </div>

        <fieldset disabled={!canEditOptions} className="flex flex-col gap-2">
          <legend className="text-xs tracking-wider text-[#858585]">Isolation mode</legend>
          <label className="flex items-center gap-2 text-sm text-[var(--color-text-gray)]">
            <input type="radio" name="isolation-mode" aria-label="Sandbox" checked={isolationMode === SANDBOX} onChange={() => setIsolationMode(SANDBOX)} />
            Sandbox
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--color-text-gray)]">
            <input type="radio" name="isolation-mode" aria-label="None" checked={isolationMode === NONE} onChange={() => setIsolationMode(NONE)} />
            None
          </label>
        </fieldset>

        <fieldset disabled={!canEditOptions} className="flex flex-col gap-2">
          <legend className="text-xs tracking-wider text-[#858585]">Location</legend>
          <label className="flex items-center gap-2 text-sm text-[var(--color-text-gray)]">
            <input type="radio" name="assembly-location" aria-label="Database" checked={sourceType === DATABASE} onChange={() => setSourceType(DATABASE)} />
            Database
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--color-text-gray)]">
            <input type="radio" name="assembly-location" aria-label="Disk" checked={sourceType === DISK} onChange={() => setSourceType(DISK)} />
            Disk
          </label>
        </fieldset>

        {inspection ? <p role="status" className="text-sm text-[var(--color-text-gray)]">{inspection.identity.name} {inspection.identity.version}</p> : null}
        {diagnostics.map((diagnostic) => (
          <div key={diagnostic.code} role={isCompatibilityError(diagnostic) ? "alert" : "status"} className="text-sm">
            <p>{safeCompatibilityMessage(diagnostic.code)}</p>
            {isCompatibilityError(diagnostic) ? <p className="text-xs text-[#858585]">Select a compatible DLL and analyze it again.</p> : null}
          </div>
        ))}
        {mutations.analyze.error || mutations.preflight.error ? <p role="alert">The assembly could not be analyzed.</p> : null}
        {hashMismatch ? <p role="alert">The uploaded DLL changed after analysis. Select it again.</p> : null}

        <section aria-label="Assembly impact" className="flex min-h-[10rem] flex-col overflow-hidden rounded-sm border border-[#3c3c3c] bg-[var(--color-bg-dark)]">
          <div className="border-b border-[#3c3c3c] px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#858585]">
            Impact
          </div>
          <div className="flex-1 min-h-0 overflow-auto py-1">
            {analyzing || previewing ? (
              <div className="flex h-full min-h-28 items-center justify-center gap-2 text-sm text-[#858585]">
                <Spinner />
                {analyzing ? "Analyzing assembly…" : "Loading impact…"}
              </div>
            ) : impactTree.length === 0 ? (
              <p className="flex h-full min-h-28 items-center justify-center px-3 text-sm text-[#858585]">
                {inspection ? "No plug-ins or steps will be added or removed." : "Select a DLL to preview added and removed plug-ins."}
              </p>
            ) : (
              <ImpactTree nodes={impactTree} />
            )}
          </div>
        </section>
        {preflight?.impact.warnings.map((warning) => <p key={warning.code} role="status" className="text-amber-300 text-sm">{warning.message}</p>)}
        {blockers.map((blocker) => <p key={blocker.code} role="alert" className="text-red-300 text-sm">{blocker.message}</p>)}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={close}>Cancel</Button>
          <Button
            type="button"
            onClick={() => void confirm()}
            disabled={!preflight || hasCompatibilityError || blockers.length > 0 || mutations.execute.isPending || hashMismatch}
          >
            {mutations.execute.isPending ? "Registering…" : submitLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ImpactTree({ nodes }: { nodes: ReturnType<typeof buildAssemblyImpactTree> }) {
  return (
    <ul role="tree" aria-label="Added and removed registrations" className="py-1">
      {nodes.map((node) => (
        <ImpactTreeNode key={node.id} node={node} level={1} />
      ))}
    </ul>
  );
}

function ImpactTreeNode({ node, level }: { node: ReturnType<typeof buildAssemblyImpactTree>[number]; level: number }) {
  const prefix = node.change === "added" ? "+" : "−";
  return (
    <li>
      <div
        role="treeitem"
        aria-label={`${node.change} ${node.label}`}
        className="h-7 flex items-center gap-1 pr-3 text-[13px] leading-7 whitespace-nowrap text-[var(--color-text-gray)]"
        style={{ paddingLeft: 8 + (level - 1) * 16 }}
      >
        <span aria-hidden="true" className={`w-3 shrink-0 text-[11px] ${node.change === "added" ? "text-green-300" : "text-red-300"}`}>
          {prefix}
        </span>
        <span>{node.label}</span>
      </div>
      {node.children.length > 0 ? (
        <ul>
          {node.children.map((child) => (
            <ImpactTreeNode key={child.id} node={child} level={level + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
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
