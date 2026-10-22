import { useCallback, useMemo } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { RotateCw, X } from "lucide-react";
import { useToolStatus } from "../../shared/status";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  ProgressBar,
  Select,
  Spinner,
  Tabs,
  ToastProvider,
  Toolbar,
} from "../../shared/ui";
import { CommandBarView } from "./components/CommandBarView";
import { DetailsPane } from "./components/details/DetailsPane";
import { CommandsTab, LabelsTab, ProblemsTab, RulesTab } from "./components/ItemTabs";
import { DiscardModal, PublishModal } from "./components/Modals";
import { TablesPane } from "./components/TablesPane";
import { plural } from "./model/apiError";
import { baseCommandIds, buildCommandBar } from "./model/commandBar";
import { items } from "./model/diff";
import { attr } from "./model/node";
import { APPLICATION_KEY } from "./model/types";
import { useRibbonWorkbench, type Banner, type RibbonWorkbenchState, type WorkspaceTab } from "./state/useRibbonWorkbench";

export default function RibbonWorkbench() {
  return (
    <ToastProvider>
      <RibbonWorkbenchPage />
    </ToastProvider>
  );
}

const PHASES: Record<string, string> = {
  exporting: "Exporting the solution",
  importing: "Importing",
  publishing: "Publishing",
  done: "Finishing",
};

function RibbonWorkbenchPage() {
  const state = useRibbonWorkbench();
  useToolStatus(state.status);

  const hasConnection = !!state.connectionId;
  const { data, load, publish } = state;
  const busy = state.publishing || publish.phase === "checking";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-canvas">
      <Toolbar
        aria-label="Ribbon Editor"
        end={
          <>
            {state.changes > 0 ? <Badge tone="warn">{plural(state.changes, "unsaved change")}</Badge> : null}
            <Button variant="secondary" size="sm" disabled={!data || busy} onClick={state.validate}>
              Validate
            </Button>
            <Button variant="ghost" size="sm" disabled={state.changes === 0 || busy} onClick={state.requestDiscard}>
              Discard changes
            </Button>
            <Button size="sm" disabled={state.changes === 0 || busy || !data?.canPublish} onClick={state.requestPublish}>
              Publish
            </Button>
          </>
        }
      >
        <Field label="Solution" className="flex-row items-center gap-2">
          <Select
            className="w-72"
            value={state.solutionName}
            disabled={!hasConnection || state.solutionsLoading || busy || load.status === "loading"}
            onChange={(event) => state.chooseSolution(event.target.value)}
          >
            <option value="">Choose a solution</option>
            {state.solutions.map((solution) => (
              <option key={solution.uniqueName} value={solution.uniqueName}>
                {`${solution.friendlyName} (${solution.uniqueName})`}
              </option>
            ))}
          </Select>
        </Field>
        {state.solutionsLoading ? <Spinner /> : null}
        <Button
          variant="ghost"
          size="sm"
          className="px-1"
          aria-label="Refresh solutions"
          title="Refresh solutions"
          disabled={!hasConnection || state.solutionsRefreshing || busy || load.status === "loading"}
          onClick={state.refreshSolutions}
        >
          <RotateCw size={16} strokeWidth={1.8} aria-hidden="true" />
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!state.solutionName || busy || load.status === "loading"}
          onClick={state.requestLoad}
        >
          {data && data.solution.uniqueName === state.solutionName ? "Reload" : "Load"}
        </Button>
      </Toolbar>
      <Banners state={state} />
      <Body state={state} />
      <DiscardModal
        open={state.confirm !== null}
        changes={state.changes}
        onConfirm={state.confirmDiscard}
        onCancel={() => state.setConfirm(null)}
      />
      <PublishModal
        open={publish.phase === "confirm"}
        friendlyName={data?.solution.friendlyName ?? ""}
        otherComponents={data?.otherComponents ?? []}
        onConfirm={state.confirmPublish}
        onCancel={state.cancelPublish}
      />
    </div>
  );
}

function Banners({ state }: { state: RibbonWorkbenchState }) {
  const { publish } = state;
  if (!state.publishing && state.banners.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 border-b border-line bg-surface px-3 py-2">
      {publish.phase === "running" ? (
        <div role="status" aria-label="Publish progress">
          <ProgressBar
            value={publish.job?.phase === "importing" ? publish.job.progress : publish.job?.phase === "publishing" ? 100 : 0}
            max={100}
            label={PHASES[publish.job?.phase ?? "exporting"]}
          />
        </div>
      ) : null}
      {state.banners.map((banner) => (
        <BannerAlert key={banner.id} banner={banner} state={state} />
      ))}
    </div>
  );
}

