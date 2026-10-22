import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { ToastProvider, useToast } from "../../shared/ui";
import { Group, Panel, Separator } from "react-resizable-panels";
import { ConnectionsBar } from "./components/ConnectionsBar";
import { MigrationOptions, type MigrationMode } from "./components/MigrationOptions";
import { EntityListPanel } from "./components/EntityListPanel";
import { FieldsPanel } from "./components/FieldsPanel";
import { FilterModal } from "./components/FilterModal";
import { PreviewModal } from "./components/PreviewModal";
import { MigrationStatusItem } from "./components/MigrationStatusItem";
import { MigrationRunBanner } from "./components/MigrationRunBanner";
import type { TargetItem } from "./components/TargetChip";
import {
  useStartMigration,
  useMigrationJob,
  type MigrationJobStatus,
} from "./api/useMigrationJob";
import {
  isJobActive,
  nextTarget,
  settingsKey,
  targetState,
  type MigrationSettings,
} from "./model/targetRun";
import type { EntityInfo } from "../../shared/contracts/dataverse";
import { useConnections, useTabConnection } from "../../shared/connections";
import { usePrimaryAction } from "../../shared/keyboard";
import { useToolStatus } from "../../shared/status";

export default function DataMigration() {
  return (
    <ToastProvider>
      <DataMigrationPage />
    </ToastProvider>
  );
}

interface MigrationRun {
  key: string;
  /** Finished jobs by target connection id. */
  results: Record<string, MigrationJobStatus>;
}

interface LastJob {
  jobId: string;
  targetId: string;
  entityLogicalName: string;
  key: string;
}

const NO_RESULTS: Record<string, MigrationJobStatus> = {};

