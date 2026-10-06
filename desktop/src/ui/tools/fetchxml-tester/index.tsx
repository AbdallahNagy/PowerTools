import { useMemo, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useTabConnection } from "../../shared/connections";
import { useToolStatus } from "../../shared/status";
import { usePrimaryAction } from "../../shared/keyboard";
import { Button, Checkbox, Spinner, ToastProvider, useToast } from "../../shared/ui";
import { useQueryLibrary } from "./api/useQueryLibrary";
import { useRunFetch } from "./api/useRunFetch";
import { QueryEditor } from "./components/QueryEditor";
import { QueryLibrary } from "./components/QueryLibrary";
import { ResultsPanel } from "./components/ResultsPanel";
import { SaveQueryModal } from "./components/SaveQueryModal";
import { buildExecuteRequest, emptyFetchMessage } from "./model/executeRequest";
import { fetchErrorMessage } from "./model/fetchError";
import { formatXml, XmlFormatError } from "./model/formatXml";
import { filterQueries } from "./model/queryLibrary";
import { resultSummary } from "./model/resultSummary";
import { SAMPLE_FETCH_XML } from "./model/sampleQuery";
import type { FetchResult } from "./model/types";

export default function FetchXmlTester() {
  return (
    <ToastProvider>
      <FetchXmlTesterPage />
    </ToastProvider>
  );
}

function FetchXmlTesterPage() {
  const { connectionName } = useTabConnection();
  const { showToast } = useToast();
  const library = useQueryLibrary();
  const [fetchXml, setFetchXml] = useState(SAMPLE_FETCH_XML);
  const [showFormatted, setShowFormatted] = useState(false);
  const [search, setSearch] = useState("");
  const [allEnvironments, setAllEnvironments] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [showQueryLibrary, setShowQueryLibrary] = useState(true);
  const [result, setResult] = useState<FetchResult | null>(null);
  const { mutate: runFetch, isPending } = useRunFetch(connectionName || null);

  const hasQuery = fetchXml.trim().length > 0;
  const visibleQueries = useMemo(
    () => filterQueries(library.queries, {
      connectionName: connectionName ?? "",
      allEnvironments,
      search,
    }),
    [allEnvironments, connectionName, library.queries, search],
  );

  const statusContent = isPending
    ? "Running FetchXML…"
    : result
      ? resultSummary(result.records.length, result.moreRecords)
      : null;
  useToolStatus(statusContent);

  const handleExecute = () => {
    const emptyMessage = emptyFetchMessage(fetchXml);
    if (emptyMessage || isPending) return;
    if (!connectionName) {
      showToast("Select a connection before running the query.", "error");
      return;
    }

    runFetch(buildExecuteRequest(fetchXml, showFormatted), {
      onSuccess: (next) => setResult(next),
      onError: (requestError) => showToast(fetchErrorMessage(requestError), "error"),
    });
  };

  const executeEnabled = hasQuery && !isPending;
  usePrimaryAction({
    label: "Execute",
    enabled: executeEnabled,
    run: handleExecute,
  });

  const handleFormat = () => {
    if (isPending) return;
    try {
      setFetchXml(formatXml(fetchXml));
    } catch (formatError) {
      const message = formatError instanceof XmlFormatError
        ? formatError.message
        : "Please check the input XML.";
      showToast(message, "error");
    }
  };

  const handleSave = (description: string) => {
    if (!connectionName) {
      showToast("Select a connection before saving the query.", "error");
      return;
    }

    const saved = library.save({
      fetchXml,
      description,
      connectionName,
      environment: connectionName,
    });
    if (!saved.ok) {
      showToast(saved.error, "error");
      return;
    }

    setSaveOpen(false);
    showToast("Query saved.", "success");
  };

  const handleDelete = (id: string) => {
    if (!library.remove(id)) {
      showToast("The query could not be deleted.", "error");
    }
  };

  const handleReload = () => {
    if (!library.reload()) {
      showToast("The query library could not be reloaded.", "error");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden bg-canvas p-4 text-fg">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" onClick={handleFormat} disabled={isPending}>
            Format
          </Button>
          <Button type="button" onClick={handleExecute} disabled={!executeEnabled}>
            Execute
          </Button>
          {isPending ? <Spinner /> : null}
          <label className="flex items-center gap-2 text-xs text-fg">
            <Checkbox
              checked={showFormatted}
              onChange={setShowFormatted}
              id="fetchxml-tester-formatted"
            />
            Show formatted values
          </label>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setSaveOpen(true)}
            disabled={!hasQuery || isPending}
          >
            Save
          </Button>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setShowQueryLibrary((visible) => !visible)}
        >
          {showQueryLibrary ? "Hide query library" : "Show query library"}
        </Button>
      </div>

      <Group
        key={showQueryLibrary ? "with-library" : "full-width"}
        className="flex min-h-0 flex-1"
      >
        <Panel
          defaultSize={showQueryLibrary ? "70%" : "100%"}
          minSize="35%"
          className="flex min-h-0 min-w-0 flex-col"
        >
          <Group orientation="vertical" className="flex min-h-0 flex-1">
            <Panel defaultSize="42%" minSize="22%" className="flex min-h-0 flex-col gap-2">
              <div className="text-xs text-fg">FetchXML</div>
              <QueryEditor value={fetchXml} onChange={setFetchXml} onExecute={handleExecute} />
            </Panel>
            <Separator className="my-1 h-1 cursor-row-resize bg-raised transition-colors hover:bg-accent" />
            <Panel minSize="25%" className="flex min-h-0 flex-col">
              <ResultsPanel result={result} />
            </Panel>
          </Group>
        </Panel>

        {showQueryLibrary ? (
          <>
            <Separator className="mx-1 w-1 cursor-col-resize bg-raised transition-colors hover:bg-accent" />
            <Panel defaultSize="30%" minSize="18%" className="flex min-h-0 min-w-0 flex-col">
              <QueryLibrary
                queries={visibleQueries}
                search={search}
                onSearchChange={setSearch}
                allEnvironments={allEnvironments}
                onAllEnvironmentsChange={setAllEnvironments}
                onReload={handleReload}
                onOpen={(query) => setFetchXml(query.fetchXml)}
                onDelete={(query) => handleDelete(query.id)}
              />
            </Panel>
          </>
        ) : null}
      </Group>

      <SaveQueryModal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        onSave={handleSave}
      />
    </div>
  );
}
