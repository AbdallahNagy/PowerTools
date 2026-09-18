import { useEffect, useMemo, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Spinner, ToastProvider } from "../../shared/ui";
import { useConnectionSelection } from "../../shared/connections";
import { useToolStatus } from "../../shared/status";
import { useCapabilities } from "./api/useCapabilities";
import { useCatalog } from "./api/useCatalog";
import { ToolHeader } from "./components/ToolHeader";
import { RegistrationTree } from "./components/RegistrationTree";
import { NodeDetails } from "./components/NodeDetails";
import { buildCatalogTree, findNode } from "./model/catalogTree";

export default function PluginRegistration() {
  return (
    <ToastProvider>
      <PluginRegistrationPage />
    </ToastProvider>
  );
}

function PluginRegistrationPage() {
  const { connectionName, setConnectionName } = useConnectionSelection();
  const [search, setSearch] = useState("");
  const [showSystem, setShowSystem] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const catalogQuery = useCatalog(connectionName || null);
  useCapabilities(connectionName || null);

  useEffect(() => {
    setExpanded(new Set());
    setSelectedId(null);
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

  const changeConnection = (name: string) => {
    setConnectionName(name);
  };

  const toggleExpanded = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
        onConnectionChange={changeConnection}
        search={search}
        onSearchChange={setSearch}
        showSystem={showSystem}
        onShowSystemChange={setShowSystem}
        onRefresh={() => {
          void catalogQuery.refetch();
        }}
        refreshDisabled={!connectionName || catalogQuery.isFetching}
        onRegisterAssembly={() => undefined}
        registerAssemblyDisabled
      />

      <Group className="flex flex-1 min-h-0">
        <Panel defaultSize="35%" minSize="15%" className="flex flex-col min-h-0 bg-[var(--color-bg-darker)]">
          <RegistrationTree
            nodes={tree}
            expanded={expanded}
            selectedId={selectedId}
            onToggle={toggleExpanded}
            onSelect={setSelectedId}
            emptyMessage={emptyMessage}
          />
        </Panel>
        <Separator className="w-1 mx-1 cursor-col-resize bg-[var(--color-bg-light)] hover:bg-[var(--color-primary)] active:bg-[var(--color-primary)] transition-colors" />
        <Panel minSize="15%" className="flex flex-col min-h-0 bg-[var(--color-bg-darker)]">
          <NodeDetails node={selectedNode} />
        </Panel>
      </Group>
    </div>
  );
}
