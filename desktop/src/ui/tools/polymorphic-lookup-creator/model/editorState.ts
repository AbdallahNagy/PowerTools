import { newRelationshipDraft } from "./editPlan";
import { joinSchema, prefixText, suggestSchemaFragment } from "./schemaName";
import type { PolymorphicEntity, RelationshipDraft } from "./types";

/** The lookup being created or edited, and its relationships. */
export interface EditorState {
  mode: "new" | "existing" | null;
  lookupLogicalName: string | null;
  displayName: string;
  fragment: string;
  /** True once the schema name stops following the display name. */
  fragmentEdited: boolean;
  existingPrefix: string;
  drafts: RelationshipDraft[];
  /** The drafts as last loaded or saved, to detect unsaved changes. */
  originalDrafts: RelationshipDraft[];
  selectedReferenced: string | null;
}

export const emptyEditor: EditorState = {
  mode: null,
  lookupLogicalName: null,
  displayName: "",
  fragment: "",
  fragmentEdited: false,
  existingPrefix: "",
  drafts: [],
  originalDrafts: [],
  selectedReferenced: null,
};

export type EditorAction =
  | { type: "reset" }
  | { type: "startNew" }
  | { type: "openExisting"; logicalName: string }
  | {
      type: "loaded";
      drafts: RelationshipDraft[];
      displayName: string;
      fragment: string;
      prefix: string;
    }
  | { type: "setDisplayName"; value: string }
  | { type: "setFragment"; value: string }
  /** Adds the table as a referenced side if needed and selects it. */
  | { type: "selectReferenced"; table: PolymorphicEntity; customizationPrefix: string }
  | { type: "uncheckReferenced"; logicalName: string }
  | {
      type: "updateDraft";
      logicalName: string;
      patch: Partial<RelationshipDraft>;
      customizationPrefix: string;
    }
  | { type: "created"; schemaName: string; customizationPrefix: string }
  | { type: "saved"; deletedLogicalNames: string[] }
  | {
      type: "partiallySaved";
      completedAdds: RelationshipDraft[];
      completedDeletes: string[];
    };

const markSaved = (draft: RelationshipDraft): RelationshipDraft => ({
  ...draft,
  saved: true,
  fragmentEdited: true,
});

function addDraft(
  drafts: RelationshipDraft[],
  table: PolymorphicEntity,
  customizationPrefix: string,
): RelationshipDraft[] {
  return drafts.some((draft) => draft.referencedLogicalName === table.logicalName)
    ? drafts
    : [...drafts, newRelationshipDraft(table, customizationPrefix)];
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "reset":
      return emptyEditor;
    case "startNew":
      return { ...emptyEditor, mode: "new" };
    case "openExisting":
      // The lookup's fields load once metadata for it is available ("loaded").
      return {
        ...state,
        mode: "existing",
        lookupLogicalName: action.logicalName,
        selectedReferenced: null,
      };
    case "loaded":
      return {
        ...state,
        drafts: action.drafts,
        originalDrafts: action.drafts,
        displayName: action.displayName,
        fragment: action.fragment,
        existingPrefix: action.prefix,
        fragmentEdited: true,
      };
    case "setDisplayName":
      return {
        ...state,
        displayName: action.value,
        fragment: state.fragmentEdited ? state.fragment : suggestSchemaFragment(action.value),
      };
    case "setFragment":
      return { ...state, fragment: action.value, fragmentEdited: true };
    case "uncheckReferenced": {
      const remaining = state.drafts.filter(
        (draft) => draft.referencedLogicalName !== action.logicalName,
      );
      return {
        ...state,
        drafts: remaining,
        selectedReferenced:
          state.selectedReferenced === action.logicalName
            ? remaining[0]?.referencedLogicalName ?? null
            : state.selectedReferenced,
      };
    }
    case "selectReferenced":
      return {
        ...state,
        drafts: addDraft(state.drafts, action.table, action.customizationPrefix),
        selectedReferenced: action.table.logicalName,
      };
    case "updateDraft":
      return {
        ...state,
        drafts: state.drafts.map((draft) => {
          if (draft.referencedLogicalName !== action.logicalName) return draft;
          const next = { ...draft, ...action.patch };
          if (!next.saved && action.patch.fragment !== undefined) {
            next.schemaName = joinSchema(action.customizationPrefix, next.fragment);
          }
          return next;
        }),
      };
    case "created": {
      const saved = state.drafts.map(markSaved);
      return {
        ...state,
        drafts: saved,
        originalDrafts: saved,
        existingPrefix: prefixText(action.customizationPrefix),
        fragmentEdited: true,
        mode: "existing",
        lookupLogicalName: action.schemaName.toLowerCase(),
      };
    }
    case "saved": {
      const saved = state.drafts
        .filter((draft) => !action.deletedLogicalNames.includes(draft.referencedLogicalName))
        .map(markSaved);
      return { ...state, drafts: saved, originalDrafts: saved };
    }
    case "partiallySaved": {
      const deleted = new Set(action.completedDeletes);
      return {
        ...state,
        originalDrafts: [
          ...state.originalDrafts.filter((draft) => !deleted.has(draft.referencedLogicalName)),
          ...action.completedAdds,
        ],
        drafts: state.drafts
          .filter((draft) => !deleted.has(draft.referencedLogicalName))
          .map(
            (draft) =>
              action.completedAdds.find(
                (added) => added.referencedLogicalName === draft.referencedLogicalName,
              ) ?? draft,
          ),
      };
    }
  }
}
