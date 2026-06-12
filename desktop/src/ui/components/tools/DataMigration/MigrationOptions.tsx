import { Checkbox } from "../../ui/Checkbox";
import { Button } from "../../ui/Button";
import { Spinner } from "../../ui/Spinner";

export type MigrationMode = "create" | "update" | "upsert";

interface MigrationOptionsProps {
  doCreate: boolean;
  doUpdate: boolean;
  onCreateChange: (v: boolean) => void;
  onUpdateChange: (v: boolean) => void;
  hasFilter: boolean;
  filterDisabled: boolean;
  onOpenFilter: () => void;
  previewDisabled: boolean;
  onOpenPreview: () => void;
  startDisabled: boolean;
  isStarting: boolean;
  onStart: () => void;
}

export function MigrationOptions({
  doCreate,
  doUpdate,
  onCreateChange,
  onUpdateChange,
  hasFilter,
  filterDisabled,
  onOpenFilter,
  previewDisabled,
  onOpenPreview,
  startDisabled,
  isStarting,
  onStart,
}: MigrationOptionsProps) {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div
        className="flex items-center gap-4"
        title="Create: new records are created in the target. Update: records that already exist in the target (same id) are overwritten with source values. Both: upsert."
      >
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={doCreate} onChange={onCreateChange} />
          <span className="text-sm text-[#cccccc]">Create</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={doUpdate} onChange={onUpdateChange} />
          <span className="text-sm text-[#cccccc]">Update</span>
        </label>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          onClick={onOpenFilter}
          disabled={filterDisabled}
        >
          Filter{hasFilter && <span className="ml-1 text-[#007fd4]">●</span>}
        </Button>
        <Button
          variant="secondary"
          onClick={onOpenPreview}
          disabled={previewDisabled}
        >
          Preview
        </Button>
        <Button onClick={onStart} disabled={startDisabled}>
          {isStarting ? (
            <>
              <Spinner size={14} />
              &nbsp;Starting…
            </>
          ) : (
            "▶ Start Migration"
          )}
        </Button>
      </div>
    </div>
  );
}
