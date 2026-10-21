import { Plus, X } from "lucide-react";
import { Button, Field, Select, Spinner } from "../../../shared/ui";
import type { EntityView, FieldMetadata } from "../model/types";

interface ColumnsBarProps {
  columns: string[];
  fields: FieldMetadata[];
  views: EntityView[];
  viewsLoading: boolean;
  viewsError: string | null;
  selectedViewId: string;
  onSelectView: (view: EntityView) => void;
  onRemoveColumn: (column: string) => void;
  onEditColumns: () => void;
}

/** View picker and chosen columns, stacked under the table picker. */
export function ColumnsBar({
  columns,
  fields,
  views,
  viewsLoading,
  viewsError,
  selectedViewId,
  onSelectView,
  onRemoveColumn,
  onEditColumns,
}: ColumnsBarProps) {
  const displayNames = new Map(fields.map((field) => [field.logicalName, field.displayName]));
  const systemViews = views.filter((view) => view.kind === "system");
  const personalViews = views.filter((view) => view.kind === "personal");

  return (
    <>
      <Field label="View" className="shrink-0 min-w-0" error={viewsError ?? undefined}>
        <div className="flex items-center gap-2 min-w-0">
          <Select
            value={selectedViewId}
            onChange={(event) => {
              const view = views.find((candidate) => candidate.id === event.target.value);
              if (view) onSelectView(view);
            }}
            disabled={viewsLoading || views.length === 0}
            className="w-72 shrink-0 [&>select]:truncate [&>select]:bg-raised"
          >
            <option value="">
              {viewsLoading ? "Loading views…" : views.length === 0 ? "No views" : "— select a view —"}
            </option>
            {systemViews.length > 0 && (
              <optgroup label="System views">
                {systemViews.map((view) => (
                  <option key={view.id} value={view.id}>
                    {view.name}{view.isDefault ? " (default)" : ""}
                  </option>
                ))}
              </optgroup>
            )}
            {personalViews.length > 0 && (
              <optgroup label="My views">
                {personalViews.map((view) => (
                  <option key={view.id} value={view.id}>
                    {view.name}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
          {viewsLoading && <Spinner size={14} />}
        </div>
      </Field>

      <div className="flex flex-col gap-1 shrink-0 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-fg-muted">Columns</span>
          <Button variant="ghost" onClick={onEditColumns} className="text-xs py-1 px-2 shrink-0 ml-auto">
            <Plus size={14} aria-hidden="true" /> Add columns
          </Button>
        </div>
        {columns.length === 0 ? (
          <p className="text-xs text-fg-muted italic">No columns chosen. The query returns every column.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5 max-h-24 overflow-auto" aria-label="Chosen columns">
            {columns.map((column) => (
              <li
                key={column}
                className="inline-flex items-center gap-1 rounded-sm border border-line bg-raised pl-2 pr-1 py-0.5 text-xs text-fg"
                title={column}
              >
                {displayNames.get(column) ?? column}
                <button
                  type="button"
                  onClick={() => onRemoveColumn(column)}
                  aria-label={`Remove ${displayNames.get(column) ?? column}`}
                  className="rounded-sm p-0.5 text-fg-muted hover:text-fg-strong hover:bg-hover"
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