function DataMigrationPage() {
  const { connectionId: sourceName, setConnectionId: setSourceName } =
    useTabConnection();
  const { connections } = useConnections();
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [entity, setEntity] = useState<EntityInfo | null>(null);
  const [attributes, setAttributes] = useState<string[]>([]);
  const [fetchFilter, setFetchFilter] = useState("");
  const [doCreate, setDoCreate] = useState(true);
  const [doUpdate, setDoUpdate] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [run, setRun] = useState<MigrationRun | null>(null);
  const [lastJob, setLastJob] = useState<LastJob | null>(null);
  const { showToast } = useToast();
  const { mutate: startMigration, isPending } = useStartMigration();
  const { data: job, isError: jobLost } = useMigrationJob(lastJob?.jobId ?? null);

  const nameOf = useCallback(
    (id: string) => connections.find((c) => c.id === id)?.displayName ?? "",
    [connections],
  );
  const statusContent = useMemo(
    () =>
      job && lastJob ? (
        <MigrationStatusItem
          entityLogicalName={lastJob.entityLogicalName}
          targetName={nameOf(lastJob.targetId)}
          job={job}
        />
      ) : null,
    [job, lastJob, nameOf],
  );
  useToolStatus(statusContent);

  // Source is this tab's connection. Changing it here or from the tab menu
  // resets entity state and leaves the active connection alone.
  useEffect(() => {
    setEntity(null);
    setAttributes([]);
    setFetchFilter("");
  }, [sourceName]);

  // Keep each finished job with its run so the target shows where data went.
  // Layout effect, so a target never paints as pending between running and done.
  useLayoutEffect(() => {
    if (!lastJob || !job || isJobActive(job)) return;
    setRun((r) =>
      r && r.key === lastJob.key && r.results[lastJob.targetId] !== job
        ? { ...r, results: { ...r.results, [lastJob.targetId]: job } }
        : r,
    );
  }, [job, lastJob]);

  const changeSource = (name: string) => {
    setSourceName(name);
  };

  const selectEntity = (e: EntityInfo) => {
    setEntity(e);
    setAttributes([]);
    setFetchFilter("");
  };

  const mode: MigrationMode = doCreate && doUpdate ? "upsert" : doUpdate ? "update" : "create";
  const settings: MigrationSettings | null =
    entity && sourceName
      ? {
          entityLogicalName: entity.logicalName,
          attributes,
          fetchXmlFilter: fetchFilter || undefined,
          mode,
          sourceConnectionId: sourceName,
        }
      : null;
  const key = settings ? settingsKey(settings) : null;
  const results = run && run.key === key ? run.results : NO_RESULTS;
  const isRunning = !!lastJob && !jobLost && (!job || isJobActive(job));
  const runningTargetId = isRunning ? lastJob.targetId : null;

  // Connections can be removed elsewhere, and the source cannot be a target.
  const targets = targetIds.filter(
    (id) => id !== sourceName && connections.some((c) => c.id === id),
  );
  const next = nextTarget(targets, results, runningTargetId);
  const canMigrateTo = (targetId: string) =>
    !!settings &&
    targetId !== sourceName &&
    attributes.length > 0 &&
    (doCreate || doUpdate) &&
    !isPending &&
    !isRunning;
  const canStart = !!next && canMigrateTo(next);

  const migrateTo = (targetId: string) => {
    if (!settings || !key || !canMigrateTo(targetId)) return;
    startMigration(
      { ...settings, targetConnectionId: targetId },
      {
        onSuccess: (res) => {
          setRun((r) => {
            const kept = { ...(r && r.key === key ? r.results : {}) };
            delete kept[targetId];
            return { key, results: kept };
          });
          setLastJob({
            jobId: res.jobId,
            targetId,
            entityLogicalName: settings.entityLogicalName,
            key,
          });
        },
        onError: (err) => showToast((err as Error).message, "error"),
      },
    );
  };

  const handleStart = () => {
    if (next) migrateTo(next);
  };

  const startLabel =
    targets.length === 0
      ? "Start Migration"
      : next
        ? `Migrate to ${nameOf(next)}`
        : isRunning
          ? `Migrating to ${nameOf(runningTargetId ?? "")}`
          : "All targets migrated";

  usePrimaryAction({
    label: startLabel,
    enabled: canStart,
    run: handleStart,
  });

  const targetItems: TargetItem[] = targets.map((id, i) => {
    const running = id === runningTargetId;
    return {
      id,
      name: nameOf(id),
      step: i + 1,
      state: targetState(results[id], running),
      job: running ? job : results[id],
      isNext: id === next,
      canMigrate: canMigrateTo(id),
    };
  });

  // The banner follows the last job while its settings are still the current ones.
  const bannerJob =
    lastJob && lastJob.key === key && targets.includes(lastJob.targetId)
      ? isRunning
        ? job
        : results[lastJob.targetId]
      : undefined;

  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 gap-4 text-fg overflow-hidden">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <ConnectionsBar
          connections={connections}
          sourceName={sourceName ?? ""}
          onSourceChange={changeSource}
          targets={targetItems}
          onAddTarget={(id) => setTargetIds((ids) => [...ids.filter((t) => t !== id), id])}
          onRemoveTarget={(id) => setTargetIds((ids) => ids.filter((t) => t !== id))}
          onMigrateTarget={migrateTo}
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
          startLabel={startLabel}
          startDisabled={!canStart}
          isStarting={isPending}
          onStart={handleStart}
        />
      </div>

      {bannerJob && lastJob && (
        <MigrationRunBanner
          entityLogicalName={lastJob.entityLogicalName}
          targetName={nameOf(lastJob.targetId)}
          job={bannerJob}
          next={next ? { id: next, name: nameOf(next) } : null}
          targetCount={targets.length}
          canRetry={canMigrateTo(lastJob.targetId)}
          onRetry={() => migrateTo(lastJob.targetId)}
          onStartOver={() => setRun(null)}
        />
      )}

      <Group className="flex flex-1 min-h-0">
        <Panel defaultSize="35%" minSize="15%" className="flex flex-col min-h-0">
          <EntityListPanel connectionId={sourceName || null} selected={entity} onSelect={selectEntity} />
        </Panel>
        <Separator className="w-1 mx-1 cursor-col-resize bg-raised hover:bg-accent active:bg-accent transition-colors" />
        <Panel minSize="15%" className="flex flex-col min-h-0">
          <FieldsPanel
            entityLogicalName={entity?.logicalName ?? null}
            connectionId={sourceName || null}
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
          connectionId={sourceName ?? ""}
          entityLogicalName={entity.logicalName}
          attributes={attributes}
          fetchXmlFilter={fetchFilter}
        />
      )}
    </div>
  );
}
