import {
  IMAGE_TYPE_LABELS,
  ISOLATION_LABELS,
  MODE_LABELS,
  SOURCE_LABELS,
  STAGE_LABELS,
} from "../model/contracts";
import type { TreeNode } from "../model/catalogTree";

interface NodeDetailsProps {
  node: TreeNode | null;
}

export function NodeDetails({ node }: NodeDetailsProps) {
  if (!node) {
    return (
      <p className="text-sm text-[var(--color-text-dark-gray)] p-3">
        Select a registration to inspect it.
      </p>
    );
  }

  return (
    <div className="overflow-auto flex-1 min-h-0 p-3 text-sm text-[var(--color-text-gray)]">
      <h2 className="text-[var(--color-text-white)] font-semibold mb-3">{node.label}</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        {rowsFor(node).map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-[var(--color-text-dark-gray)]">{row.label}</dt>
            <dd className="break-all">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function rowsFor(node: TreeNode): Array<{ label: string; value: string }> {
  switch (node.kind) {
    case "assembly":
      return [
        { label: "Name", value: node.data.name },
        { label: "Version", value: node.data.version ?? "—" },
        { label: "Public key token", value: node.data.publicKeyToken ?? "—" },
        { label: "Isolation", value: ISOLATION_LABELS[node.data.isolationMode] ?? String(node.data.isolationMode) },
        { label: "Source", value: SOURCE_LABELS[node.data.sourceType] ?? String(node.data.sourceType) },
        { label: "Managed", value: yesNo(node.data.isManaged) },
        { label: "System", value: yesNo(node.data.isSystem) },
        { label: "Description", value: node.data.description ?? "—" },
      ];
    case "type":
      return [
        { label: "Type name", value: node.data.typeName },
        { label: "Friendly name", value: node.data.friendlyName ?? "—" },
        { label: "Workflow activity", value: yesNo(node.data.isWorkflowActivity) },
        { label: "Managed", value: yesNo(node.data.isManaged) },
        { label: "System", value: yesNo(node.data.isSystem) },
        { label: "Description", value: node.data.description ?? "—" },
      ];
    case "step":
      return [
        { label: "Message", value: node.data.messageName || "—" },
        { label: "Primary entity", value: node.data.primaryEntity ?? "—" },
        { label: "Secondary entity", value: node.data.secondaryEntity ?? "—" },
        { label: "Stage", value: STAGE_LABELS[node.data.stage] ?? String(node.data.stage) },
        { label: "Mode", value: MODE_LABELS[node.data.mode] ?? String(node.data.mode) },
        { label: "Rank", value: String(node.data.rank) },
        { label: "Enabled", value: yesNo(node.data.isEnabled) },
        { label: "Filtering attributes", value: node.data.filteringAttributes.join(", ") || "—" },
        { label: "Impersonating user", value: node.data.impersonatingUserName ?? "—" },
        { label: "Has secure configuration", value: yesNo(node.data.hasSecureConfiguration) },
        { label: "Managed", value: yesNo(node.data.isManaged) },
        { label: "System", value: yesNo(node.data.isSystem) },
      ];
    case "image":
      return [
        { label: "Entity alias", value: node.data.entityAlias || "—" },
        { label: "Image type", value: IMAGE_TYPE_LABELS[node.data.imageType] ?? String(node.data.imageType) },
        { label: "Message property", value: node.data.messagePropertyName ?? "—" },
        { label: "Attributes", value: node.data.attributes.join(", ") || "—" },
        { label: "Managed", value: yesNo(node.data.isManaged) },
        { label: "System", value: yesNo(node.data.isSystem) },
      ];
  }
}

function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}
