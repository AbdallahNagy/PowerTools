import { describe, expect, it } from "vitest";
import { messageEffect } from "../../src/electron/communityTools/messageEffects";

describe("messageEffect", () => {
  it.each(["WhoAmI", "RetrieveMultiple", "RetrieveEntity"])("%s is read", (m) => {
    expect(messageEffect(m)).toBe("read");
  });

  it.each([
    "Create", "Update", "Upsert", "Associate", "SetState", "Assign", "ExecuteWorkflow",
    "GrantAccess", "AddMembersTeam", "PublishXml", "CreateAttribute",
  ])("%s is change", (m) => {
    expect(messageEffect(m)).toBe("change");
  });

  it.each([
    "Delete", "BulkDelete", "Disassociate", "DeleteEntity", "DeleteAttribute", "DeleteRelationship",
    "DeleteOptionValue", "RemoveSolutionComponent", "CloneAsSolution", "Merge", "RevokeAccess",
    "RemoveMembersTeam", "RemoveActiveCustomizations",
  ])("%s is destructive", (m) => {
    expect(messageEffect(m)).toBe("destructive");
  });

  it("is case-insensitive", () => {
    expect(messageEffect("delete")).toBe("destructive");
  });

  it("treats unknown messages as destructive", () => {
    expect(messageEffect("new_CustomAction")).toBe("destructive");
  });

  it.each(["ExecuteMultiple", "ExecuteTransaction", "ExecuteAsync"])("%s is forbidden", (m) => {
    expect(messageEffect(m)).toBe("forbidden");
  });
});