function BannerAlert({ banner, state }: { banner: Banner; state: RibbonWorkbenchState }) {
  const extra =
    banner.action === "publishAgain" ? (
      <Button variant="secondary" size="sm" disabled={state.publishingAgain} onClick={state.publishAgain}>
        Publish again
      </Button>
    ) : banner.action === "reload" ? (
      <Button variant="secondary" size="sm" onClick={state.reloadAfterConflict}>
        Reload
      </Button>
    ) : null;
  return (
    <Alert
      tone={banner.tone}
      title={banner.title}
      action={
        <div className="flex items-center gap-1">
          {extra}
          <Button variant="ghost" size="sm" className="px-1" aria-label="Dismiss" onClick={() => state.dismissBanner(banner.id)}>
            <X size={14} aria-hidden="true" />
          </Button>
        </div>
      }
    >
      <p>{banner.text}</p>
      {banner.details && banner.details.length > 0 ? (
        <ul className="mt-1 list-disc pl-5 text-xs">
          {banner.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      ) : null}
    </Alert>
  );
}

function Body({ state }: { state: RibbonWorkbenchState }) {
  const { load, data } = state;
  if (!state.connectionId) return <EmptyState className="flex-1" title="Connect to an environment to edit command bars." />;
  if (state.solutionsError) {
    return (
      <div className="p-3">
        <Alert
          tone="danger"
          action={
            <Button variant="secondary" size="sm" onClick={state.refreshSolutions}>
              Retry
            </Button>
          }
        >
          {state.solutionsError}
        </Alert>
      </div>
    );
  }
  if (!state.solutionsLoading && state.solutions.length === 0) {
    return (
      <EmptyState
        className="flex-1"
        title="No unmanaged solutions in this environment. Create one that contains the tables whose command bars you want to edit."
        action={
          <Button variant="secondary" size="sm" disabled={state.solutionsRefreshing} onClick={state.refreshSolutions}>
            Refresh
          </Button>
        }
      />
    );
  }
  if (load.status === "loading") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8" role="status">
        <Spinner size={28} />
        <p className="text-sm text-fg">Reading solution and command bars…</p>
      </div>
    );
  }
  if (load.status === "error") {
    return (
      <div className="p-3">
        <Alert
          tone="danger"
          action={
            <Button variant="secondary" size="sm" onClick={state.retryLoad}>
              Retry
            </Button>
          }
        >
          {load.message}
        </Alert>
      </div>
    );
  }
  if (!data) return <EmptyState className="flex-1" title="Choose an unmanaged solution, then Load, to see its tables and command bars." />;
  if (data.entities.length === 0) {
    return (
      <div className="p-3">
        <Alert tone="danger">This solution contains no tables. Add the tables whose command bars you want to edit, then reload.</Alert>
      </div>
    );
  }

  return (
    <Group orientation="horizontal" className="flex min-h-0 flex-1">
      <Panel defaultSize="240px" minSize="180px" className="flex min-h-0 min-w-0 flex-col bg-surface">
        <TablesPane
          tables={state.tables}
          query={state.tableQuery}
          onQueryChange={state.setTableQuery}
          selected={state.selectedKey}
          onSelect={state.selectTable}
          edited={state.editedKeys}
        />
      </Panel>
      <Separator aria-label="Resize tables pane" className="w-1 cursor-col-resize bg-raised hover:bg-accent active:bg-accent" />
      <Panel minSize="30%" className="flex min-h-0 min-w-0 flex-col bg-surface">
        <Workspace state={state} />
      </Panel>
      <Separator aria-label="Resize details pane" className="w-1 cursor-col-resize bg-raised hover:bg-accent active:bg-accent" />
      <Panel defaultSize="380px" minSize="280px" className="flex min-h-0 min-w-0 flex-col overflow-auto bg-surface p-3">
        <DetailsPane state={state} />
      </Panel>
    </Group>
  );
}

