import { expect, test } from "vitest";
import * as filterTree from "../../hooks/useFilterTree.ts";

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

test("adds a related table in place of the blank starter condition", () => {
  const root = {
    id: "root",
    kind: "group",
    logic: "and",
    children: [{ id: "blank", kind: "condition", field: null, fieldRef: null, operator: null }],
  };

  const result = filterTree.addRelationshipToTree(root, "root", accountRelationship);

  expect(result.children.length).toBe(1);
  expect(result.children[0].kind).toBe("relationship");
  expect(result.children[0].relationship.targetEntity).toBe("account");
  expect(result.children[0].relationship.alias).toMatch(/^rel_parentcustomerid_account_[a-zA-Z0-9]{8}$/);
  expect(result.children[0].group.children[0].kind).toBe("condition");
});

test("appends a related table after existing conditions", () => {
  const root = {
    id: "root",
    kind: "group",
    logic: "and",
    children: [{ id: "name", kind: "condition", field: "firstname", operator: "eq", value: "Ada" }],
  };

  const result = filterTree.addRelationshipToTree(root, "root", accountRelationship);

  expect(result.children.map((child) => child.kind)).toEqual(["condition", "relationship"]);
  expect(result.children[0].id).toBe("name");
});

test("adds a related table inside a related table's filter", () => {
  const root = {
    id: "root",
    kind: "group",
    logic: "and",
    children: [
      {
        id: "account",
        kind: "relationship",
        relationship: accountRelationship,
        group: {
          id: "account-group",
          kind: "group",
          logic: "and",
          children: [{ id: "name", kind: "condition", field: "name", operator: "eq", value: "Contoso" }],
        },
      },
    ],
  };
  const ownerRelationship = {
    ...accountRelationship,
    relationshipSchemaName: "account_primary_contact",
    sourceEntity: "account",
    targetEntity: "contact",
    sourceAttribute: "primarycontactid",
    targetAttribute: "contactid",
    linkFromAttribute: "contactid",
    linkToAttribute: "primarycontactid",
    alias: "rel_primarycontactid_contact",
  };

  const result = filterTree.addRelationshipToTree(root, "account-group", ownerRelationship);

  expect(result.children[0].group.children.map((child) => child.kind)).toEqual(["condition", "relationship"]);
  expect(result.children[0].group.children[1].relationship.targetEntity).toBe("contact");
});
