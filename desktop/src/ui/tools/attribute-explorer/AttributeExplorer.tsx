import { Group, Panel, Separator } from "react-resizable-panels";
import { RotateCw } from "lucide-react";
import { useToolStatus } from "../../shared/status";
import { Button, Spinner, ToastProvider } from "../../shared/ui";
import { FieldDetailsModal } from "./components/FieldDetailsModal";
import { FieldsPane } from "./components/FieldsPane";
import { TablesPane } from "./components/TablesPane";
import { useAttributeExplorer } from "./useAttributeExplorer";

export default function AttributeExplorer() {
  return (
    <ToastProvider>
      <AttributeExplorerPage />
    </ToastProvider>
  );
}

function AttributeExplorerPage() {
  const explorer = useAttributeExplorer();
  useToolStatus(explorer.status);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-canvas">
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <Button
          type="button"
          variant="secondary"
          className="inline-flex items-center gap-2"
          disabled={!explorer.connectionName || explorer.busy}
          onClick={() => void explorer.refresh()}
        >
          {explorer.busy ? <Spinner size={14} /> : <RefreshIcon />}
          Refresh metadata
        </Button>
      </div>
      <Group orientation="horizontal" className="flex min-h-0 flex-1">
        <Panel
          defaultSize="30%"
          minSize="20%"
          className="flex min-h-0 min-w-0 flex-col bg-surface"
        >
          <TablesPane
            hasConnection={!!explorer.connectionName}
            tables={explorer.tables}
            loading={explorer.tablesLoading}
            errorText={explorer.tablesError}
            query={explorer.tableQuery}
            onQueryChange={explorer.setTableQuery}
            selectedName={explorer.selectedTable?.logicalName ?? null}
            onSelect={explorer.selectTable}
            onRetry={explorer.retryTables}
          />
        </Panel>
        <Separator
          aria-label="Resize panes"
          className="w-1 cursor-col-resize bg-raised hover:bg-accent active:bg-accent"
        />
        <Panel minSize="30%" className="flex min-h-0 min-w-0 flex-col bg-surface">
          <FieldsPane
            hasConnection={!!explorer.connectionName}
            table={explorer.selectedTable}
            fields={explorer.fields}
            totalFields={explorer.totalFields}
            loading={explorer.fieldsLoading}
            errorText={explorer.fieldsError}
            query={explorer.fieldQuery}
            onQueryChange={explorer.setFieldQuery}
            sort={explorer.sort}
            onSort={explorer.toggleSort}
            onOpenField={(field) => explorer.openFieldByName(field.logicalName)}
            onRetry={explorer.retryFields}
          />
        </Panel>
      </Group>
      <FieldDetailsModal
        field={explorer.openField}
        knownTables={explorer.knownTables}
        onClose={explorer.closeField}
        onOpenTable={explorer.openRelatedTable}
      />
    </div>
  );
}

function RefreshIcon() {
  return (
    <RotateCw size={14} aria-hidden="true" />
  );
}
