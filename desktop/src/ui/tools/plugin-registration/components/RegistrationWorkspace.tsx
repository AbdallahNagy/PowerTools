import { useMemo, useState, type ReactNode } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";

import { SearchInput, Spinner } from "../../../shared/ui";
import { filterCatalogTree, type CatalogTreeNode } from "../model/catalogTree";
import { RegistrationDetails } from "./RegistrationDetails";
import { RegistrationTree } from "./RegistrationTree";

interface RegistrationWorkspaceProps {
  connectionName: string;
  nodes: CatalogTreeNode[];
  selectedNode: CatalogTreeNode | null;
  selectedNodeId: string | null;
  detailsLoading: boolean;
  detailsError: unknown;
  expandedNodeIds: Set<string>;
  isLoading: boolean;
  error: unknown;
  onSelectAndToggle: (node: CatalogTreeNode) => void;
  onOpenNode: (node: CatalogTreeNode) => void;
  onOpenContextMenu: (
    node: CatalogTreeNode,
    position: { x: number; y: number },
    anchor: HTMLButtonElement,
  ) => void;
}

export function RegistrationWorkspace({
  connectionName,
  nodes,
  selectedNode,
  selectedNodeId,
  detailsLoading,
  detailsError,
  expandedNodeIds,
  isLoading,
  error,
  onSelectAndToggle,
  onOpenNode,
  onOpenContextMenu,
}: RegistrationWorkspaceProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const filteredNodes = useMemo(
    () => filterCatalogTree(nodes, searchTerm),
    [nodes, searchTerm],
  );

  let hierarchyContent: ReactNode;
  if (!connectionName) {
    hierarchyContent = <WorkspaceMessage>Select a connection to browse registrations.</WorkspaceMessage>;
  } else if (isLoading) {
    hierarchyContent = (
      <WorkspaceMessage>
        <Spinner />
        Loading registrations…
      </WorkspaceMessage>
    );
  } else if (error) {
    hierarchyContent = <WorkspaceMessage tone="error">{errorMessage(error)}</WorkspaceMessage>;
  } else if (nodes.length === 0) {
    hierarchyContent = <WorkspaceMessage>No registrations found.</WorkspaceMessage>;
  } else if (filteredNodes.length === 0) {
    hierarchyContent = <WorkspaceMessage>No registrations match your search.</WorkspaceMessage>;
  } else {
    hierarchyContent = (
      <RegistrationTree
        nodes={filteredNodes}
        selectedNodeId={selectedNodeId}
        expandedNodeIds={expandedNodeIds}
        forceExpanded={Boolean(searchTerm.trim())}
        onSelectAndToggle={onSelectAndToggle}
        onOpenNode={onOpenNode}
        onOpenContextMenu={onOpenContextMenu}
      />
    );
  }

  return (
    <Group
      className="flex flex-1 min-h-0"
      defaultLayout={{
        "registration-hierarchy": 66.666,
        "registration-details": 33.334,
      }}
    >
      <Panel
        id="registration-hierarchy"
        role="region"
        aria-label="Registration hierarchy"
        defaultSize="66.666%"
        minSize="30%"
        className="flex flex-col min-h-0 min-w-0 overflow-hidden border border-[#3c3c3c] bg-[#252526]"
      >
        <label className="block p-2 border-b border-[#3c3c3c]">
          <span className="sr-only">Search registrations</span>
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search registrations"
          />
        </label>
        <div className="flex-1 min-h-0 overflow-auto py-1">{hierarchyContent}</div>
      </Panel>
      <Separator className="w-1 mx-1 cursor-col-resize bg-(--color-bg-light) hover:bg-(--color-primary) active:bg-(--color-primary) transition-colors" />
      <Panel
        id="registration-details"
        defaultSize="33.334%"
        minSize="20%"
        className="flex flex-col min-h-0 min-w-0 overflow-hidden border border-[#3c3c3c] bg-[#252526]"
      >
        <RegistrationDetails node={selectedNode} isLoading={detailsLoading} error={detailsError} />
      </Panel>
    </Group>
  );
}

function WorkspaceMessage({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "error";
}) {
  return (
    <div
      role="status"
      className={`h-full min-h-28 flex items-center justify-center gap-2 px-4 text-sm text-center ${
        tone === "error" ? "text-red-300" : "text-[#858585]"
      }`}
    >
      {children}
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: unknown } }).response;
    if (
      typeof response?.data === "object" &&
      response.data !== null &&
      "message" in response.data &&
      typeof response.data.message === "string"
    ) {
      return response.data.message;
    }
  }
  return error instanceof Error ? error.message : "Unable to load registrations.";
}
