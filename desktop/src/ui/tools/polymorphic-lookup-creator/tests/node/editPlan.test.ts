import { describe, expect, it } from "vitest";
import { cascadeFields } from "../../model/cascade";
import { buildEditPlan, canCreateLookup, editOperationOrder } from "../../model/editPlan";
import { suggestSchemaFragment } from "../../model/schemaName";
import type { RelationshipDraft } from "../../model/types";

function draft(referencedLogicalName: string, patch: Partial<RelationshipDraft> = {}): RelationshipDraft {
  return {
    referencedLogicalName,
    schemaName: `new_${referencedLogicalName}Id`,
    fragment: `${referencedLogicalName}Id`,
    fragmentEdited: true,
    saved: true,
    isValidForAdvancedFind: true,
    menuBehavior: "UseCollectionName",
    menuGroup: "Details",
    menuOrder: 10000,
    menuLabel: "",
    ...patch,
  };
}

describe("polymorphic lookup schema names", () => {
  it("suggests a PascalCase fragment and keeps an existing Id suffix", () => {
    expect(suggestSchemaFragment("customer name")).toBe("CustomerNameId");
    expect(suggestSchemaFragment("Account Id")).toBe("AccountId");
    expect(suggestSchemaFragment("café note")).toBe("CafeNoteId");
    expect(suggestSchemaFragment("客户")).toBe("");
  });
});

describe("polymorphic lookup edit plan", () => {
  it("refuses fewer than two referenced tables and a save with no changes", () => {
    expect(buildEditPlan([], []).error).toBe("Select at least two referenced tables.");
    expect(buildEditPlan([draft("account")], [draft("account")]).error).toBe(
      "Select at least two referenced tables.",
    );
    expect(buildEditPlan([draft("account"), draft("contact")], [draft("account"), draft("contact")]).error).toBe(
      "No changes to save.",
    );
    expect(canCreateLookup({
      displayName: "Customer",
      schemaName: "new_CustomerId",
      referencedLogicalNames: ["account"],
      referencingLogicalName: "incident",
      solutionAware: false,
    })).toBe(false);
  });

  it("orders adds, then deletes, then updates", () => {
    const original = [draft("account"), draft("contact")];
    const current = [
      draft("account", { isValidForAdvancedFind: false }),
      draft("lead", { saved: false }),
    ];
    const result = buildEditPlan(current, original);
    expect(result.plan?.adds.map((item) => item.referencedLogicalName)).toEqual(["lead"]);
    expect(result.plan?.deletes.map((item) => item.referencedLogicalName)).toEqual(["contact"]);
    expect(result.plan?.updates.map((item) => item.referencedLogicalName)).toEqual(["account"]);
    expect(result.plan ? editOperationOrder(result.plan) : []).toEqual(["add", "delete", "update"]);
  });

  it("offers only the polymorphic cascade values", () => {
    expect(cascadeFields.map((field) => field.value)).toEqual([
      "NoCascade",
      "NoCascade",
      "NoCascade",
      "NoCascade",
      "NoCascade",
      "NoCascade",
      "RemoveLink",
    ]);
    expect(cascadeFields.every((field) => field.option === "No cascade" || field.option === "Remove link")).toBe(
      true,
    );
  });
});
