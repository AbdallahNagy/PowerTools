import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Spinner, ToastProvider, useToast } from "../../shared/ui";
import { useConnectionSelection } from "../../shared/connections";
import { useToolStatus } from "../../shared/status";
import { useCapabilities } from "./api/useCapabilities";
import { useCatalog } from "./api/useCatalog";
import { useStepOptions } from "./api/useStepOptions";
import { useStepMutations } from "./api/useStepMutations";
import { useUnregisterMutation } from "./api/useUnregisterMutation";
import { ToolHeader } from "./components/ToolHeader";
import { RegistrationTree } from "./components/RegistrationTree";
import { NodeDetails } from "./components/NodeDetails";
import { ContextMenu } from "./components/ContextMenu";
import { ConfirmDialog } from "./components/dialogs/ConfirmDialog";
import { StepDialog } from "./components/dialogs/StepDialog";
import { ImageDialog } from "./components/dialogs/ImageDialog";
import { AssemblyDialog } from "./components/dialogs/AssemblyDialog";
import { buildCatalogTree, findNode, typeLabel, type TreeNode } from "./model/catalogTree";
import { toRegistrationError } from "./model/apiError";
import { getNodeActions, type NodeAction } from "./model/nodeActions";
import type { AssemblyDto, CatalogDto, ImageDto, StepDto } from "./model/contracts";

export default function PluginRegistration() {
  return (
    <ToastProvider>
      <PluginRegistrationPage />
    </ToastProvider>
  );
}

interface StepDialogState {
  pluginTypeId: string;
  step?: StepDto;
}

interface ImageDialogState {
  step: StepDto;
  image?: ImageDto;
}

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  successMessage: string;
  run: () => Promise<unknown>;
}

