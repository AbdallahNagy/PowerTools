import { useMemo, useRef, useState, type UIEvent } from "react";

import type { CatalogTreeNode } from "../model/catalogTree";
import { RegistrationTreeNode } from "./RegistrationTreeNode";

const ROW_HEIGHT = 28;
const OVERSCAN = 12;

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

interface VisibleRow {
  node: CatalogTreeNode;
  level: number;
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
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [windowStart, setWindowStart] = useState(0);
  const rows = useMemo(
    () => flattenVisibleRows(nodes, expandedNodeIds, forceExpanded, 1),
    [expandedNodeIds, forceExpanded, nodes],
  );
  const visibleCount = Math.max(40, Math.ceil((scrollerRef.current?.clientHeight ?? 480) / ROW_HEIGHT) + OVERSCAN * 2);
  const start = Math.max(0, windowStart - OVERSCAN);
  const end = Math.min(rows.length, start + visibleCount);
  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    setWindowStart(Math.floor(event.currentTarget.scrollTop / ROW_HEIGHT));
  };

  return (
    <div
      ref={scrollerRef}
      role="tree"
      aria-label="Registrations"
      className="h-full min-w-max overflow-auto"
      onScroll={onScroll}
    >
      <div style={{ height: rows.length * ROW_HEIGHT, position: "relative" }}>
        <div style={{ position: "absolute", top: start * ROW_HEIGHT, left: 0, right: 0 }}>
          {rows.slice(start, end).map((row, index) => (
            <RegistrationTreeNode
              key={row.node.id}
              node={row.node}
              level={row.level}
              setSize={rows.length}
              posInSet={start + index + 1}
              selectedNodeId={selectedNodeId}
              expandedNodeIds={expandedNodeIds}
              forceExpanded={forceExpanded}
              onSelectAndToggle={onSelectAndToggle}
              onOpenNode={onOpenNode}
              onOpenContextMenu={onOpenContextMenu}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function flattenVisibleRows(
  nodes: CatalogTreeNode[],
  expandedNodeIds: Set<string>,
  forceExpanded: boolean,
  level: number,
): VisibleRow[] {
  const rows: VisibleRow[] = [];
  for (const node of nodes) {
    rows.push({ node, level });
    const expanded = node.children.length > 0 && (forceExpanded || expandedNodeIds.has(node.id));
    if (expanded) {
      rows.push(...flattenVisibleRows(node.children, expandedNodeIds, forceExpanded, level + 1));
    }
  }
  return rows;
}
