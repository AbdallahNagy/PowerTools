import type { KeyboardEvent } from "react";
import { Button, Field, Input, Select, Spinner, Toolbar } from "../../../shared/ui";
import type { RecycleTable, RecycleUser, Source } from "../model/types";

interface FilterBarProps {
  disabled: boolean;
  loading: boolean;
  tables: RecycleTable[];
  table: string;
  onTableChange: (table: string) => void;
  source: Source | null;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  rangeError: string | null;
  users: RecycleUser[];
  deletedBy: string;
  onDeletedByChange: (value: string) => void;
  canFind: boolean;
  onFind: () => void;
}

function tableLabel(table: RecycleTable): string {
  return table.displayName && table.displayName !== table.logicalName
    ? `${table.displayName} (${table.logicalName})`
    : table.logicalName;
}

function userLabel(user: RecycleUser): string {
  return user.isDisabled ? `${user.fullName} (disabled)` : user.fullName;
}

export function FilterBar({
  disabled,
  loading,
  tables,
  table,
  onTableChange,
  source,
  from,
  to,
  onFromChange,
  onToChange,
  rangeError,
  users,
  deletedBy,
  onDeletedByChange,
  canFind,
  onFind,
}: FilterBarProps) {
  const listsDisabled = disabled || loading;
  const auditFilters = source !== "bin";

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && canFind) {
      event.preventDefault();
      onFind();
    }
  };

  return (
    <div onKeyDown={onKeyDown}>
      <Toolbar
        aria-label="Filters"
        className="flex-wrap items-end"
        end={
          <Button variant="secondary" onClick={onFind} disabled={!canFind}>
            Find deleted records
          </Button>
        }
      >
        <Field label="Table" className="min-w-56">
          <div className="flex items-center gap-2">
            <Select
              value={table}
              disabled={listsDisabled}
              onChange={(event) => onTableChange(event.target.value)}
              className="flex-1"
            >
              <option value="">Choose a table</option>
              {tables.map((item) => (
                <option key={item.logicalName} value={item.logicalName}>
                  {tableLabel(item)}
                </option>
              ))}
            </Select>
            {loading ? <Spinner /> : null}
          </div>
        </Field>
        {auditFilters ? (
          <>
            <Field label="From">
              <Input type="date" value={from} disabled={disabled} onChange={(event) => onFromChange(event.target.value)} />
            </Field>
            <Field label="To" error={rangeError}>
              <Input type="date" value={to} disabled={disabled} onChange={(event) => onToChange(event.target.value)} />
            </Field>
            <Field label="Deleted by" className="min-w-48">
              <div className="flex items-center gap-2">
                <Select
                  value={deletedBy}
                  disabled={listsDisabled}
                  onChange={(event) => onDeletedByChange(event.target.value)}
                  className="flex-1"
                >
                  <option value="">Anyone</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {userLabel(user)}
                    </option>
                  ))}
                </Select>
                {loading ? <Spinner /> : null}
              </div>
            </Field>
          </>
        ) : null}
      </Toolbar>
    </div>
  );
}