function PluginRegistrationPage() {
  const { connectionName, setConnectionName } = useConnectionSelection();
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [showSystem, setShowSystem] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; node: TreeNode } | null>(null);
  const [stepDialog, setStepDialog] = useState<StepDialogState | null>(null);
  const [imageDialog, setImageDialog] = useState<ImageDialogState | null>(null);
  const [assemblyDialog, setAssemblyDialog] = useState<{ assembly?: AssemblyDto } | null>(
    null,
  );
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const catalogQuery = useCatalog(connectionName || null);
  const stepOptionsQuery = useStepOptions(connectionName || null);
  useCapabilities(connectionName || null);
  const stepMutations = useStepMutations(connectionName || null);
  const unregister = useUnregisterMutation(connectionName || null);

  useEffect(() => {
    setExpanded(new Set());
    setSelectedId(null);
    setMenu(null);
    setStepDialog(null);
    setImageDialog(null);
    setAssemblyDialog(null);
    setConfirm(null);
  }, [connectionName]);

  const tree = useMemo(
    () =>
      catalogQuery.data
        ? buildCatalogTree(catalogQuery.data, { showSystem, search })
        : [],
    [catalogQuery.data, showSystem, search],
  );
  const selectedNode = useMemo(() => findNode(tree, selectedId), [tree, selectedId]);

  const statusContent = useMemo(() => {
    if (!connectionName) return "Plugin Registration";
    if (catalogQuery.isLoading) return <Spinner />;
    if (catalogQuery.data) {
      return `${catalogQuery.data.assemblies.length} assemblies · ${catalogQuery.data.steps.length} steps`;
    }
    return null;
  }, [catalogQuery.data, catalogQuery.isLoading, connectionName]);
  useToolStatus(statusContent);

  const toggleExpanded = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmUnregister = (
    kind: "image" | "step" | "type" | "assembly",
    name: string,
    id: string,
  ) => {
    setConfirm({
      title: `Unregister ${kind}`,
      message: unregisterMessage(kind, name, id, connectionName, catalogQuery.data),
      confirmLabel: "Unregister",
      successMessage: `${kind[0]?.toUpperCase()}${kind.slice(1)} unregistered.`,
      run: () => unregister.mutateAsync({ kind, id }),
    });
  };

  const runAction = (action: NodeAction, node: TreeNode) => {
    if (action.disabledReason) {
      showToast(action.disabledReason, "info");
      return;
    }

    switch (action.id) {
      case "register-step":
        if (node.kind === "type") setStepDialog({ pluginTypeId: node.data.id });
        break;
      case "update-step":
        if (node.kind === "step") {
          setStepDialog({ pluginTypeId: node.data.pluginTypeId, step: node.data });
        }
        break;
      case "enable-step":
        if (node.kind === "step") {
          setConfirm({
            title: "Enable step",
            message: `Enable “${node.data.name}” on ${connectionName}?`,
            confirmLabel: "Enable",
            successMessage: "Step updated.",
            run: () => stepMutations.enable.mutateAsync(node.data.id),
          });
        }
        break;
      case "disable-step":
        if (node.kind === "step") {
          setConfirm({
            title: "Disable step",
            message: `Disable “${node.data.name}” on ${connectionName}?`,
            confirmLabel: "Disable",
            successMessage: "Step updated.",
            run: () => stepMutations.disable.mutateAsync(node.data.id),
          });
        }
        break;
      case "register-image":
        if (node.kind === "step") setImageDialog({ step: node.data });
        break;
      case "update-image":
        if (node.kind === "image") {
          const parent = catalogQuery.data?.steps.find((item) => item.id === node.data.stepId);
          if (parent) setImageDialog({ step: parent, image: node.data });
        }
        break;
      case "update-assembly":
        if (node.kind === "assembly") setAssemblyDialog({ assembly: node.data });
        break;
      case "unregister-image":
        if (node.kind === "image") confirmUnregister("image", node.data.name, node.data.id);
        break;
      case "unregister-step":
        if (node.kind === "step") confirmUnregister("step", node.data.name, node.data.id);
        break;
      case "unregister-type":
        if (node.kind === "type") {
          confirmUnregister("type", typeLabel(node.data), node.data.id);
        }
        break;
      case "unregister-assembly":
        if (node.kind === "assembly") confirmUnregister("assembly", node.data.name, node.data.id);
        break;
      default:
        break;
    }
  };

  const activateNode = (node: TreeNode) => {
    if (node.kind === "step") {
      runAction({ id: "update-step", label: "Update step" }, node);
    }
    if (node.kind === "image") {
      runAction({ id: "update-image", label: "Update image" }, node);
    }
    if (node.kind === "assembly") {
      runAction({ id: "update-assembly", label: "Update assembly" }, node);
    }
  };

  const openMenu = (event: MouseEvent, node: TreeNode) => {
    setMenu({ x: event.clientX, y: event.clientY, node });
  };

  let emptyMessage = "Select a connection to load plug-in registrations.";
  if (connectionName && catalogQuery.isLoading) emptyMessage = "Loading registrations…";
  else if (connectionName && catalogQuery.isError) {
    emptyMessage =
      catalogQuery.error instanceof Error
        ? catalogQuery.error.message
        : "The catalog could not be loaded.";
  } else if (connectionName && tree.length === 0) {
    emptyMessage = "No plug-in assemblies found.";
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 gap-4 text-[var(--color-text-gray)] overflow-hidden">
      <ToolHeader
        connectionName={connectionName}
        onConnectionChange={setConnectionName}
        search={search}
        onSearchChange={setSearch}
        showSystem={showSystem}
        onShowSystemChange={setShowSystem}
        onRefresh={() => {
          void catalogQuery.refetch();
          void stepOptionsQuery.refetch();
        }}
        refreshDisabled={
          !connectionName || catalogQuery.isFetching || stepOptionsQuery.isFetching
        }
        onRegisterAssembly={() => setAssemblyDialog({})}
        registerAssemblyDisabled={!connectionName}
      />

      <Group className="flex flex-1 min-h-0">
        <Panel defaultSize="65%" minSize="15%" className="flex flex-col min-h-0 bg-[var(--color-bg-darker)]">
          <RegistrationTree
            nodes={tree}
            expanded={expanded}
            selectedId={selectedId}
            onToggle={toggleExpanded}
            onSelect={setSelectedId}
            onActivate={activateNode}
            onContextMenu={openMenu}
            emptyMessage={emptyMessage}
          />
        </Panel>
        <Separator className="w-1 mx-1 cursor-col-resize bg-[var(--color-bg-light)] hover:bg-[var(--color-primary)] active:bg-[var(--color-primary)] transition-colors" />
        <Panel minSize="15%" className="flex flex-col min-h-0 bg-[var(--color-bg-darker)]">
          <NodeDetails node={selectedNode} />
        </Panel>
      </Group>

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          actions={getNodeActions(menu.node)}
          onSelect={(action) => runAction(action, menu.node)}
          onClose={() => setMenu(null)}
        />
      ) : null}

      {stepDialog && connectionName ? (
        <StepDialog
          open
          connectionName={connectionName}
          pluginTypeId={stepDialog.pluginTypeId}
          step={stepDialog.step}
          onClose={() => setStepDialog(null)}
        />
      ) : null}

      {imageDialog && connectionName ? (
        <ImageDialog
          open
          connectionName={connectionName}
          step={imageDialog.step}
          image={imageDialog.image}
          onClose={() => setImageDialog(null)}
        />
      ) : null}

      {assemblyDialog && connectionName ? (
        <AssemblyDialog
          open
          connectionName={connectionName}
          assembly={assemblyDialog.assembly}
          onClose={() => setAssemblyDialog(null)}
        />
      ) : null}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title ?? ""}
        message={confirm?.message ?? ""}
        confirmLabel={confirm?.confirmLabel ?? "Confirm"}
        isPending={
          stepMutations.enable.isPending ||
          stepMutations.disable.isPending ||
          unregister.isPending
        }
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          void confirm
            .run()
            .then(() => {
              showToast(confirm.successMessage, "success");
              setConfirm(null);
            })
            .catch((error) => showToast(toRegistrationError(error).message, "error"));
        }}
      />
    </div>
  );
}

function unregisterMessage(
  kind: "image" | "step" | "type" | "assembly",
  name: string,
  id: string,
  connectionName: string,
  catalog?: CatalogDto,
): string {
  const intro = `Unregister the ${kind} “${name}” from ${connectionName}?`;
  if (!catalog) return intro;
  if (kind === "step") {
    const images = catalog.images.filter((image) => image.stepId === id).length;
    return images === 0
      ? intro
      : `${intro} This also deletes ${images} related image${images === 1 ? "" : "s"}.`;
  }
  if (kind === "type") {
    const steps = catalog.steps.filter((step) => step.pluginTypeId === id).length;
    return `${intro} This type has ${steps} step${steps === 1 ? "" : "s"}.`;
  }
  if (kind === "assembly") {
    const types = catalog.types.filter((type) => type.assemblyId === id);
    const steps = catalog.steps.filter((step) =>
      types.some((type) => type.id === step.pluginTypeId),
    ).length;
    return `${intro} This assembly has ${types.length} type${types.length === 1 ? "" : "s"} and ${steps} step${steps === 1 ? "" : "s"}.`;
  }
  return intro;
}
