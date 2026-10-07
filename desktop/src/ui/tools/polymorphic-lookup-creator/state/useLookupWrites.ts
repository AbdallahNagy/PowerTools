import { useState, type Dispatch } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "../../../shared/ui";
import {
  addRelationship,
  createLookup,
  deleteLookupColumn,
  deleteRelationship,
  updateRelationship,
} from "../api/lookupApi";
import { polymorphicKeys } from "../api/queryKeys";
import { toLookupError } from "../model/apiError";
import { relationshipPayload } from "../model/editPlan";
import type { EditorAction, EditorState } from "../model/editorState";
import { joinSchema } from "../model/schemaName";
import type { EditPlan, PolymorphicEntity, RelationshipDraft, UnmanagedSolution } from "../model/types";

interface LookupWritesOptions {
  connectionName: string | null;
  solution: UnmanagedSolution | null;
  table: PolymorphicEntity | null;
  /** Logical name of the lookup column being edited. */
  lookupAttribute: string | null;
  editor: EditorState;
  dispatch: Dispatch<EditorAction>;
  setNotice: (notice: string | null) => void;
  /** Closes the confirmation dialog that started a save or delete. */
  closeModal: () => void;
  onCreated: () => void;
  onDeleted: () => void;
}

/**
 * Creates, saves, and deletes the lookup. `writePhase` describes the write in
 * progress for the status bar, or is null when idle.
 */
export function useLookupWrites({
  connectionName,
  solution,
  table,
  lookupAttribute,
  editor,
  dispatch,
  setNotice,
  closeModal,
  onCreated,
  onDeleted,
}: LookupWritesOptions) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [writePhase, setWritePhase] = useState<string | null>(null);
  const customizationPrefix = solution?.customizationPrefix ?? "";

  async function refreshMetadata() {
    if (!connectionName) return;
    await queryClient.invalidateQueries({ queryKey: polymorphicKeys.metadata(connectionName) });
  }

  async function create() {
    if (!connectionName || !solution || !table) return;
    setWritePhase("Creating lookup…");
    setNotice(null);
    try {
      const schemaName = joinSchema(customizationPrefix, editor.fragment);
      await createLookup(connectionName, {
        solutionUniqueName: solution.uniqueName,
        referencingEntityLogicalName: table.logicalName,
        displayName: editor.displayName.trim(),
        schemaName,
        relationships: editor.drafts.map(relationshipPayload),
      });
      dispatch({ type: "created", schemaName, customizationPrefix });
      onCreated();
      showToast("Lookup created", "success");
      await refreshMetadata();
    } catch (error) {
      showToast(toLookupError(error), "error");
    } finally {
      setWritePhase(null);
    }
  }

  async function save(plan: EditPlan) {
    if (!connectionName || !solution || !table || !lookupAttribute) return;
    setNotice(null);
    let applied = 0;
    const completedAdds: RelationshipDraft[] = [];
    const completedDeletes: string[] = [];
    try {
      for (const add of plan.adds) {
        setWritePhase("Saving lookup… Adding relationships…");
        await addRelationship(connectionName, {
          solutionUniqueName: solution.uniqueName,
          referencingEntityLogicalName: table.logicalName,
          referencingAttributeLogicalName: lookupAttribute,
          relationship: relationshipPayload(add),
        });
        applied += 1;
        completedAdds.push({ ...add, saved: true, fragmentEdited: true });
      }
      for (const removal of plan.deletes) {
        setWritePhase("Saving lookup… Removing relationships…");
        await deleteRelationship(connectionName, removal.schemaName, table.logicalName);
        applied += 1;
        completedDeletes.push(removal.referencedLogicalName);
      }
      for (const update of plan.updates) {
        setWritePhase("Saving lookup… Updating relationships…");
        const payload = relationshipPayload(update);
        await updateRelationship(connectionName, update.schemaName, {
          referencingEntityLogicalName: table.logicalName,
          isValidForAdvancedFind: payload.isValidForAdvancedFind,
          cascade: payload.cascade,
          associatedMenuBehavior: payload.associatedMenuBehavior,
          associatedMenuGroup: payload.associatedMenuGroup,
          associatedMenuOrder: payload.associatedMenuOrder,
          associatedMenuLabel: payload.associatedMenuLabel,
        });
        applied += 1;
      }
      dispatch({
        type: "saved",
        deletedLogicalNames: plan.deletes.map((item) => item.referencedLogicalName),
      });
      closeModal();
      showToast("Lookup saved", "success");
      await refreshMetadata();
    } catch (error) {
      showToast(toLookupError(error), "error");
      if (applied > 0) {
        setNotice("Earlier changes remain applied.");
        dispatch({ type: "partiallySaved", completedAdds, completedDeletes });
      }
      closeModal();
    } finally {
      setWritePhase(null);
    }
  }

  async function remove() {
    if (!connectionName || !table || !lookupAttribute) return;
    setWritePhase("Deleting lookup…");
    setNotice(null);
    try {
      await deleteLookupColumn(connectionName, table.logicalName, lookupAttribute);
      showToast("Lookup deleted", "success");
      onDeleted();
      closeModal();
      await refreshMetadata();
    } catch (error) {
      showToast(toLookupError(error), "error");
      closeModal();
    } finally {
      setWritePhase(null);
    }
  }

  return { writePhase, create, save, remove };
}
