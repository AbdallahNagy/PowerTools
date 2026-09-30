import { Button } from "../../../shared/ui";
import type { SortColumn, SortState } from "../model/types";

const columns: ReadonlyArray<{ column: SortColumn; label: string }> = [
  { column: "friendlyName", label: "Friendly name" },
  { column: "uniqueName", label: "Unique name" },
  { column: "publisherName", label: "Publisher" },
  { column: "installedOn", label: "Installed" },
  { column: "version", label: "Version" },
  { column: "isManaged", label: "Managed" },
];

export function SortButtons({
  sort,
  disabled,
  onSort,
}: {
  sort: SortState;
  disabled: boolean;
  onSort: (column: SortColumn) => void;
}) {
  return (
    <fieldset disabled={disabled} className="m-0 flex flex-wrap gap-1 border-0 p-0">
      {columns.map((column) => {
        const active = sort.column === column.column;
        return (
          <Button
            key={column.column}
            type="button"
            variant="ghost"
            onClick={() => onSort(column.column)}
          >
            <span className={active ? "text-[var(--color-text-white)]" : undefined}>{column.label}</span>
            {active ? (
              <span className="text-[var(--color-text-dark-gray)]">
                {" "}
                {sort.direction === "asc" ? "Ascending" : "Descending"}
              </span>
            ) : null}
          </Button>
        );
      })}
    </fieldset>
  );
}
