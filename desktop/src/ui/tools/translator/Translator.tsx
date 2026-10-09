import { useMemo } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { RotateCw } from "lucide-react";
import { useToolStatus } from "../../shared/status";
import { Button, EmptyState, Select, ToastProvider, Toolbar, Tooltip } from "../../shared/ui";
import { ApplyModal } from "./components/ApplyModal";
import { ConfirmModal } from "./components/ConfirmModal";
import { LabelGrid } from "./components/LabelGrid";
import { LanguagesModal } from "./components/LanguagesModal";
import { ScopeList } from "./components/ScopeList";
import type { ShowFilter } from "./model/grid";
import { plural } from "./model/labels";
import { useTranslator } from "./state/useTranslator";

export default function Translator() {
  return (
    <ToastProvider>
      <TranslatorPage />
    </ToastProvider>
  );
}

function TranslatorPage() {
  const translator = useTranslator();
  useToolStatus(translator.status);

  const visibleLcids = useMemo(
    () => new Set(translator.visibleLanguages.map((language) => language.lcid)),
    [translator.visibleLanguages],
  );
  const selectedTable = useMemo(
    () => translator.tables.find((table) => table.logicalName === translator.scope) ?? null,
    [translator.scope, translator.tables],
  );

  const hasConnection = !!translator.connectionName;
  const ready = hasConnection && !translator.firstLoading && !translator.firstError;
  const edits = translator.editedCount;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-canvas">
      <Toolbar
        aria-label="Translator"
        end={
          <>
            <Button variant="ghost" size="sm" disabled={edits === 0} onClick={translator.requestDiscard}>
              Discard changes
            </Button>
            <Button
              disabled={edits === 0 || translator.invalid > 0}
              onClick={translator.openApply}
            >
              {edits === 0 ? "Apply changes" : `Apply ${plural(edits, "change")}`}
            </Button>
            <Tooltip content="Reload labels">
              <Button
                variant="ghost"
                size="sm"
                aria-label="Reload labels"
                disabled={!hasConnection}
                onClick={translator.requestReload}
              >
                <RotateCw size={14} aria-hidden="true" />
              </Button>
            </Tooltip>
          </>
        }
      >
        <span className="text-xs text-fg-muted" aria-hidden="true">
          Show
        </span>
        <Select
          aria-label="Show"
          className="w-48"
          value={translator.show}
          disabled={!ready}
          onChange={(event) => translator.setShow(event.target.value as ShowFilter)}
        >
          <option value="both">Names and descriptions</option>
          <option value="names">Names only</option>
          <option value="descriptions">Descriptions only</option>
        </Select>
        <Button
          variant="secondary"
          size="sm"
          disabled={!ready}
          onClick={() => translator.setLanguagesOpen(true)}
        >
          {`Languages (${translator.visibleLanguages.length} of ${translator.languages.length})`}
        </Button>
      </Toolbar>
      {!hasConnection ? (
        <EmptyState className="flex-1" title="Right-click this tab and choose Change connection." />
      ) : (
        <Group orientation="horizontal" className="flex min-h-0 flex-1">
          <Panel
            defaultSize="260px"
            minSize="200px"
            maxSize="40%"
            className="flex min-h-0 min-w-0 flex-col bg-surface"
          >
            <ScopeList
              hasConnection={hasConnection}
              loading={translator.firstLoading}
              errorText={translator.firstError}
              onRetry={translator.retryFirstLoad}
              tables={translator.tables}
              globalCount={translator.globalCount}
              query={translator.tableQuery}
              onQueryChange={translator.setTableQuery}
              selected={translator.scope}
              onSelect={translator.selectScope}
              editsByScope={translator.draftsByScope}
              source={translator.source}
              solutions={translator.solutions}
              solutionsLoading={translator.solutionsLoading}
              solutionsError={translator.solutionsError}
              onRetrySolutions={translator.retrySolutions}
              onSourceChange={translator.requestSource}
            />
          </Panel>
          <Separator
            aria-label="Resize panes"
            className="w-1 cursor-col-resize bg-raised hover:bg-accent active:bg-accent"
          />
          <Panel minSize="50%" className="flex min-h-0 min-w-0 flex-col bg-surface">
            {ready ? (
              <LabelGrid
                scope={translator.scope}
                table={selectedTable}
                tab={translator.tab}
                onTabChange={translator.setTab}
                editsByTab={translator.draftsByTab}
                rows={translator.rows}
                visibleRows={translator.visibleRows}
                loading={translator.gridLoading}
                errorText={translator.gridError}
                onRetry={translator.retryGrid}
                query={translator.gridQuery}
                onQueryChange={translator.setGridQuery}
                sort={translator.sort}
                onSort={translator.toggleSort}
                languages={translator.visibleLanguages}
                baseLcid={translator.baseLcid}
                drafts={translator.drafts}
                onEdit={translator.editCell}
              />
            ) : (
              <EmptyState className="flex-1" title="Select a table or Global choices to see its labels." />
            )}
          </Panel>
        </Group>
      )}
      <LanguagesModal
        open={translator.languagesOpen}
        languages={translator.languages}
        baseLcid={translator.baseLcid}
        visible={visibleLcids}
        onToggle={translator.toggleLanguage}
        onAll={translator.showAllLanguages}
        onBaseOnly={translator.showBaseOnly}
        onClose={() => translator.setLanguagesOpen(false)}
      />
      <ConfirmModal
        open={translator.confirm === "discard"}
        title="Discard changes"
        message={`Discard ${plural(edits, "unsaved label change")}?`}
        confirmLabel="Discard"
        onConfirm={translator.confirmDiscard}
        onCancel={() => translator.setConfirm(null)}
      />
      <ConfirmModal
        open={translator.confirm === "reload"}
        title="Reload labels"
        message={`Reloading discards ${plural(edits, "unsaved change")}.`}
        confirmLabel="Discard and reload"
        onConfirm={() => void translator.reload()}
        onCancel={() => translator.setConfirm(null)}
      />
      <ConfirmModal
        open={translator.confirm === "source"}
        title="Change source"
        message={`Changing the source discards ${plural(edits, "unsaved change")}.`}
        confirmLabel="Discard and change"
        onConfirm={translator.confirmSource}
        onCancel={() => translator.setConfirm(null)}
      />
      <ApplyModal
        state={translator.apply}
        drafts={translator.drafts}
        languages={translator.languages}
        solutionOption={
          translator.solutionOptionAvailable
            ? {
                target: translator.solutionTarget,
                onChange: translator.setSolutionTarget,
                errors: translator.solutionErrors,
                solutions: translator.unmanagedSolutions,
                solutionsLoading: translator.solutionsLoading,
                solutionsError: translator.solutionsError,
                publishers: translator.publishers,
                publishersLoading: translator.publishersLoading,
                publishersError: translator.publishersError,
              }
            : null
        }
        onConfirm={() => void translator.confirmApply()}
        onClose={translator.closeApply}
        onRetryPublish={() => void translator.retryPublish()}
      />
    </div>
  );
}
