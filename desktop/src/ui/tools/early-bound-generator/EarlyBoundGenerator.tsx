import { Group, Panel, Separator } from "react-resizable-panels";
import { useToolStatus } from "../../shared/status";
import { Button, Input, Spinner, ToastProvider, Toolbar, Tooltip } from "../../shared/ui";
import { ConfirmFolderModal } from "./components/ConfirmFolderModal";
import { OutputPanel } from "./components/OutputPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { toEarlyBoundGeneratorError } from "./model/apiError";
import { useEarlyBoundGenerator } from "./state/useEarlyBoundGenerator";

export default function EarlyBoundGenerator() {
  return (
    <ToastProvider>
      <EarlyBoundGeneratorPage />
    </ToastProvider>
  );
}

function EarlyBoundGeneratorPage() {
  const generator = useEarlyBoundGenerator();
  useToolStatus(generator.status);

  const { running, disabledReason } = generator;
  const generateButton = (
    <Button disabled={running || disabledReason !== null} onClick={generator.requestGenerate}>
      {running ? (
        <>
          <Spinner size={14} className="text-accent-fg" />
          Generating...
        </>
      ) : (
        "Generate"
      )}
    </Button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-canvas">
      <Toolbar
        aria-label="Early Bound Generator"
        end={
          disabledReason && !running ? (
            <Tooltip content={disabledReason}>
              <span tabIndex={0} aria-label={disabledReason} className="inline-flex rounded-sm">
                {generateButton}
              </span>
            </Tooltip>
          ) : (
            generateButton
          )
        }
      >
        <label htmlFor="ebg-output-folder" className="shrink-0 text-xs font-medium text-fg-muted">
          Output folder
        </label>
        <Input
          id="ebg-output-folder"
          readOnly
          value={generator.folder ?? ""}
          placeholder="No folder chosen"
          title={generator.folder ?? undefined}
          className="min-w-0 max-w-xl flex-1 font-mono text-xs text-left [direction:rtl]"
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={running}
          onClick={() => void generator.chooseFolder()}
        >
          Choose folder...
        </Button>
      </Toolbar>
      <Group orientation="horizontal" className="flex min-h-0 flex-1">
        <Panel defaultSize="45%" minSize="30%" className="flex min-h-0 min-w-0 flex-col">
          <SettingsPanel
            settings={generator.settings}
            errors={generator.errors}
            onChange={generator.update}
            disabled={running}
            tables={generator.tables}
            tablesLoading={generator.tablesQuery.isLoading}
            tablesError={generator.tablesQuery.isError ? toEarlyBoundGeneratorError(generator.tablesQuery.error) : null}
            onRetryTables={() => void generator.tablesQuery.refetch()}
            settingsFileError={generator.folderInfo?.settingsError ?? null}
          />
        </Panel>
        <Separator
          aria-label="Resize panes"
          className="w-1 cursor-col-resize bg-raised hover:bg-accent active:bg-accent"
        />
        <Panel defaultSize="55%" minSize="30%" className="flex min-h-0 min-w-0 flex-col">
          <OutputPanel
            command={generator.command}
            run={generator.run}
            hasConnection={!!generator.connectionName}
            onOpenFolder={(path) => void generator.openFolder(path)}
          />
        </Panel>
      </Group>
      <ConfirmFolderModal
        open={generator.confirmOpen}
        onCancel={generator.closeConfirm}
        onConfirm={generator.confirmGenerate}
      />
    </div>
  );
}
