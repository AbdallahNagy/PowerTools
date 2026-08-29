import { useMemo, useState } from "react";

import { useConnections, useConnectionSelection } from "../../shared/connections";
import { ToastProvider } from "../../shared/ui";
import { useRegistrationCatalog } from "./api/useRegistrationCatalog";
import { PluginRegistrationHeader } from "./components/PluginRegistrationHeader";
import {
  RegistrationContextMenu,
  type RegistrationActionIntent,
  type RegistrationContextMenuState,
} from "./components/RegistrationContextMenu";
import { RegistrationDialogShell } from "./components/dialogs/RegistrationDialogShell";
import { RegistrationWorkspace } from "./components/RegistrationWorkspace";
import { buildCatalogTree, findCatalogNode, type CatalogTreeNode } from "./model/catalogTree";

export type DialogIntent =
  | { kind: "registerAssembly" }
  | { kind: "update"; nodeId: string }
  | { kind: "createStep"; pluginId: string }
  | { kind: "createImage"; stepId: string }
  | null;

export default function PluginRegistration() {
  return (
    <ToastProvider>
      <PluginRegistrationPage />
    </ToastProvider>
  );
}

function PluginRegistrationPage() {
  const { connectionName, setConnectionName } = useConnectionSelection();
  const { connections } = useConnections();
  const catalogQuery = useRegistrationCatalog(connectionName || null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());
  const [dialogIntent, setDialogIntent] = useState<DialogIntent>(null);
  const [contextMenu, setContextMenu] = useState<RegistrationContextMenuState | null>(null);

  const nodes = useMemo(
    () => (catalogQuery.data ? buildCatalogTree(catalogQuery.data) : []),
    [catalogQuery.data],
  );
  const selectedNode = selectedNodeId ? findCatalogNode(nodes, selectedNodeId) ?? null : null;

  const changeConnection = (name: string) => {
    setSelectedNodeId(null);
    setExpandedNodeIds(new Set());
    setContextMenu(null);
    setDialogIntent(null);
    setConnectionName(name);
  };

  const selectAndToggleNode = (node: CatalogTreeNode) => {
    setSelectedNodeId(node.id);
    setExpandedNodeIds((current) => {
      if (node.children.length === 0) return current;
      const next = new Set(current);
      if (next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
      return next;
    });
  };

  const openNodeDialog = (node: CatalogTreeNode) => {
    setSelectedNodeId(node.id);
    setContextMenu(null);
    setDialogIntent({ kind: "update", nodeId: node.id });
  };

  const openContextMenu = (
    node: CatalogTreeNode,
    position: { x: number; y: number },
    anchor: HTMLButtonElement,
  ) => {
    setSelectedNodeId(node.id);
    setContextMenu({ node, ...position, anchor });
  };

  const handleActionIntent = (intent: RegistrationActionIntent) => {
    switch (intent.kind) {
      case "update":
        setDialogIntent({ kind: "update", nodeId: intent.nodeId });
        break;
      case "createStep":
        setDialogIntent({ kind: "createStep", pluginId: intent.pluginId });
        break;
      case "createImage":
        setDialogIntent({ kind: "createImage", stepId: intent.stepId });
        break;
      case "unregister":
      case "toggleStep":
        break;
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 gap-4 text-[#cccccc] overflow-hidden">
      <PluginRegistrationHeader
        connections={connections}
        connectionName={connectionName}
        onConnectionChange={changeConnection}
        onRefresh={() => {
          void catalogQuery.refetch();
        }}
        refreshDisabled={!connectionName || catalogQuery.isFetching}
        onRegisterAssembly={() => setDialogIntent({ kind: "registerAssembly" })}
        registerDisabled={!connectionName}
      />

      <RegistrationWorkspace
        connectionName={connectionName}
        nodes={nodes}
        selectedNode={selectedNode}
        selectedNodeId={selectedNodeId}
        expandedNodeIds={expandedNodeIds}
        isLoading={catalogQuery.isLoading}
        error={catalogQuery.error}
        onSelectAndToggle={selectAndToggleNode}
        onOpenNode={openNodeDialog}
        onOpenContextMenu={openContextMenu}
      />

      <RegistrationContextMenu
        state={contextMenu}
        onAction={handleActionIntent}
        onClose={() => setContextMenu(null)}
      />
      <RegistrationDialogShell
        intent={dialogIntent}
        node={
          dialogIntent?.kind === "update"
            ? findCatalogNode(nodes, dialogIntent.nodeId) ?? null
            : null
        }
        onClose={() => setDialogIntent(null)}
      />
    </div>
  );
}
