import { useEffect, useState } from "react";
import { Checkbox, ColumnResizeHandle, SearchInput, Spinner, useColumnResize } from "../../../shared/ui";
import { useEntityAttributes } from "../api/useEntityAttributes";

interface FieldsPanelProps {
  entityLogicalName: string | null;
  connectionId: string | null;
  selected: string[];
  onChange: (attributes: string[]) => void;
}

const FIELD_COLUMNS = [
  { key: "select", label: "Select" },
  { key: "displayName", label: "Display Name" },
  { key: "logicalName", label: "Logical Name" },
  { key: "type", label: "Type" },
  { key: "required", label: "Required" },
];

const reqColors: Record<string, string> = {
  SystemRequired: "bg-danger-soft text-danger",
  ApplicationRequired: "bg-alt-soft text-alt",
  Recommended: "bg-ok-soft text-ok",
  None: "bg-raised text-fg-muted",
};

export function FieldsPanel({
  entityLogicalName,
  connectionId,
  selected,
  onChange,
}: FieldsPanelProps) {
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = useEntityAttributes(entityLogicalName, connectionId);

  const usable = (data ?? []).filter(
    (a) => a.isValidForCreate || a.isValidForUpdate
  );

  const filtered = usable.filter(
    (a) =>
      a.logicalName.toLowerCase().includes(search.toLowerCase()) ||
      a.displayName.toLowerCase().includes(search.toLowerCase())
  );

  const checked = new Set(selected);
  const resize = useColumnResize(FIELD_COLUMNS.map((col) => col.key));

  // Primary id attributes are always part of the selection.
  useEffect(() => {
    if (!data) return;
    const pks = data.filter((a) => a.isPrimaryId).map((a) => a.logicalName);
    const missing = pks.filter((pk) => !selected.includes(pk));
    if (missing.length > 0) onChange([...selected, ...missing]);
  }, [data, selected, onChange]);

  const toggle = (logicalName: string) => {
    if (checked.has(logicalName))
      onChange(selected.filter((a) => a !== logicalName));
    else onChange([...selected, logicalName]);
  };

  const selectAll = () => onChange(usable.map((a) => a.logicalName));
  const selectNone = () =>
    onChange(
      (data ?? []).filter((a) => a.isPrimaryId).map((a) => a.logicalName)
    );

  if (!entityLogicalName) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-fg-muted border border-dashed border-line rounded-sm">
        Select an entity to see its fields.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <div className="flex items-center justify-between">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search fields…"
        />
        <div className="flex items-center gap-3 ml-4">
          <button
            type="button"
            onClick={selectAll}
            className="text-xs text-accent-text hover:underline whitespace-nowrap"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={selectNone}
            className="text-xs text-fg-muted hover:text-fg-strong whitespace-nowrap"
          >
            Select none
          </button>
          <span className="text-xs text-fg-muted whitespace-nowrap">
            {selected.length} selected
          </span>
        </div>
      </div>

      {error && (
        <p className="text-sm text-danger bg-danger-soft border border-danger rounded-sm px-3 py-2">
          {(error as Error).message}
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-fg-muted text-sm mt-2">
          <Spinner size={14} /> Loading attributes…
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto border border-line rounded-sm">
          <table ref={resize.tableRef} className="w-full text-sm" style={resize.tableStyle}>
            <thead className="bg-surface sticky top-0">
              <tr>
                <th {...resize.headerProps("select")} className="w-10 px-3 py-2" />
                {FIELD_COLUMNS.slice(1).map((col) => (
                  <th
                    key={col.key}
                    {...resize.headerProps(col.key)}
                    className="relative text-left px-3 py-2 text-xs font-medium text-fg-muted uppercase"
                  >
                    {col.label}
                    <ColumnResizeHandle resize={resize} columnKey={col.key} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((attr) => {
                const isLocked = attr.isPrimaryId;
                const isChecked = checked.has(attr.logicalName);
                return (
                  <tr
                    key={attr.logicalName}
                    onClick={() => !isLocked && toggle(attr.logicalName)}
                    className={`border-b border-line last:border-0 transition-colors ${
                      isLocked
                        ? "opacity-60"
                        : "cursor-pointer hover:bg-hover"
                    } ${isChecked ? "bg-accent-soft" : ""}`}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isChecked}
                        onChange={() => !isLocked && toggle(attr.logicalName)}
                        disabled={isLocked}
                      />
                    </td>
                    <td className={`px-3 py-2 text-fg font-medium ${resize.resized ? "truncate" : ""}`}>
                      {attr.displayName}
                    </td>
                    <td className={`px-3 py-2 text-fg-muted font-mono text-xs ${resize.resized ? "truncate" : ""}`}>
                      {attr.logicalName}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-xs bg-raised text-fg-muted px-1.5 py-0.5 rounded">
                        {attr.attributeType}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${reqColors[attr.requiredLevel] ?? reqColors.None}`}
                      >
                        {attr.requiredLevel}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
