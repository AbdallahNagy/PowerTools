import { useMemo, useState } from "react";

import { useConnections, useConnectionSelection } from "../../shared/connections";
import { Button, Modal, ToastProvider } from "../../shared/ui";
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
import { CascadeConfirmationDialog } from "./components/dialogs/CascadeConfirmationDialog";
import { useUnregisterMutations, type CascadeDraft } from "./api/useUnregisterMutations";
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
  | { kind: "cascadeUnregister"; nodeId: string }
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
  const cascades = useUnregisterMutations(connectionName || null, () => catalogQuery.refetch());
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
  const cascadeNode = dialogIntent?.kind === "cascadeUnregister" ? findCatalogNode(nodes, dialogIntent.nodeId) ?? null : null;
  const cascadeDraft: CascadeDraft | null = cascadeNode?.kind === "assembly" ? { targetKind: "assembly", targetId: cascadeNode.data.id, expectedVersions: collectAssemblyVersions(cascadeNode.data) }
    : cascadeNode?.kind === "plugin" ? { targetKind: "plugin", targetId: cascadeNode.data.id, expectedVersions: collectHandlerVersions(cascadeNode.data) }
    : cascadeNode?.kind === "workflowActivity" ? { targetKind: "workflowActivity", targetId: cascadeNode.data.id, expectedVersions: { [cascadeNode.data.id]: cascadeNode.data.versionNumber } } : null;

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
        if (intent.nodeId.startsWith("assembly:") || intent.nodeId.startsWith("plugin:") || intent.nodeId.startsWith("workflowActivity:")) setDialogIntent({ kind: "cascadeUnregister", nodeId: intent.nodeId });
        else if (intent.nodeId.startsWith("step:")) setDialogIntent({ kind: "unregisterStep", stepId: intent.nodeId.slice(5) });
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
      {cascadeNode && cascadeDraft ? <CascadeUnregisterFlow node={cascadeNode} draft={cascadeDraft} connectionName={connectionName || null}
        mutations={cascades} onClose={() => setDialogIntent(null)} /> : null}
    </div>
  );
}

function CascadeUnregisterFlow({ node, draft, connectionName, mutations, onClose }: { node: CatalogTreeNode; draft: CascadeDraft; connectionName: string | null;
  mutations: ReturnType<typeof useUnregisterMutations>; onClose: () => void }) {
  const preview = mutations.preflight.data;
  if (!preview) return <Modal open title="Cascade unregister" onClose={onClose} widthClass="max-w-lg"><div role="dialog" aria-label="Cascade unregister" className="flex flex-col gap-3">
    <p>Review the exact owned registration impact before deleting this component.</p><div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => void mutations.preflight.mutateAsync(draft)}>Preview unregister</Button></div>
  </div></Modal>;
  const isAssembly = node.kind === "assembly";
  const handlerClassName = node.kind === "plugin" || node.kind === "workflowActivity" ? node.data.typeName : null;
  return <CascadeConfirmationDialog open connectionName={connectionName ?? "No environment"} targetKind={draft.targetKind}
    assemblyName={isAssembly ? node.data.name : null} handlerClassName={handlerClassName}
    impact={{ handlers: preview.impact.handlers.length, steps: preview.impact.steps.length, images: preview.impact.images.length,
      enabledSteps: preview.impact.enabledStepCount, dependencies: preview.impact.externalDependencies.map(value => `${value.componentTypeLabel}: ${value.name}`),
      items: [
        ...preview.impact.handlers.map(value => `${value.kind === "workflowActivity" ? "Workflow activity" : "Plug-in"}: ${value.typeName}`),
        ...preview.impact.steps.map(value => `Step: ${value.name}`),
        ...preview.impact.images.map(value => `Image: ${value.name}`),
      ] }}
    blockers={preview.plan.blockers} executing={mutations.execute.isPending} onCancel={onClose}
    onConfirm={(typedName, acknowledged) => void mutations.execute.mutateAsync({ draft, token: preview.plan.token, typedName, acknowledged }).then(result => { if (result.succeededAndVerified) onClose(); })} />;
}

function collectHandlerVersions(handler: { id: string; versionNumber: number; steps: { id: string; versionNumber: number; images: { id: string; versionNumber: number }[] }[] }): Record<string, number> {
  return handler.steps.reduce<Record<string, number>>((versions, step) => {
    versions[step.id] = step.versionNumber;
    for (const image of step.images) versions[image.id] = image.versionNumber;
    return versions;
  }, { [handler.id]: handler.versionNumber });
}
function collectAssemblyVersions(assembly: { id: string; versionNumber: number; handlers: { id: string; versionNumber: number; steps: { id: string; versionNumber: number; images: { id: string; versionNumber: number }[] }[] }[] }): Record<string, number> {
  return assembly.handlers.reduce<Record<string, number>>((versions, handler) => Object.assign(versions, collectHandlerVersions(handler)), { [assembly.id]: assembly.versionNumber });
}
