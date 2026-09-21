import { useEffect, useState } from "react";
import { Button, Modal, useToast } from "../../../../shared/ui";
import { useAssemblyMutations } from "../../api/useAssemblyMutations";
import { useCapabilities } from "../../api/useCapabilities";
import {
  ISOLATION_LABELS,
  SOURCE_LABELS,
  isInspectionError,
  type AssemblyDto,
  type AssemblyInspectionDto,
  type RegistrationProblem,
} from "../../model/contracts";
import { problemFor, toRegistrationError } from "../../model/apiError";
import { FormField, fieldControlClass } from "./FormField";

interface AssemblyDialogProps {
  open: boolean;
  connectionName: string;
  assembly?: AssemblyDto;
  onClose: () => void;
}

export function AssemblyDialog({
  open,
  connectionName,
  assembly,
  onClose,
}: AssemblyDialogProps) {
  const { showToast } = useToast();
  const capabilities = useCapabilities(open ? connectionName : null);
  const mutations = useAssemblyMutations(connectionName);
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<AssemblyInspectionDto | null>(null);
  const [isolationMode, setIsolationMode] = useState(2);
  const [sourceType, setSourceType] = useState(0);
  const [problems, setProblems] = useState<RegistrationProblem[]>([]);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setInspection(null);
    setProblems([]);
  }, [open, assembly]);

  useEffect(() => {
    if (!open) return;
    if (assembly) {
      setIsolationMode(assembly.isolationMode);
      setSourceType(assembly.sourceType);
      return;
    }
    if (!capabilities.data) return;
    setIsolationMode(capabilities.data.isolationModes[0] ?? 2);
    setSourceType(capabilities.data.sourceTypes[0] ?? 0);
  }, [open, assembly, capabilities.data]);

  const isolationModes = capabilities.data?.isolationModes ?? [];
  const sourceTypes = capabilities.data?.sourceTypes ?? [];
  const frozen = !!assembly;
  const hasErrors = inspection?.diagnostics.some(isInspectionError) ?? false;
  const isPending =
    mutations.analyze.isPending ||
    mutations.register.isPending ||
    mutations.update.isPending;
  const canSubmit = !!file && !!inspection && !hasErrors && !isPending;

  const onFile = async (files: FileList | null) => {
    const next = files?.[0] ?? null;
    setFile(next);
    setInspection(null);
    setProblems([]);
    if (!next) return;
    try {
      setInspection(await mutations.analyze.mutateAsync(next));
    } catch (error) {
      const parsed = toRegistrationError(error);
      setProblems(parsed.problems);
      showToast(parsed.message, "error");
    }
  };

  const save = async () => {
    if (!file) return;
    setProblems([]);
    try {
      if (assembly) await mutations.update.mutateAsync({ id: assembly.id, file });
      else {
        await mutations.register.mutateAsync({ file, isolationMode, sourceType });
      }
      showToast(assembly ? "Assembly updated." : "Assembly registered.", "success");
      onClose();
    } catch (error) {
      const parsed = toRegistrationError(error);
      setProblems(parsed.problems);
      showToast(parsed.message, "error");
    }
  };

  const busyLabel = mutations.analyze.isPending
    ? "Analyzing assembly…"
    : assembly
      ? "Updating assembly…"
      : "Registering assembly…";

  const closeDialog = () => {
    if (isPending) return;
    onClose();
  };

  return (
    <Modal
      open={open}
      title={assembly ? "Update assembly" : "Register assembly"}
      onClose={closeDialog}
      widthClass="max-w-2xl"
      busy={isPending}
      busyLabel={busyLabel}
    >
      <FormField
        label="Assembly"
        htmlFor="assembly-file"
        problem={problemFor(problems, "assembly")}
      >
        <input
          id="assembly-file"
          type="file"
          accept=".dll"
          className={fieldControlClass}
          disabled={isPending}
          onChange={(event) => void onFile(event.target.files)}
        />
      </FormField>

      {inspection ? (
        <InspectionPreview
          inspection={inspection}
          registeredVersion={assembly?.version ?? null}
        />
      ) : null}

      <FormField
        label="Isolation"
        problem={problemFor(problems, "isolationMode")}
      >
        <CapabilityRadios
          name="isolationMode"
          value={isolationMode}
          options={ISOLATION_OPTIONS}
          allowed={isolationModes}
          labels={ISOLATION_LABELS}
          frozen={frozen}
          onChange={setIsolationMode}
        />
      </FormField>

      <FormField label="Source" problem={problemFor(problems, "sourceType")}>
        <CapabilityRadios
          name="sourceType"
          value={sourceType}
          options={SOURCE_OPTIONS}
          allowed={sourceTypes}
          labels={SOURCE_LABELS}
          frozen={frozen}
          onChange={setSourceType}
        />
      </FormField>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={closeDialog} disabled={isPending}>
          Cancel
        </Button>
        <Button type="button" onClick={() => void save()} disabled={!canSubmit}>
          {assembly ? "Update" : "Register"}
        </Button>
      </div>
    </Modal>
  );
}

function InspectionPreview({
  inspection,
  registeredVersion,
}: {
  inspection: AssemblyInspectionDto;
  registeredVersion: string | null;
}) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-[var(--color-text-dark-gray)]">Name</dt>
        <dd>{inspection.identity.name}</dd>
        <dt className="text-[var(--color-text-dark-gray)]">Version</dt>
        <dd>
          {registeredVersion
            ? `${registeredVersion} → ${inspection.identity.version}`
            : inspection.identity.version}
        </dd>
        <dt className="text-[var(--color-text-dark-gray)]">Public key token</dt>
        <dd>{inspection.identity.publicKeyToken}</dd>
        <dt className="text-[var(--color-text-dark-gray)]">Target framework</dt>
        <dd>{inspection.targetFramework ?? "—"}</dd>
        <dt className="text-[var(--color-text-dark-gray)]">SHA-256</dt>
        <dd>{inspection.sha256.slice(0, 12)}</dd>
      </dl>
      <div>
        <p className="text-xs text-[var(--color-text-dark-gray)]">Plug-in types</p>
        <ul className="list-disc pl-5">
          {inspection.plugins.map((plugin) => (
            <li key={plugin.typeName}>{plugin.typeName}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-xs text-[var(--color-text-dark-gray)]">Workflow activities</p>
        <ul className="list-disc pl-5">
          {inspection.workflowActivities.map((activity) => (
            <li key={activity.typeName}>{activity.typeName}</li>
          ))}
        </ul>
      </div>
      {inspection.diagnostics.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {inspection.diagnostics.map((diagnostic) => (
            <li
              key={`${diagnostic.code}-${diagnostic.message}`}
              role="alert"
              className="text-xs text-[var(--color-text-white)]"
            >
              {diagnostic.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const ISOLATION_OPTIONS = [2, 1] as const;
const SOURCE_OPTIONS = [0, 1] as const;

function CapabilityRadios({
  name,
  value,
  options,
  allowed,
  labels,
  frozen,
  onChange,
}: {
  name: string;
  value: number;
  options: readonly number[];
  allowed: number[];
  labels: Record<number, string>;
  frozen: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex gap-4">
      {options.map((option) => {
        const disabled = frozen || !allowed.includes(option);
        return (
          <label
            key={option}
            className={`flex items-center gap-2 text-sm ${
              disabled
                ? "text-[var(--color-text-dark-gray)] cursor-not-allowed"
                : "text-[var(--color-text-gray)]"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              disabled={disabled}
              onChange={() => onChange(option)}
            />
            {labels[option] ?? option}
          </label>
        );
      })}
    </div>
  );
}
