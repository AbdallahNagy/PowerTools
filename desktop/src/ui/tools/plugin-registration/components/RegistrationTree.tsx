import type { MouseEvent } from "react";
import type { TreeNode } from "../model/catalogTree";
import { TreeNodeRow } from "./TreeNodeRow";

interface RegistrationTreeProps {
  nodes: TreeNode[];
  expanded: Set<string>;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onActivate?: (node: TreeNode) => void;
  onContextMenu?: (event: MouseEvent, node: TreeNode) => void;
  emptyMessage: string;
}

export function RegistrationTree({
  nodes,
  expanded,
  selectedId,
  onToggle,
  onSelect,
  onActivate,
  onContextMenu,
  emptyMessage,
}: RegistrationTreeProps) {
  if (nodes.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-dark-gray)] p-3">{emptyMessage}</p>
    );
  }

  return (
    <div role="tree" className="overflow-auto flex-1 min-h-0">
      {nodes.map((node) => (
        <TreeNodeRow
          key={node.id}
          node={node}
          depth={0}
          expanded={expanded}
          selectedId={selectedId}
          onToggle={onToggle}
          onSelect={onSelect}
          onActivate={onActivate}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  );
}

