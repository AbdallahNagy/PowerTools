import { useMemo, useState } from "react";
import { Copy, FolderOpen } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  CodeEditor,
  DataTable,
  EmptyState,
  SearchInput,
  Spinner,
  useToast,
} from "../../../shared/ui";
import {
  DEFAULT_FILE_SORT,
  filterFiles,
  matchedNothing,
  nextFileSort,
  plural,
  sortFiles,
  type FileSort,
  type FileSortKey,
} from "../model/results";
import type { GeneratedFile } from "../model/types";
import type { RunState } from "../state/useEarlyBoundGenerator";

interface OutputPanelProps {
  command: string;
  run: RunState;
  hasConnection: boolean;
  onOpenFolder: (path: string) => void;
}

const COLUMNS = [
  {
    key: "path",
    header: "File",
    sortable: true,
    render: (file: GeneratedFile) => <span className="font-mono text-xs break-all">{file.path}</span>,
  },
  { key: "kind", header: "Kind", sortable: true, width: "8rem" },
  {
    key: "name",
    header: "Name",
    sortable: true,
    render: (file: GeneratedFile) => <span className="font-mono text-xs">{file.name}</span>,
  },
];

function FilesTable({ files }: { files: GeneratedFile[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<FileSort>(DEFAULT_FILE_SORT);
  const rows = useMemo(() => sortFiles(filterFiles(files, query), sort), [files, query, sort]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <SearchInput value={query} onChange={setQuery} placeholder="Filter files" aria-label="Filter files" />
      <DataTable
        className="min-h-0"
        columns={COLUMNS}
        rows={rows}
        getRowKey={(file) => file.path}
        sortKey={sort.key}
        sortDirection={sort.direction}
        onSort={(key) => setSort((current) => nextFileSort(current, key as FileSortKey))}
        emptyMessage="No files match the filter."
      />
    </div>
  );
}

function Results({ run, hasConnection, onOpenFolder }: Omit<OutputPanelProps, "command">) {
  switch (run.phase) {
    case "running":
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center" role="status">
          <Spinner size={24} />
          <p className="text-sm text-fg">Reading metadata and writing files. Large environments can take several minutes.</p>
        </div>
      );
    case "environmentChanged":
      return (
        <EmptyState
          className="flex-1"
          title={`Environment changed. Select Generate to rebuild from ${run.environment}.`}
        />
      );
    case "succeeded":
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-sm text-fg">
              {`${plural(run.files.length, "file")} written to `}
              <span className="font-mono break-all">{run.outputDirectory}</span>
            </p>
            <Badge tone="ok">Done</Badge>
            <Button variant="ghost" size="sm" onClick={() => onOpenFolder(run.outputDirectory)}>
              <FolderOpen size={14} aria-hidden="true" />
              Open folder
            </Button>
          </div>
          {matchedNothing(run.files) ? (
            <Alert tone="warn">No tables or messages matched the filters. Check the names and wildcards.</Alert>
          ) : null}
          <FilesTable files={run.files} />
        </div>
      );
    case "failed":
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <Alert tone="danger" title="Generation failed">
            {run.message}
          </Alert>
          {run.files.length > 0 ? (
            <>
              <p className="text-sm text-fg">{`${run.files.length} ${run.files.length === 1 ? "file was" : "files were"} written before the failure.`}</p>
              <FilesTable files={run.files} />
            </>
          ) : null}
        </div>
      );
    default:
      return (
        <EmptyState
          className="flex-1"
          title={
            hasConnection
              ? "Choose an output folder and select Generate. Generated files are listed here."
              : "Connect to an environment to generate code."
          }
        />
      );
  }
}

/** Right panel: the matching pac command, then the results of the last run. */
export function OutputPanel({ command, run, hasConnection, onOpenFolder }: OutputPanelProps) {
  const { showToast } = useToast();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      showToast("Command copied.", "success");
    } catch {
      showToast("The command could not be copied.", "error");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden bg-canvas p-4">
      <section aria-label="Reproduce in CI" className="flex shrink-0 flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-fg-strong">Reproduce in CI</h2>
          <Button variant="ghost" size="sm" aria-label="Copy command" onClick={() => void copy()}>
            <Copy size={14} aria-hidden="true" />
            Copy
          </Button>
        </div>
        <CodeEditor value={command} readOnly aria-label="pac command" className="h-32" />
        <p className="text-xs text-fg-muted">pac uses its own sign-in. Run pac auth create before this command.</p>
      </section>
      <section aria-label="Results" className="flex min-h-0 flex-1 flex-col">
        <Results run={run} hasConnection={hasConnection} onOpenFolder={onOpenFolder} />
      </section>
    </div>
  );
}
