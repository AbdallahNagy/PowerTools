import test from "node:test";
import assert from "node:assert/strict";
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

  assert.equal(result.children[0].id, "before");
  assert.equal(result.children[2].id, "after");
  assert.equal(result.children[1].kind, "relationship");
  assert.match(result.children[1].relationship.alias, /^rel_parentcustomerid_account_[a-zA-Z0-9]{8}$/);
  assert.equal(result.children[1].group.logic, "and");
  assert.equal(result.children[1].group.children.length, 1);
  assert.equal(result.children[1].group.children[0].kind, "condition");
  assert.equal(result.children[1].group.children[0].field, null);
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

  assert.notEqual(
    result.children[0].relationship.alias,
    result.children[1].relationship.alias,
  );
});
