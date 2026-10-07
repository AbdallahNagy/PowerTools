import { Button, Checkbox, DataTable, SearchInput } from "../../../shared/ui";
import type { SavedQuery } from "../model/types";

interface QueryLibraryProps {
  queries: SavedQuery[];
  search: string;
  onSearchChange: (value: string) => void;
  allEnvironments: boolean;
  onAllEnvironmentsChange: (value: boolean) => void;
  onReload: () => void;
  onOpen: (query: SavedQuery) => void;
  onDelete: (query: SavedQuery) => void;
}

export function QueryLibrary({
  queries,
  search,
  onSearchChange,
  allEnvironments,
  onAllEnvironmentsChange,
  onReload,
  onOpen,
  onDelete,
}: QueryLibraryProps) {
  const emptyMessage = search.trim() ? "No matching queries" : "No saved queries";

  return (
    <section aria-label="Query library" className="flex h-full min-h-0 flex-1 flex-col gap-2">
      <div className="text-xs text-fg">Query library</div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-64">
          <SearchInput
            value={search}
            onChange={onSearchChange}
            placeholder="Search saved queries"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-fg">
          <Checkbox
            checked={allEnvironments}
            onChange={onAllEnvironmentsChange}
            id="fetchxml-tester-all-environments"
          />
          All environments
        </label>
        <Button type="button" variant="secondary" onClick={onReload}>
          Reload
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <DataTable
          columns={[
            { key: "table", header: "Table" },
            {
              key: "savedAt",
              header: "Date",
              render: (query) => formatSavedAt(query.savedAt),
            },
            { key: "environment", header: "Environment" },
            {
              key: "delete",
              header: "",
              width: "6rem",
              render: (query) => (
                <Button
                  type="button"
                  variant="ghost"
                  className="px-2 py-1"
                  aria-label={`Delete ${query.table} saved query`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(query);
                  }}
                >
                  Delete
                </Button>
              ),
            },
          ]}
          rows={queries}
          onRowClick={onOpen}
          getRowKey={(query) => query.id}
          emptyMessage={emptyMessage}
        />
      </div>
    </section>
  );
}

function formatSavedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
