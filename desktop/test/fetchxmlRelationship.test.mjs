import test from "node:test";
import assert from "node:assert/strict";
import { buildFetchXml } from "../src/ui/components/tools/MetadataExplorer/model/fetchxml.ts";
import { validateTree } from "../src/ui/components/tools/MetadataExplorer/model/validation.ts";

const accountPath = [
  {
    relationshipSchemaName: "contact_customer_accounts",
    relationshipType: "many-to-one",
    sourceEntity: "contact",
    targetEntity: "account",
    sourceAttribute: "parentcustomerid",
    targetAttribute: "accountid",
    linkFromAttribute: "accountid",
    linkToAttribute: "parentcustomerid",
    alias: "rel_parentcustomerid_account",
  },
];

const contactChildPath = [
  {
    relationshipSchemaName: "account_primary_contact",
    relationshipType: "one-to-many",
    sourceEntity: "account",
    targetEntity: "contact",
    sourceAttribute: "accountid",
    targetAttribute: "parentcustomerid",
    linkFromAttribute: "parentcustomerid",
    linkToAttribute: "accountid",
    alias: "rel_contact_parentcustomerid",
  },
];

function group(children, logic = "and") {
  return { id: "root", kind: "group", logic, children };
}

function condition(id, fieldRef, operator = "eq", value = "x") {
  return { id, kind: "condition", fieldRef, field: null, operator, value };
}

test("renders existing root field conditions unchanged through fieldRef", () => {
  const xml = buildFetchXml(
    "account",
    group([condition("c1", { kind: "root", field: "name" }, "like", "Contoso")]),
    ["name"],
  );

  assert.equal(
    xml,
    '<fetch><entity name="account"><attribute name="name" /><filter type="and"><condition attribute="name" operator="like" value="%Contoso%" /></filter></entity></fetch>',
  );
});

test("renders one-hop many-to-one related field conditions as link-entity filters", () => {
  const xml = buildFetchXml(
    "contact",
    group([condition("c1", { kind: "related", path: accountPath, field: "name" }, "like", "Contoso")]),
  );

  assert.equal(
    xml,
    '<fetch><entity name="contact"><link-entity name="account" from="accountid" to="parentcustomerid" alias="rel_parentcustomerid_account" link-type="inner"><filter type="and"><condition attribute="name" operator="like" value="%Contoso%" /></filter></link-entity></entity></fetch>',
  );
});

test("renders one-to-many child relationship filters with child join direction", () => {
  const xml = buildFetchXml(
    "account",
    group([condition("c1", { kind: "related", path: contactChildPath, field: "statecode" }, "eq", "0")]),
  );

  assert.equal(
    xml,
    '<fetch><entity name="account"><link-entity name="contact" from="parentcustomerid" to="accountid" alias="rel_contact_parentcustomerid" link-type="inner"><filter type="and"><condition attribute="statecode" operator="eq" value="0" /></filter></link-entity></entity></fetch>',
  );
});

test("shares one link-entity for multiple conditions on the same relationship path", () => {
  const xml = buildFetchXml(
    "contact",
    group([
      condition("c1", { kind: "related", path: accountPath, field: "name" }, "like", "Contoso"),
      condition("c2", { kind: "related", path: accountPath, field: "accountnumber" }, "eq", "123"),
    ]),
  );

  assert.equal(
    xml,
    '<fetch><entity name="contact"><link-entity name="account" from="accountid" to="parentcustomerid" alias="rel_parentcustomerid_account" link-type="inner"><filter type="and"><condition attribute="name" operator="like" value="%Contoso%" /><condition attribute="accountnumber" operator="eq" value="123" /></filter></link-entity></entity></fetch>',
  );
});

test("preserves OR groups when all related conditions use the same path", () => {
  const xml = buildFetchXml(
    "contact",
    group(
      [
        condition("c1", { kind: "related", path: accountPath, field: "name" }, "like", "Contoso"),
        condition("c2", { kind: "related", path: accountPath, field: "accountnumber" }, "eq", "123"),
      ],
      "or",
    ),
  );

  assert.equal(
    xml,
    '<fetch><entity name="contact"><link-entity name="account" from="accountid" to="parentcustomerid" alias="rel_parentcustomerid_account" link-type="inner"><filter type="or"><condition attribute="name" operator="like" value="%Contoso%" /><condition attribute="accountnumber" operator="eq" value="123" /></filter></link-entity></entity></fetch>',
  );
});

test("rejects OR groups that mix root and related scopes", () => {
  const errors = validateTree(
    group(
      [
        condition("c1", { kind: "root", field: "lastname" }, "eq", "Smith"),
        condition("c2", { kind: "related", path: accountPath, field: "name" }, "like", "Contoso"),
      ],
      "or",
    ),
  );

  assert.deepEqual(errors, [
    {
      nodeId: "root",
      message: "OR groups can only combine conditions from the same table path.",
    },
  ]);
});
