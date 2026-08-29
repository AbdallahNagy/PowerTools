import type { MouseEvent } from "react";

import type { CatalogTreeNode } from "../model/catalogTree";

interface RegistrationTreeNodeProps {
  node: CatalogTreeNode;
  level: number;
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

export function RegistrationTreeNode({
  node,
  level,
  selectedNodeId,
  expandedNodeIds,
  forceExpanded,
  onSelectAndToggle,
  onOpenNode,
  onOpenContextMenu,
}: RegistrationTreeNodeProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = hasChildren && (forceExpanded || expandedNodeIds.has(node.id));
  const isSelected = selectedNodeId === node.id;

  const openContextMenu = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.focus();
    onOpenContextMenu(
      node,
      { x: event.clientX, y: event.clientY },
      event.currentTarget,
    );
  };

  return (
    <div>
      <button
        type="button"
        role="treeitem"
        aria-level={level}
        aria-selected={isSelected}
        {...(hasChildren ? { "aria-expanded": isExpanded } : {})}
        className={`w-full h-7 flex items-center gap-1 pr-3 text-left text-[13px] leading-7 whitespace-nowrap focus:outline-none focus:ring-1 focus:ring-inset focus:ring-[#007fd4] ${
          isSelected
            ? "bg-[#37373d] text-white"
            : "text-[#cccccc] hover:bg-[#2a2d2e]"
        }`}
        style={{ paddingLeft: 8 + (level - 1) * 16 }}
        onClick={(event) => {
          if (event.detail > 1) return;
          onSelectAndToggle(node);
        }}
        onDoubleClick={() => onOpenNode(node)}
        onContextMenu={openContextMenu}
      >
        <span aria-hidden="true" className="w-3 shrink-0 text-[10px] text-[#858585]">
          {hasChildren ? (isExpanded ? "▾" : "▸") : ""}
        </span>
        <span>{node.label}</span>
      </button>
      {isExpanded ? (
        <div role="group">
          {node.children.map((child) => (
            <RegistrationTreeNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedNodeId={selectedNodeId}
              expandedNodeIds={expandedNodeIds}
              forceExpanded={forceExpanded}
              onSelectAndToggle={onSelectAndToggle}
              onOpenNode={onOpenNode}
              onOpenContextMenu={onOpenContextMenu}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
