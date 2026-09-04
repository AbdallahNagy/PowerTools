import type { ReactNode } from "react";

import type { CatalogTreeNode } from "../model/catalogTree";

export function RegistrationDetails({
  node,
  isLoading = false,
  error = null,
}: {
  node: CatalogTreeNode | null;
  isLoading?: boolean;
  error?: unknown;
}) {
  return (
    <section role="region" aria-label="Registration details" className="flex flex-col min-h-0 h-full">
      <div className="px-4 py-2.5 border-b border-[#3c3c3c] text-xs font-semibold uppercase tracking-wider text-[#858585]">
        Details
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-4">
        {isLoading ? <p className="text-sm text-[#858585]">Loading workflow details…</p>
          : error ? <p role="status" className="text-sm text-red-300">Unable to load workflow details.</p>
          : node ? <NodeDetails node={node} />
          : <p className="text-sm text-[#858585]">Select a registration to view details.</p>}
      </div>
    </section>
  );
}

function NodeDetails({ node }: { node: CatalogTreeNode }) {
  const rows = detailsForNode(node);
  const workflow = node.kind === "workflowActivity" ? node.data : null;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[11px] uppercase tracking-wider text-[#858585]">{kindLabel(node)}</p>
        <h2 className="mt-1 text-base font-semibold text-white break-words">{node.data.name}</h2>
      </div>
      <section aria-label="Properties">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#858585]">Properties</h3>
        <dl className="mt-2 grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">
          {rows.map(([label, value]) => (
            <DetailRow key={label} label={label} value={value} />
          ))}
        </dl>
      </section>
      {workflow ? <>
        <section aria-label="Argument Contract" className="text-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#858585]">Argument Contract</h3>
          {workflow.workflowArguments.length ? <ul className="mt-2 space-y-1">{workflow.workflowArguments
            .slice().sort((left, right) => left.position - right.position).map(argument => <li key={`${argument.position}:${argument.name}`}>
              {argument.direction === "input" ? "Input" : "Output"} · {argument.displayName} · {argument.typeName} · {argument.isRequired ? "Required" : "Optional"}
            </li>)}</ul> : <p className="mt-2 text-[#858585]">No workflow arguments are registered.</p>}
        </section>
        <section aria-label="Dependent Workflows/Actions" className="text-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#858585]">Dependent Workflows/Actions</h3>
          {workflow.dependencies.length ? <ul className="mt-2 space-y-1">{workflow.dependencies.map(dependency => <li key={dependency.componentId}>
            {dependency.name} · {dependency.componentTypeLabel}{dependency.stateLabel ? ` · ${dependency.stateLabel}` : ""}
          </li>)}</ul> : <p className="mt-2 text-[#858585]">No dependent workflows or actions were found.</p>}
        </section>
      </> : null}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt className="text-[#858585]">{label}</dt>
      <dd className="text-[#cccccc] break-words">{value ?? "—"}</dd>
    </>
  );
}

function detailsForNode(node: CatalogTreeNode): [string, ReactNode][] {
  switch (node.kind) {
    case "assembly":
      return [
        ["Version", node.data.version],
        ["Culture", node.data.culture ?? "—"],
        ["Public key token", node.data.publicKeyToken ?? "—"],
        ["Solution", node.data.solutionDisplayName ?? "—"],
        ["Managed", yesNo(node.data.isManaged)],
        ["Customizable", yesNo(node.data.isCustomizable)],
        ["Description", node.data.description ?? "—"],
      ];
    case "plugin":
    case "workflowActivity":
      return [
        ["Type name", node.data.typeName],
        ["Friendly name", node.data.friendlyName ?? "—"],
        ["Activity group", node.data.workflowActivityGroupName ?? "—"],
        ["Solution", node.data.solutionDisplayName ?? "—"],
        ["Managed", yesNo(node.data.isManaged)],
        ["Customizable", yesNo(node.data.isCustomizable)],
        ["Description", node.data.description ?? "—"],
      ];
    case "step":
      return [
        ["Message", node.data.messageLabel],
        ["Primary table", node.data.primaryTableLabel ?? "—"],
        ["Secondary table", node.data.secondaryTableLabel ?? "—"],
        ["Stage", node.data.stageLabel],
        ["Mode", node.data.modeLabel],
        ["Rank", node.data.rank],
        ["Status", node.data.isEnabled ? "Enabled" : "Disabled"],
        ["Secure configuration", node.data.secureConfigExists ? "Present" : "None"],
        ["Solution", node.data.solutionDisplayName ?? "—"],
        ["Description", node.data.description ?? "—"],
      ];
    case "image":
      return [
        ["Image type", node.data.imageTypeLabel],
        ["Entity alias", node.data.entityAlias ?? "—"],
        ["Attributes", node.data.attributes.length ? node.data.attributes.join(", ") : "All attributes"],
        ["Solution", node.data.solutionDisplayName ?? "—"],
        ["Description", node.data.description ?? "—"],
      ];
  }
}

function kindLabel(node: CatalogTreeNode): string {
  switch (node.kind) {
    case "assembly": return "Assembly";
    case "plugin": return "Plug-in";
    case "workflowActivity": return "Workflow activity";
    case "step": return "Step";
    case "image": return "Image";
  }
}

function yesNo(value: boolean) {
  return value ? "Yes" : "No";
}
