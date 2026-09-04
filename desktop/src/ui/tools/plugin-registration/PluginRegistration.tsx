import { useMemo, useState } from "react";

import { useConnections, useConnectionSelection } from "../../shared/connections";
import { Button, Modal, ToastProvider } from "../../shared/ui";
import { useRegistrationCatalog } from "./api/useRegistrationCatalog";
import { useWorkflowActivityDetails } from "./api/useWorkflowActivityDetails";
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
import {
  buildCatalogTree,
  catalogNodeId,
  findCatalogNode,
  parseCatalogNodeId,
  type CatalogNodeId,
  type CatalogTreeNode,
} from "./model/catalogTree";
import { MutationOutcomeBanner } from "./components/MutationOutcomeBanner";
import {
  parseMutationOutcome,
  parsePluginRegistrationProblem,
  type MutationOutcome,
  type ReportMutationFailure,
  type ReportMutationResult,
} from "./model/pluginRegistrationError";

export type DialogIntent =
  | { kind: "registerAssembly" }
  | { kind: "update"; nodeId: CatalogNodeId }
  | { kind: "createStep"; pluginId: string }
  | { kind: "createImage"; stepId: string }
  | { kind: "unregisterStep"; stepId: string }
  | { kind: "toggleStep"; stepId: string; enable: boolean }
  | { kind: "unregisterImage"; imageId: string }
  | { kind: "cascadeUnregister"; nodeId: CatalogNodeId }
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
  const cascades = useUnregisterMutations(connectionName || null);
  const [selectedNodeId, setSelectedNodeId] = useState<CatalogNodeId | null>(null);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());
  const [dialogIntent, setDialogIntent] = useState<DialogIntent>(null);
  const [contextMenu, setContextMenu] = useState<RegistrationContextMenuState | null>(null);
  const [mutationOutcome, setMutationOutcome] = useState<MutationOutcome | null>(null);
  const [retryRead, setRetryRead] = useState<(() => void) | null>(null);
  const [mutationRefreshPending, setMutationRefreshPending] = useState(false);

  const nodes = useMemo(
    () => (catalogQuery.data ? buildCatalogTree(catalogQuery.data) : []),
    [catalogQuery.data],
  );
  const selectedNode = selectedNodeId ? findCatalogNode(nodes, selectedNodeId) ?? null : null;
  const selectedWorkflowActivityId = selectedNode?.kind === "workflowActivity"
    ? selectedNode.data.id
    : null;
  const workflowDetailsQuery = useWorkflowActivityDetails(
    connectionName || null,
    selectedWorkflowActivityId,
  );
  const selectedNodeWithDetails = selectedNode?.kind === "workflowActivity"
    && workflowDetailsQuery.data?.kind === "workflowActivity"
    && workflowDetailsQuery.data.id === selectedNode.data.id
    ? {
        ...selectedNode,
        data: {
          ...selectedNode.data,
          workflowArguments: workflowDetailsQuery.data.workflowArguments,
          dependencies: workflowDetailsQuery.data.dependencies,
        },
      }
    : selectedNode;
  const dialogNode = dialogIntent?.kind === "update"
    ? findCatalogNode(nodes, dialogIntent.nodeId) ?? null
    : null;
  const isAssemblyMutationDialog = dialogIntent?.kind === "registerAssembly"
    || (dialogIntent?.kind === "update" && dialogNode?.kind === "assembly");
  const stepNode = dialogIntent?.kind === "unregisterStep" || dialogIntent?.kind === "toggleStep"
    ? findCatalogNode(nodes, catalogNodeId("step", dialogIntent.stepId)) ?? null
    : dialogNode?.kind === "step" ? dialogNode : null;
  const pluginId = dialogIntent?.kind === "createStep" ? dialogIntent.pluginId
    : stepNode?.kind === "step" ? stepNode.data.pluginHandlerId : null;
  const pluginNode = pluginId ? findCatalogNode(nodes, catalogNodeId("plugin", pluginId)) ?? null : null;
  const isStepEditDialog = Boolean(pluginNode?.kind === "plugin"
    && (dialogIntent?.kind === "createStep" || dialogIntent?.kind === "update" && dialogNode?.kind === "step"));
  const isStepConfirmation = Boolean(pluginNode?.kind === "plugin" && stepNode?.kind === "step"
    && (dialogIntent?.kind === "unregisterStep" || dialogIntent?.kind === "toggleStep"));
  const imageNode = dialogIntent?.kind === "unregisterImage" ? findCatalogNode(nodes, catalogNodeId("image", dialogIntent.imageId)) ?? null
    : dialogNode?.kind === "image" ? dialogNode : null;
  const imageStepNode = imageNode?.kind === "image" ? findCatalogNode(nodes, catalogNodeId("step", imageNode.data.pluginStepId)) ?? null
    : dialogIntent?.kind === "createImage" ? findCatalogNode(nodes, catalogNodeId("step", dialogIntent.stepId)) ?? null : null;
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
    setMutationOutcome(null);
    setRetryRead(null);
    setConnectionName(name);
  };

  const refreshAfterMutation = async (affectedComponentId?: string | null) => {
    setMutationRefreshPending(true);
    try {
      const refreshed = await catalogQuery.refetch();
      if (!affectedComponentId || !refreshed.data) return;
      const affectedNode = findNodeByComponentId(buildCatalogTree(refreshed.data), affectedComponentId);
      if (affectedNode) setSelectedNodeId(affectedNode.id);
    } finally {
      setMutationRefreshPending(false);
    }
  };

  const reportMutationResult: ReportMutationResult = async (value, affectedComponentId) => {
    const parsed = parseMutationOutcome(value);
    setDialogIntent(null);
    setContextMenu(null);
    setRetryRead(null);
    setMutationOutcome({ ...parsed, targetId: parsed.targetId ?? affectedComponentId ?? null });
    await refreshAfterMutation(parsed.targetId ?? affectedComponentId);
  };

  const reportMutationFailure: ReportMutationFailure = async (error, context) => {
    const problem = parsePluginRegistrationProblem(error);
    const uncertain = context.phase === "execute" && problem.category === "communication";
    setMutationOutcome({
      outcome: uncertain ? "outcomeUncertain" : "rejectedBeforeCompletion",
      targetId: context.affectedComponentId ?? null,
      problem,
    });
    setRetryRead(() => context.phase === "read" ? context.retry ?? null : null);
    if (uncertain || problem.category === "concurrency") {
      setDialogIntent(null);
      setContextMenu(null);
      await refreshAfterMutation(context.affectedComponentId);
    }
  };

  const selectAndToggleNode = (node: CatalogTreeNode) => {
    if (mutationRefreshPending) return;
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
    if (mutationRefreshPending) return;
    setSelectedNodeId(node.id);
    setContextMenu(null);
    setDialogIntent({ kind: "update", nodeId: node.id });
  };

  const openContextMenu = (
    node: CatalogTreeNode,
    position: { x: number; y: number },
    anchor: HTMLButtonElement,
  ) => {
    if (mutationRefreshPending) return;
    setSelectedNodeId(node.id);
    setContextMenu({ node, ...position, anchor });
  };

  const handleActionIntent = (intent: RegistrationActionIntent) => {
    if (mutationRefreshPending) return;
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
        {
          const target = parseCatalogNodeId(intent.nodeId);
          if (target.kind === "assembly" || target.kind === "plugin" || target.kind === "workflowActivity") {
            setDialogIntent({ kind: "cascadeUnregister", nodeId: intent.nodeId });
          } else if (target.kind === "step") {
            setDialogIntent({ kind: "unregisterStep", stepId: target.componentId });
          } else {
            setDialogIntent({ kind: "unregisterImage", imageId: target.componentId });
          }
        }
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
        registerDisabled={!connectionName || mutationRefreshPending}
      />

      <MutationOutcomeBanner outcome={mutationOutcome} retryRead={retryRead} refreshPending={mutationRefreshPending} />

      <RegistrationWorkspace
        connectionName={connectionName}
        nodes={nodes}
        selectedNode={selectedNodeWithDetails}
        detailsLoading={Boolean(selectedWorkflowActivityId && workflowDetailsQuery.isLoading)}
        detailsError={selectedWorkflowActivityId ? workflowDetailsQuery.error : null}
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
          onVerified={(assembly) => setSelectedNodeId(catalogNodeId("assembly", assembly.id))}
          onMutationResult={reportMutationResult}
          onMutationFailure={reportMutationFailure}
        />
      ) : null}
      {isStepEditDialog && pluginNode?.kind === "plugin" ? (
        <StepDialog connectionName={connectionName || null} plugin={pluginNode.data}
          step={stepNode?.kind === "step" ? stepNode.data : null}
          operation={stepNode?.kind === "step" ? "update" : "create"}
          onClose={() => setDialogIntent(null)}
          onMutationResult={reportMutationResult} onMutationFailure={reportMutationFailure} />
      ) : null}
      {isStepConfirmation && pluginNode?.kind === "plugin" && stepNode?.kind === "step"
        && (dialogIntent?.kind === "unregisterStep" || dialogIntent?.kind === "toggleStep") ? (
        <TypedNameConfirmationDialog connectionName={connectionName || null} plugin={pluginNode.data}
          step={stepNode.data} operation={dialogIntent.kind === "unregisterStep" ? "unregister" : dialogIntent.enable ? "enable" : "disable"}
          onClose={() => setDialogIntent(null)}
          onMutationResult={reportMutationResult} onMutationFailure={reportMutationFailure} />
      ) : null}
      {isImageDialog && imageStepNode?.kind === "step" ? (
        <ImageDialog connectionName={connectionName || null} step={imageStepNode.data}
          image={imageNode?.kind === "image" ? imageNode.data : null}
          operation={dialogIntent?.kind === "createImage" ? "create" : dialogIntent?.kind === "unregisterImage" ? "unregister" : "update"}
          onClose={() => setDialogIntent(null)}
          onMutationResult={reportMutationResult} onMutationFailure={reportMutationFailure} />
      ) : null}
      {workflowActivityNode?.kind === "workflowActivity" ? (
        <WorkflowActivityDialog connectionName={connectionName || null} activity={workflowActivityNode.data}
          onClose={() => setDialogIntent(null)}
          onMutationResult={reportMutationResult} onMutationFailure={reportMutationFailure} />
      ) : null}
      {cascadeNode && cascadeDraft ? <CascadeUnregisterFlow node={cascadeNode} draft={cascadeDraft} connectionName={connectionName || null}
        mutations={cascades} onClose={() => setDialogIntent(null)} onMutationResult={reportMutationResult}
        onMutationFailure={reportMutationFailure} /> : null}
    </div>
  );
}

