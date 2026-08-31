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
import { AssemblyDialog } from "./components/dialogs/AssemblyDialog";
import { StepDialog } from "./components/dialogs/StepDialog";
import { TypedNameConfirmationDialog } from "./components/dialogs/TypedNameConfirmationDialog";
import { ImageDialog } from "./components/dialogs/ImageDialog";
import { WorkflowActivityDialog } from "./components/dialogs/WorkflowActivityDialog";
import { RegistrationWorkspace } from "./components/RegistrationWorkspace";
import { buildCatalogTree, findCatalogNode, type CatalogTreeNode } from "./model/catalogTree";

export type DialogIntent =
  | { kind: "registerAssembly" }
  | { kind: "update"; nodeId: string }
  | { kind: "createStep"; pluginId: string }
  | { kind: "createImage"; stepId: string }
  | { kind: "unregisterStep"; stepId: string }
  | { kind: "toggleStep"; stepId: string; enable: boolean }
  | { kind: "unregisterImage"; imageId: string }
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
  const dialogNode = dialogIntent?.kind === "update"
    ? findCatalogNode(nodes, dialogIntent.nodeId) ?? null
    : null;
  const isAssemblyMutationDialog = dialogIntent?.kind === "registerAssembly"
    || (dialogIntent?.kind === "update" && dialogNode?.kind === "assembly");
  const stepNode = dialogIntent?.kind === "unregisterStep" || dialogIntent?.kind === "toggleStep"
    ? findCatalogNode(nodes, `step:${dialogIntent.stepId}`) ?? null
    : dialogNode?.kind === "step" ? dialogNode : null;
  const pluginId = dialogIntent?.kind === "createStep" ? dialogIntent.pluginId
    : stepNode?.kind === "step" ? stepNode.data.pluginHandlerId : null;
  const pluginNode = pluginId ? findCatalogNode(nodes, `plugin:${pluginId}`) ?? null : null;
  const isStepEditDialog = Boolean(pluginNode?.kind === "plugin"
    && (dialogIntent?.kind === "createStep" || dialogIntent?.kind === "update" && dialogNode?.kind === "step"));
  const isStepConfirmation = Boolean(pluginNode?.kind === "plugin" && stepNode?.kind === "step"
    && (dialogIntent?.kind === "unregisterStep" || dialogIntent?.kind === "toggleStep"));
  const imageNode = dialogIntent?.kind === "unregisterImage" ? findCatalogNode(nodes, `image:${dialogIntent.imageId}`) ?? null
    : dialogNode?.kind === "image" ? dialogNode : null;
  const imageStepNode = imageNode?.kind === "image" ? findCatalogNode(nodes, `step:${imageNode.data.pluginStepId}`) ?? null
    : dialogIntent?.kind === "createImage" ? findCatalogNode(nodes, `step:${dialogIntent.stepId}`) ?? null : null;
  const isImageDialog = Boolean(imageStepNode?.kind === "step" && (dialogIntent?.kind === "createImage"
    || dialogIntent?.kind === "unregisterImage" || dialogIntent?.kind === "update" && dialogNode?.kind === "image"));
  const workflowActivityNode = dialogIntent?.kind === "update" && dialogNode?.kind === "workflowActivity" ? dialogNode : null;

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
        if (intent.nodeId.startsWith("step:")) setDialogIntent({ kind: "unregisterStep", stepId: intent.nodeId.slice(5) });
        else if (intent.nodeId.startsWith("image:")) setDialogIntent({ kind: "unregisterImage", imageId: intent.nodeId.slice(6) });
        break;
      case "toggleStep":
        setDialogIntent({ kind: "toggleStep", stepId: intent.stepId, enable: intent.enable });
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
        intent={isAssemblyMutationDialog || isStepEditDialog || isStepConfirmation || isImageDialog || workflowActivityNode ? null : dialogIntent}
        node={dialogNode}
        onClose={() => setDialogIntent(null)}
      />
      {isAssemblyMutationDialog ? (
        <AssemblyDialog
          assembly={dialogNode?.kind === "assembly" ? dialogNode.data : null}
          connectionName={connectionName || null}
          onClose={() => setDialogIntent(null)}
          onVerified={(assembly) => setSelectedNodeId(`assembly:${assembly.id}`)}
          refreshCatalog={() => catalogQuery.refetch()}
        />
      ) : null}
      {isStepEditDialog && pluginNode?.kind === "plugin" ? (
        <StepDialog connectionName={connectionName || null} plugin={pluginNode.data}
          step={stepNode?.kind === "step" ? stepNode.data : null}
          operation={stepNode?.kind === "step" ? "update" : "create"}
          onClose={() => setDialogIntent(null)} refreshCatalog={() => catalogQuery.refetch()} />
      ) : null}
      {isStepConfirmation && pluginNode?.kind === "plugin" && stepNode?.kind === "step"
        && (dialogIntent?.kind === "unregisterStep" || dialogIntent?.kind === "toggleStep") ? (
        <TypedNameConfirmationDialog connectionName={connectionName || null} plugin={pluginNode.data}
          step={stepNode.data} operation={dialogIntent.kind === "unregisterStep" ? "unregister" : dialogIntent.enable ? "enable" : "disable"}
          onClose={() => setDialogIntent(null)} refreshCatalog={() => catalogQuery.refetch()} />
      ) : null}
      {isImageDialog && imageStepNode?.kind === "step" ? (
        <ImageDialog connectionName={connectionName || null} step={imageStepNode.data}
          image={imageNode?.kind === "image" ? imageNode.data : null}
          operation={dialogIntent?.kind === "createImage" ? "create" : dialogIntent?.kind === "unregisterImage" ? "unregister" : "update"}
          onClose={() => setDialogIntent(null)} refreshCatalog={() => catalogQuery.refetch()} />
      ) : null}
      {workflowActivityNode?.kind === "workflowActivity" ? (
        <WorkflowActivityDialog connectionName={connectionName || null} activity={workflowActivityNode.data}
          onClose={() => setDialogIntent(null)} refreshCatalog={() => catalogQuery.refetch()} />
      ) : null}
    </div>
  );
}
