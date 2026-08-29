import type { CatalogTreeNode } from "../model/catalogTree";
import { RegistrationTreeNode } from "./RegistrationTreeNode";

interface RegistrationTreeProps {
  nodes: CatalogTreeNode[];
  selectedNodeId: string | null;
  expandedNodeIds: Set<string>;
  forceExpanded: boolean;
  onSelectAndToggle: (node: CatalogTreeNode) => void;
  onOpenNode: (node: CatalogTreeNode) => void;
  onOpenContextMenu: (
    node: CatalogTreeNode,
    position: { x: number; y: number },
    anchor: HTMLButtonElement,
  ) => void;
}

export function RegistrationTree({
  nodes,
  selectedNodeId,
  expandedNodeIds,
  forceExpanded,
  onSelectAndToggle,
  onOpenNode,
  onOpenContextMenu,
}: RegistrationTreeProps) {
  return (
    <div role="tree" aria-label="Registrations" className="min-w-max">
      {nodes.map((node) => (
        <RegistrationTreeNode
          key={node.id}
          node={node}
          level={1}
          selectedNodeId={selectedNodeId}
          expandedNodeIds={expandedNodeIds}
          forceExpanded={forceExpanded}
          onSelectAndToggle={onSelectAndToggle}
          onOpenNode={onOpenNode}
          onOpenContextMenu={onOpenContextMenu}
        />
      ))}
    </div>
  );
}