function CascadeUnregisterFlow({ node, draft, connectionName, mutations, onClose, onMutationResult, onMutationFailure }: { node: CatalogTreeNode; draft: CascadeDraft; connectionName: string | null;
  mutations: ReturnType<typeof useUnregisterMutations>; onClose: () => void; onMutationResult: ReportMutationResult; onMutationFailure: ReportMutationFailure }) {
  const preview = mutations.preflight.data;
  const previewUnregister = async () => {
    try {
      await mutations.preflight.mutateAsync(draft);
    } catch (error) {
      await onMutationFailure(error, { phase: "read", affectedComponentId: draft.targetId, retry: () => void previewUnregister() });
    }
  };
  if (!preview) return <Modal open title="Cascade unregister" onClose={onClose} widthClass="max-w-lg"><div role="dialog" aria-label="Cascade unregister" className="flex flex-col gap-3">
    <p>Review the exact owned registration impact before deleting this component.</p><div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => void previewUnregister()}>Preview unregister</Button></div>
  </div></Modal>;
  const isAssembly = node.kind === "assembly";
  const handlerClassName = node.kind === "plugin" || node.kind === "workflowActivity" ? node.data.typeName : null;
  return <CascadeConfirmationDialog open connectionName={connectionName ?? "No environment"} targetKind={draft.targetKind}
    assemblyName={isAssembly ? node.data.name : null} handlerClassName={handlerClassName}
    impact={{ handlers: preview.impact.handlers.length, steps: preview.impact.steps.length, images: preview.impact.images.length,
      enabledSteps: preview.impact.enabledStepCount, dependencies: preview.impact.externalDependencies.map(value => `${value.componentTypeLabel}: ${value.name}`),
      items: [
        ...(preview.impact.assembly ? [`Assembly: ${preview.impact.assembly.name}`] : []),
        ...preview.impact.handlers.map(value => `${value.kind === "workflowActivity" ? "Workflow activity" : "Plug-in"}: ${value.typeName}`),
        ...preview.impact.steps.map(value => `Step: ${value.name}`),
        ...preview.impact.images.map(value => `Image: ${value.name}`),
      ] }}
    blockers={preview.plan.blockers} executing={mutations.execute.isPending} onCancel={onClose}
    onConfirm={(typedName, acknowledged) => void mutations.execute.mutateAsync({ draft, token: preview.plan.token, typedName, acknowledged })
      .then(result => onMutationResult(result, draft.targetId))
      .catch(error => onMutationFailure(error, { phase: "execute", affectedComponentId: draft.targetId }))} />;
}

function findNodeByComponentId(nodes: CatalogTreeNode[], componentId: string): CatalogTreeNode | null {
  for (const node of nodes) {
    if ("data" in node && node.data.id === componentId) return node;
    const child = findNodeByComponentId(node.children, componentId);
    if (child) return child;
  }
  return null;
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
