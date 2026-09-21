import type { MouseEvent } from "react";
import type { TreeNode } from "../model/catalogTree";

interface TreeNodeRowProps {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onActivate?: (node: TreeNode) => void;
  onContextMenu?: (event: MouseEvent, node: TreeNode) => void;
}

export function TreeNodeRow({
  node,
  depth,
  expanded,
  selectedId,
  onToggle,
  onSelect,
  onActivate,
  onContextMenu,
}: TreeNodeRowProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-0.5 pr-2 text-sm ${
          isSelected
            ? "bg-[var(--color-hover-bg)] text-[var(--color-text-white)]"
            : "text-[var(--color-text-gray)] hover:bg-[var(--color-hover-bg)]"
        }`}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onContextMenu={(event) => {
          event.preventDefault();
          onSelect(node.id);
          onContextMenu?.(event, node);
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={isExpanded ? `Collapse ${node.label}` : `Expand ${node.label}`}
            onClick={() => onToggle(node.id)}
            className="w-5 h-5 flex items-center justify-center text-[var(--color-text-dark-gray)]"
          >
            {isExpanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-5 h-5" />
        )}
        <button
          type="button"
          className="flex-1 text-left truncate"
          aria-selected={isSelected}
          onClick={() => onSelect(node.id)}
          onDoubleClick={() => onActivate?.(node)}
        >
          {node.label}
        </button>
      </div>
      {hasChildren && isExpanded
        ? node.children.map((child) => (
            <TreeNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedId={selectedId}
              onToggle={onToggle}
              onSelect={onSelect}
              onActivate={onActivate}
              onContextMenu={onContextMenu}
            />
          ))
        : null}
    </div>
  );
}
