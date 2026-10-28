import { Button, Checkbox, Spinner } from "../../../shared/ui";

interface MigrationOptionsProps {
  doCreate: boolean;
  doUpdate: boolean;
  doDelete: boolean;
  onCreateChange: (v: boolean) => void;
  onUpdateChange: (v: boolean) => void;
  /** Turning Delete on goes through a warning first, so this only asks. */
  onDeleteChange: (v: boolean) => void;
  hasFilter: boolean;
  filterDisabled: boolean;
  onOpenFilter: () => void;
  previewDisabled: boolean;
  onOpenPreview: () => void;
  startLabel: string;
  startDisabled: boolean;
  isStarting: boolean;
  onStart: () => void;
}

export function MigrationOptions({
  doCreate,
  doUpdate,
  doDelete,
  onCreateChange,
  onUpdateChange,
  onDeleteChange,
  hasFilter,
  filterDisabled,
  onOpenFilter,
  previewDisabled,
  onOpenPreview,
  startLabel,
  startDisabled,
  isStarting,
  onStart,
}: MigrationOptionsProps) {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div
        className="flex items-center gap-4"
        title="Records are matched by ID. Create: source records missing from the target are created. Update: source records already in the target are overwritten with source values. Records an unticked option would cover are skipped. Delete: target records matching the filter that are not in the source are deleted."
      >
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={doCreate} onChange={onCreateChange} />
          <span className="text-sm text-fg">Create</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={doUpdate} onChange={onUpdateChange} />
          <span className="text-sm text-fg">Update</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={doDelete} onChange={onDeleteChange} />
          <span className={`text-sm ${doDelete ? "text-danger font-medium" : "text-fg"}`}>Delete</span>
        </label>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          onClick={onOpenFilter}
          disabled={filterDisabled}
        >
          Filter{hasFilter && <span className="ml-1 text-accent-text">●</span>}
        </Button>
        <Button
          variant="secondary"
          onClick={onOpenPreview}
          disabled={previewDisabled}
        >
          Preview
        </Button>
        <Button onClick={onStart} disabled={startDisabled} className="max-w-80">
          {isStarting ? (
            <>
              <Spinner size={14} />
              &nbsp;Starting…
            </>
          ) : (
            <>▶ {startLabel}</>
          )}
        </Button>
      </div>
    </div>
  );
}
