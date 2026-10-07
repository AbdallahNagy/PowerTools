import type { RelationshipDraft } from "../model/types";
import { LookupActions } from "./LookupActions";
import { RelationshipFields } from "./RelationshipFields";

/** The right pane: settings for the selected relationship, and Create or Save. */
export function LookupEditorPane({
  mode,
  selectedDraft,
  ownTableError,
  elastic,
  createEnabled,
  saveEnabled,
  writePhase,
  showSpinner,
  onDraftChange,
  onCreate,
  onSave,
  onCancel,
}: {
  mode: "new" | "existing" | null;
  selectedDraft: RelationshipDraft | null;
  ownTableError: string | null;
  elastic: boolean;
  createEnabled: boolean;
  saveEnabled: boolean;
  writePhase: string | null;
  showSpinner: boolean;
  onDraftChange: (patch: Partial<RelationshipDraft>) => void;
  onCreate: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (mode == null) {
    return <p className="text-sm text-fg">Select a lookup or create one.</p>;
  }

  return (
    <>
      {ownTableError ? (
        <p role="alert" className="text-xs text-fg-strong">
          {ownTableError}
        </p>
      ) : null}
      {selectedDraft ? (
        <>
          <RelationshipFields draft={selectedDraft} disabled={!!writePhase} onChange={onDraftChange} />
          {elastic ? <p className="text-xs text-fg-muted">This referencing table is elastic.</p> : null}
        </>
      ) : (
        <p className="text-sm text-fg">Select an attribute.</p>
      )}
      <LookupActions
        mode={mode}
        createEnabled={createEnabled}
        saveEnabled={saveEnabled}
        writePhase={writePhase}
        showSpinner={showSpinner}
        onCreate={onCreate}
        onSave={onSave}
        onCancel={onCancel}
      />
    </>
  );
}
