import { describe, expect, it } from "vitest";
import { editorReducer, emptyEditor, type EditorState } from "../../model/editorState";
import type { PolymorphicEntity } from "../../model/types";

function entity(logicalName: string, displayName: string): PolymorphicEntity {
  return {
    logicalName,
    schemaName: logicalName,
    displayName,
    primaryIdAttribute: `${logicalName}id`,
    canBePrimaryEntityInRelationship: true,
    canBeRelatedEntityInRelationship: true,
    tableType: "Standard",
    isSolutionAware: false,
    lookups: [],
    manyToOne: [],
  };
}

const account = entity("account", "Account");
const contact = entity("contact", "Contact");
const lead = entity("lead", "Lead");

function newLookupWith(...tables: PolymorphicEntity[]): EditorState {
  return tables.reduce(
    (state, table) =>
      editorReducer(state, { type: "selectReferenced", table, customizationPrefix: "new" }),
    editorReducer(emptyEditor, { type: "startNew" }),
  );
}

describe("lookup editor state", () => {
  it("suggests the schema name from the display name until the schema name is edited", () => {
    let state = editorReducer(emptyEditor, { type: "startNew" });
    state = editorReducer(state, { type: "setDisplayName", value: "Regarding Party" });
    const suggested = state.fragment;
    expect(suggested).not.toBe("");

    state = editorReducer(state, { type: "setFragment", value: "custom" });
    state = editorReducer(state, { type: "setDisplayName", value: "Something else" });
    expect(state.fragment).toBe("custom");
    expect(state.fragmentEdited).toBe(true);
  });

  it("adds a referenced table once and selects it", () => {
    let state = newLookupWith(account, contact);
    state = editorReducer(state, { type: "selectReferenced", table: account, customizationPrefix: "new" });

    expect(state.drafts.map((draft) => draft.referencedLogicalName)).toEqual(["account", "contact"]);
    expect(state.selectedReferenced).toBe("account");
    expect(state.drafts[0]!.schemaName.startsWith("new_")).toBe(true);
  });

  it("moves the selection to the first remaining table when the selected one is unchecked", () => {
    let state = newLookupWith(account, contact, lead);
    expect(state.selectedReferenced).toBe("lead");

    state = editorReducer(state, { type: "uncheckReferenced", logicalName: "lead" });
    expect(state.selectedReferenced).toBe("account");

    state = editorReducer(state, { type: "uncheckReferenced", logicalName: "contact" });
    expect(state.selectedReferenced).toBe("account");
  });

  it("renames an unsaved relationship's schema name with its fragment", () => {
    let state = newLookupWith(account);
    state = editorReducer(state, {
      type: "updateDraft",
      logicalName: "account",
      patch: { fragment: "regarding_account", fragmentEdited: true },
      customizationPrefix: "new",
    });
    expect(state.drafts[0]!.schemaName).toBe("new_regarding_account");
  });

  it("switches to editing the created lookup and marks its relationships saved", () => {
    let state = newLookupWith(account, contact);
    state = editorReducer(state, { type: "created", schemaName: "new_Regarding", customizationPrefix: "new" });

    expect(state.mode).toBe("existing");
    expect(state.lookupLogicalName).toBe("new_regarding");
    expect(state.existingPrefix).toBe("new_");
    expect(state.drafts.every((draft) => draft.saved)).toBe(true);
    expect(state.originalDrafts).toEqual(state.drafts);
  });

  it("drops deleted relationships on save", () => {
    let state = newLookupWith(account, contact, lead);
    state = editorReducer(state, { type: "saved", deletedLogicalNames: ["contact"] });

    expect(state.drafts.map((draft) => draft.referencedLogicalName)).toEqual(["account", "lead"]);
    expect(state.originalDrafts).toEqual(state.drafts);
  });

  it("records only the writes that finished when a save fails partway", () => {
    let state = newLookupWith(account, contact);
    state = editorReducer(state, { type: "created", schemaName: "new_Regarding", customizationPrefix: "new" });
    state = editorReducer(state, { type: "selectReferenced", table: lead, customizationPrefix: "new" });
    const addedLead = { ...state.drafts[2]!, saved: true, fragmentEdited: true };

    state = editorReducer(state, {
      type: "partiallySaved",
      completedAdds: [addedLead],
      completedDeletes: ["contact"],
    });

    expect(state.originalDrafts.map((draft) => draft.referencedLogicalName)).toEqual(["account", "lead"]);
    expect(state.drafts.map((draft) => draft.referencedLogicalName)).toEqual(["account", "lead"]);
    expect(state.drafts[1]!.saved).toBe(true);
  });

  it("opens an existing lookup without discarding fields until it loads", () => {
    let state = newLookupWith(account);
    state = editorReducer(state, { type: "openExisting", logicalName: "new_regarding" });

    expect(state.mode).toBe("existing");
    expect(state.lookupLogicalName).toBe("new_regarding");
    expect(state.selectedReferenced).toBeNull();

    state = editorReducer(state, {
      type: "loaded",
      drafts: [],
      displayName: "Regarding",
      fragment: "Regarding",
      prefix: "new_",
    });
    expect(state).toMatchObject({ displayName: "Regarding", existingPrefix: "new_", fragmentEdited: true });
  });
});