function Workspace({ state }: { state: RibbonWorkbenchState }) {
  const { base, currentDiff, selection } = state;
  const notSupported = state.selectedTable?.ribbonNotSupported ?? false;
  const solutionCommands = useMemo(
    () => new Set(items(currentDiff, "command").map((node) => attr(node, "Id") ?? "")),
    [currentDiff],
  );
  const baseCommandRefs = useMemo(
    () => baseCommandIds(buildCommandBar(base?.tabs ?? [], state.loadedDiff, currentDiff, null).tabs),
    [base, currentDiff, state.loadedDiff],
  );
  const allCommands = useMemo(() => [...items(currentDiff, "command"), ...(base?.commands ?? [])], [base, currentDiff]);
  const tableName = useCallback(
    (key: string) => state.tables.find((table) => table.key === key)?.displayName ?? key,
    [state.tables],
  );
  const select = (kind: "command" | "enableRule" | "displayRule" | "label") => (id: string) => state.setSelection({ kind, id });
  const selectedId = (kind: string) => (selection?.kind === kind ? selection.id : null);
  const baseLoading = state.baseLoading && !notSupported;

  const tabs = [
    {
      value: "commandBar",
      label: "Command bar",
      content: (
        <div className="flex h-full min-h-0 flex-col">
          {state.readOnlyReason && !notSupported && state.selectedKey ? (
            <div className="px-3 pt-2">
              <Alert tone="info">{state.readOnlyReason}</Alert>
            </div>
          ) : null}
          <CommandBarView
            commandBar={state.commandBar}
            labels={state.labels}
            location={state.location}
            locationOptions={state.locationOptions}
            onLocationChange={state.setLocation}
            loading={baseLoading}
            error={state.baseError}
            onRetry={state.retryBase}
            notSupported={notSupported}
            selectedId={selectedId("control")}
            onSelect={(id) => state.setSelection({ kind: "control", id })}
            canEdit={state.canEdit}
            solutionCommands={solutionCommands}
            onAdd={state.addChild}
            onHide={state.hideNode}
            onShow={state.showNode}
            onCustomise={state.customiseCommand}
            onDelete={state.deleteNode}
          />
        </div>
      ),
    },
    {
      value: "commands",
      label: "Commands",
      content: (
        <CommandsTab
          diff={currentDiff}
          baseCommands={base?.commands ?? []}
          customised={state.customised}
          baseCommandRefs={baseCommandRefs}
          canEdit={state.canEdit}
          selectedId={selectedId("command")}
          onSelect={select("command")}
          onNew={() => state.createItem("command")}
        />
      ),
    },
    {
      value: "enableRules",
      label: "Enable rules",
      content: (
        <RulesTab
          kind="enableRule"
          diff={currentDiff}
          baseRules={base?.enableRules ?? []}
          commands={allCommands}
          customised={state.customised}
          canEdit={state.canEdit}
          selectedId={selectedId("enableRule")}
          onSelect={select("enableRule")}
          onNew={() => state.createItem("enableRule")}
        />
      ),
    },
    {
      value: "displayRules",
      label: "Display rules",
      content: (
        <RulesTab
          kind="displayRule"
          diff={currentDiff}
          baseRules={base?.displayRules ?? []}
          commands={allCommands}
          customised={state.customised}
          canEdit={state.canEdit}
          selectedId={selectedId("displayRule")}
          onSelect={select("displayRule")}
          onNew={() => state.createItem("displayRule")}
        />
      ),
    },
    {
      value: "labels",
      label: "Labels",
      content: (
        <LabelsTab
          diff={currentDiff}
          canEdit={state.canEdit}
          selectedId={selectedId("label")}
          onSelect={select("label")}
          onNew={() => state.createItem("label")}
        />
      ),
    },
    ...(state.problems
      ? [
          {
            value: "problems",
            label: `Problems (${state.problems.length})`,
            content: <ProblemsTab problems={state.problems} tableName={tableName} onSelect={state.selectProblem} />,
          },
        ]
      : []),
  ];

  return (
    <Tabs
      aria-label={state.selectedKey === APPLICATION_KEY ? "Application ribbon" : state.selectedTable?.displayName ?? "Table"}
      className="h-full"
      items={tabs}
      value={state.tab === "problems" && !state.problems ? "commandBar" : state.tab}
      onValueChange={(value) => state.setTab(value as WorkspaceTab)}
    />
  );
}
