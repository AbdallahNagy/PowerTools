import { expect, test } from "vitest";
import * as filterTree from "../src/ui/components/tools/MetadataExplorer/hooks/useFilterTree.ts";

const accountRelationship = {
  relationshipSchemaName: "contact_customer_accounts",
  relationshipType: "many-to-one",
  sourceEntity: "contact",
  targetEntity: "account",
  sourceAttribute: "parentcustomerid",
  targetAttribute: "accountid",
  linkFromAttribute: "accountid",
  linkToAttribute: "parentcustomerid",
  alias: "rel_parentcustomerid_account",
  label: "Account (parentcustomerid)",
};

test("replaces a condition with a relationship scope at the same position", () => {
  const root = {
    id: "root",
    kind: "group",
    logic: "and",
    children: [
      { id: "before", kind: "condition", field: "firstname", operator: "eq", value: "Ada" },
      { id: "target", kind: "condition", field: null, operator: null },
      { id: "after", kind: "condition", field: "lastname", operator: "eq", value: "Lovelace" },
    ],
  };

  const result = filterTree.replaceConditionWithRelationshipInTree(
    root,
    "target",
    accountRelationship,
  );

  expect(result.children[0].id).toBe("before");
  expect(result.children[2].id).toBe("after");
  expect(result.children[1].kind).toBe("relationship");
  expect(result.children[1].relationship.alias).toMatch(/^rel_parentcustomerid_account_[a-zA-Z0-9]{8}$/);
  expect(result.children[1].group.logic).toBe("and");
  expect(result.children[1].group.children.length).toBe(1);
  expect(result.children[1].group.children[0].kind).toBe("condition");
  expect(result.children[1].group.children[0].field).toBe(null);
});

test("creates unique aliases for separate scopes using the same relationship", () => {
  const root = {
    id: "root",
    kind: "group",
    logic: "and",
    children: [
      { id: "first", kind: "condition", field: null, operator: null },
      { id: "second", kind: "condition", field: null, operator: null },
    ],
  };

  const firstResult = filterTree.replaceConditionWithRelationshipInTree(
    root,
    "first",
    accountRelationship,
  );
  const result = filterTree.replaceConditionWithRelationshipInTree(
    firstResult,
    "second",
    accountRelationship,
  );

  expect(result.children[0].relationship.alias).not.toBe(
    result.children[1].relationship.alias,
  );
});
