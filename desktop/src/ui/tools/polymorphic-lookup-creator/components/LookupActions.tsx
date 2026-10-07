import { Button, Spinner } from "../../../shared/ui";
import { usePrimaryAction } from "../../../shared/keyboard";

/** Create or Save, and Cancel, for the open lookup. Registers the primary action for the shell's Enter shortcut. */
export function LookupActions({
  mode,
  createEnabled,
  saveEnabled,
  writePhase,
  showSpinner,
  onCreate,
  onSave,
  onCancel,
}: {
  mode: "new" | "existing";
  createEnabled: boolean;
  saveEnabled: boolean;
  writePhase: string | null;
  showSpinner: boolean;
  onCreate: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  usePrimaryAction({
    label: mode === "new" ? "Create lookup" : "Save",
    enabled: mode === "new" ? createEnabled : saveEnabled,
    run: mode === "new" ? onCreate : onSave,
  });

  return (
    <div className="flex gap-2">
      {mode === "new" ? (
        <Button disabled={!createEnabled} onClick={onCreate}>
          Create lookup
        </Button>
      ) : (
        <Button disabled={!saveEnabled} onClick={onSave}>
          Save
        </Button>
      )}
      <Button variant="secondary" disabled={!!writePhase} onClick={onCancel}>
        Cancel
      </Button>
      {showSpinner ? <Spinner /> : null}
    </div>
  );
}
