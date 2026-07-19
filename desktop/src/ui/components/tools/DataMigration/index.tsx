import { useEffect, useState } from "react";
import { ToastProvider, useToast } from "../../ui/Toast";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useStatusBar } from "../../../context/StatusBarContext";
import { ConnectionsBar } from "./ConnectionsBar";
import { MigrationOptions, type MigrationMode } from "./MigrationOptions";
import { EntityListPanel } from "./EntityListPanel";
import { FieldsPanel } from "./FieldsPanel";
import { FilterModal } from "./FilterModal";
import { PreviewModal } from "./PreviewModal";
import { MigrationStatusItem } from "./MigrationStatusItem";
import { useStartMigration, useMigrationJob } from "../../../api/hooks/useMigrationJob";
import type { EntityInfo } from "../../../api/hooks/useEntities";

export default function DataMigration() {
  return (
    <ToastProvider>
      <DataMigrationPage />
    </ToastProvider>
  );
}

function DataMigrationPage() {
  const [sourceName, setSourceName] = useState("");
  const [targetName, setTargetName] = useState("");
  const [entity, setEntity] = useState<EntityInfo | null>(null);
  const [attributes, setAttributes] = useState<string[]>([]);
  const [fetchFilter, setFetchFilter] = useState("");
  const [doCreate, setDoCreate] = useState(true);
  const [doUpdate, setDoUpdate] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [runningEntity, setRunningEntity] = useState("");

  const { showToast } = useToast();
  const { setStatus, clearStatus } = useStatusBar();
  const { mutate: startMigration, isPending } = useStartMigration();
  const { data: job } = useMigrationJob(jobId);

  // Autofill source from the active connection on first open.
  useEffect(() => {
    window.electron.getActiveConnection().then((res) => {
      if ("name" in res) setSourceName((prev) => prev || res.name);
    });
  }, []);

  // Metadata hooks now sign each request with the chosen source connection
  // via `meta.connectionName`, so we just reset dependent local state here
  // without mutating the global active connection.
  const changeSource = (name: string) => {
    setSourceName(name);
    setEntity(null);
    setAttributes([]);
    setFetchFilter("");
  };

  const selectEntity = (e: EntityInfo) => {
    setEntity(e);
    setAttributes([]);
    setFetchFilter("");
  };

  // Mirror job progress into the status bar.
  useEffect(() => {
    if (!job) return;
    setStatus("data-migration", <MigrationStatusItem entityLogicalName={runningEntity} job={job} />);
  }, [job, runningEntity, setStatus]);

  useEffect(() => () => clearStatus("data-migration"), [clearStatus]);

  const mode: MigrationMode = doCreate && doUpdate ? "upsert" : doUpdate ? "update" : "create";
  const isRunning = job?.status === "queued" || job?.status === "running";
  const canStart =
    !!sourceName &&
    !!targetName &&
    sourceName !== targetName &&
    !!entity &&
    attributes.length > 0 &&
    (doCreate || doUpdate) &&
    !isPending &&
    !isRunning;

  const handleStart = () => {
    if (!entity) return;
    startMigration(
      {
        entityLogicalName: entity.logicalName,
        attributes,
        fetchXmlFilter: fetchFilter || undefined,
        mode,
        sourceConnectionName: sourceName,
        targetConnectionName: targetName,
      },
      {
        onSuccess: (res) => {
          setRunningEntity(entity.logicalName);
          setJobId(res.jobId);
        },
        onError: (err) => showToast((err as Error).message, "error"),
      },
    );
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 gap-4 text-[#cccccc] overflow-hidden">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <ConnectionsBar
          sourceName={sourceName}
          targetName={targetName}
          onSourceChange={changeSource}
          onTargetChange={setTargetName}
        />
        <MigrationOptions
          doCreate={doCreate}
          doUpdate={doUpdate}
          onCreateChange={setDoCreate}
          onUpdateChange={setDoUpdate}
          hasFilter={!!fetchFilter.trim()}
          filterDisabled={!entity}
          onOpenFilter={() => setFilterOpen(true)}
          previewDisabled={!entity || attributes.length === 0}
          onOpenPreview={() => setPreviewOpen(true)}
          startDisabled={!canStart}
          isStarting={isPending}
          onStart={handleStart}
        />
      </div>

      <Group className="flex flex-1 min-h-0">
        <Panel defaultSize="35%" minSize="15%" className="flex flex-col min-h-0">
          <EntityListPanel connectionName={sourceName || null} selected={entity} onSelect={selectEntity} />
        </Panel>
        <Separator className="w-1 mx-1 cursor-col-resize bg-(--color-bg-light) hover:bg-(--color-primary) active:bg-(--color-primary) transition-colors" />
        <Panel minSize="15%" className="flex flex-col min-h-0">
          <FieldsPanel
            entityLogicalName={entity?.logicalName ?? null}
            connectionName={sourceName || null}
            selected={attributes}
            onChange={setAttributes}
          />
        </Panel>
      </Group>

      {entity && (
        <FilterModal
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
          entityLogicalName={entity.logicalName}
          selectedAttributes={attributes}
          value={fetchFilter}
          onApply={(f) => {
            setFetchFilter(f);
            setFilterOpen(false);
          }}
        />
      )}

      {entity && (
        <PreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          connectionName={sourceName}
          entityLogicalName={entity.logicalName}
          attributes={attributes}
          fetchXmlFilter={fetchFilter}
        />
      )}
    </div>
  );
}
