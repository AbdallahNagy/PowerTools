import { expect, test } from "vitest";
import * as fetchxmlModel from "../../model/fetchxml.ts";
import { validateTree } from "../../model/validation.ts";

const { buildFetchXml } = fetchxmlModel;

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

function relationshipNode(id, relationship, children, logic = "and") {
  return {
    id,
    kind: "relationship",
    relationship,
    group: { id: `${id}-group`, kind: "group", logic, children },
  };
}

test("renders existing root field conditions unchanged through fieldRef", () => {
  const xml = buildFetchXml(
    "account",
    group([condition("c1", { kind: "root", field: "name" }, "like", "Contoso")]),
    ["name"],
  );

  expect(xml).toBe('<fetch><entity name="account"><attribute name="name" /><filter type="and"><condition attribute="name" operator="like" value="%Contoso%" /></filter></entity></fetch>');
});

test.each([
  ["like", "%Acme[[]West][_]100[%]]%"],
  ["not-like", "%Acme[[]West][_]100[%]]%"],
  ["begins-with", "Acme[[]West][_]100[%]]%"],
  ["ends-with", "%Acme[[]West][_]100[%]]"],
])("renders user-entered wildcard characters literally for %s", (operator, expectedValue) => {
  const xml = buildFetchXml(
    "account",
    group([condition("c1", { kind: "root", field: "name" }, operator, "Acme[West]_100%]")]),
  );

  expect(xml).toBe(`<fetch><entity name="account"><filter type="and"><condition attribute="name" operator="${operator === "not-like" ? "not-like" : "like"}" value="${expectedValue}" /></filter></entity></fetch>`);
});

test("renders one-hop many-to-one related field conditions as link-entity filters", () => {
  const xml = buildFetchXml(
    "contact",
    group([condition("c1", { kind: "related", path: accountPath, field: "name" }, "like", "Contoso")]),
  );

  expect(xml).toBe('<fetch><entity name="contact"><link-entity name="account" from="accountid" to="parentcustomerid" alias="rel_parentcustomerid_account" link-type="inner"><filter type="and"><condition attribute="name" operator="like" value="%Contoso%" /></filter></link-entity></entity></fetch>');
});

test("renders one-to-many child relationship filters with child join direction", () => {
  const xml = buildFetchXml(
    "account",
    group([condition("c1", { kind: "related", path: contactChildPath, field: "statecode" }, "eq", "0")]),
  );

  expect(xml).toBe('<fetch><entity name="account"><link-entity name="contact" from="parentcustomerid" to="accountid" alias="rel_contact_parentcustomerid" link-type="inner"><filter type="and"><condition attribute="statecode" operator="eq" value="0" /></filter></link-entity></entity></fetch>');
});

test("creates deterministic path segments from relationship schema names", () => {
  const segment = fetchxmlModel.createRelationshipPathSegment(
    {
      schemaName: "contact_customer_accounts",
      relationshipType: "many-to-one",
      sourceEntity: "contact",
      targetEntity: "account",
      sourceAttribute: "parentcustomerid",
      targetAttribute: "accountid",
      displayName: "Parent customer",
      isCustomRelationship: false,
    },
    [],
    "Accounts (Parent customer)",
  );

  expect({ ...segment, alias: undefined }).toEqual({
    relationshipSchemaName: "contact_customer_accounts",
    relationshipType: "many-to-one",
    sourceEntity: "contact",
    targetEntity: "account",
    sourceAttribute: "parentcustomerid",
    targetAttribute: "accountid",
    linkFromAttribute: "accountid",
    linkToAttribute: "parentcustomerid",
    alias: undefined,
    label: "Accounts (Parent customer)",
  });
  expect(segment.alias).toMatch(/^rel_0_account_[a-f0-9]{8}$/);
});

test("creates unique aliases for the same relationship reached through different paths", () => {
  const relationship = {
    schemaName: "contact_parent_contact",
    relationshipType: "many-to-one",
    sourceEntity: "contact",
    targetEntity: "contact",
    sourceAttribute: "parentcontactid",
    targetAttribute: "contactid",
    displayName: "Parent contact",
    isCustomRelationship: false,
  };
  const first = fetchxmlModel.createRelationshipPathSegment(relationship, accountPath);
  const second = fetchxmlModel.createRelationshipPathSegment(relationship, contactChildPath);

  expect(first.alias).not.toBe(second.alias);
});

test("renders relationship filters nested three levels deep", () => {
  const threeHopPath = [
    accountPath[0],
    {
      relationshipSchemaName: "account_primary_contact",
      relationshipType: "many-to-one",
      sourceEntity: "account",
      targetEntity: "contact",
      sourceAttribute: "primarycontactid",
      targetAttribute: "contactid",
      linkFromAttribute: "contactid",
      linkToAttribute: "primarycontactid",
      alias: "rel_1_account_primary_contact",
    },
    {
      relationshipSchemaName: "contact_parent_contact",
      relationshipType: "many-to-one",
      sourceEntity: "contact",
      targetEntity: "contact",
      sourceAttribute: "parentcontactid",
      targetAttribute: "contactid",
      linkFromAttribute: "contactid",
      linkToAttribute: "parentcontactid",
      alias: "rel_2_contact_parent_contact",
    },
  ];

  const xml = buildFetchXml(
    "contact",
    group([condition("c1", { kind: "related", path: threeHopPath, field: "lastname" }, "eq", "Smith")]),
  );

  expect(xml).toBe('<fetch><entity name="contact"><link-entity name="account" from="accountid" to="parentcustomerid" alias="rel_parentcustomerid_account" link-type="inner"><link-entity name="contact" from="contactid" to="primarycontactid" alias="rel_1_account_primary_contact" link-type="inner"><link-entity name="contact" from="contactid" to="parentcontactid" alias="rel_2_contact_parent_contact" link-type="inner"><filter type="and"><condition attribute="lastname" operator="eq" value="Smith" /></filter></link-entity></link-entity></link-entity></entity></fetch>');
});

test("renders an explicit relationship scope with local field conditions", () => {
  const xml = buildFetchXml(
    "contact",
    group([
      relationshipNode(
        "r1",
        accountPath[0],
        [condition("c1", { kind: "root", field: "name" }, "like", "Contoso")],
      ),
    ]),
  );

  expect(xml).toBe('<fetch><entity name="contact"><link-entity name="account" from="accountid" to="parentcustomerid" alias="rel_parentcustomerid_account" link-type="inner"><filter type="and"><condition attribute="name" operator="like" value="%Contoso%" /></filter></link-entity></entity></fetch>');
});

test("renders recursively nested explicit relationship scopes", () => {
  const primaryContact = {
    relationshipSchemaName: "account_primary_contact",
    relationshipType: "many-to-one",
    sourceEntity: "account",
    targetEntity: "contact",
    sourceAttribute: "primarycontactid",
    targetAttribute: "contactid",
    linkFromAttribute: "contactid",
    linkToAttribute: "primarycontactid",
    alias: "rel_account_primary_contact",
  };
  const xml = buildFetchXml(
    "contact",
    group([
      relationshipNode("r1", accountPath[0], [
        relationshipNode(
          "r2",
          primaryContact,
          [condition("c1", { kind: "root", field: "lastname" }, "eq", "Smith")],
        ),
      ]),
    ]),
  );

  expect(xml).toBe('<fetch><entity name="contact"><link-entity name="account" from="accountid" to="parentcustomerid" alias="rel_parentcustomerid_account" link-type="inner"><link-entity name="contact" from="contactid" to="primarycontactid" alias="rel_account_primary_contact" link-type="inner"><filter type="and"><condition attribute="lastname" operator="eq" value="Smith" /></filter></link-entity></link-entity></entity></fetch>');
});

test("lists only many-to-one lookup relationships", () => {
  const relationships = [
    {
      schemaName: "contact_customer_accounts",
      relationshipType: "many-to-one",
      sourceEntity: "contact",
      targetEntity: "account",
      sourceAttribute: "parentcustomerid",
      targetAttribute: "accountid",
    },
    {
      schemaName: "account_contacts",
      relationshipType: "one-to-many",
      sourceEntity: "account",
      targetEntity: "contact",
      sourceAttribute: "accountid",
      targetAttribute: "parentcustomerid",
    },
  ];

  expect(fetchxmlModel.selectLookupRelationships(relationships).map((relationship) => relationship.schemaName)).toEqual(["contact_customer_accounts"]);
});

test("rejects explicit relationship scopes directly inside OR groups", () => {
  const errors = validateTree(
    group(
      [
        condition("c1", { kind: "root", field: "lastname" }, "eq", "Smith"),
        relationshipNode(
          "r1",
          accountPath[0],
          [condition("c2", { kind: "root", field: "name" }, "like", "Contoso")],
        ),
      ],
      "or",
    ),
  );

  expect(errors).toEqual([
    {
      nodeId: "root",
      message: "Related table filters can only be added to AND groups.",
    },
  ]);
});

test("rejects relationship scopes nested anywhere inside OR groups", () => {
  const nestedGroup = {
    id: "nested",
    kind: "group",
    logic: "and",
    children: [
      relationshipNode(
        "r1",
        accountPath[0],
        [condition("c2", { kind: "root", field: "name" }, "like", "Contoso")],
      ),
    ],
  };
  const errors = validateTree(
    group(
      [
        condition("c1", { kind: "root", field: "lastname" }, "eq", "Smith"),
        nestedGroup,
      ],
      "or",
    ),
  );

  expect(errors).toEqual([
    {
      nodeId: "root",
      message: "Related table filters can only be added to AND groups.",
    },
  ]);
});

test("shares one link-entity for multiple conditions on the same relationship path", () => {
  const xml = buildFetchXml(
    "contact",
    group([
      condition("c1", { kind: "related", path: accountPath, field: "name" }, "like", "Contoso"),
      condition("c2", { kind: "related", path: accountPath, field: "accountnumber" }, "eq", "123"),
    ]),
  );

  expect(xml).toBe('<fetch><entity name="contact"><link-entity name="account" from="accountid" to="parentcustomerid" alias="rel_parentcustomerid_account" link-type="inner"><filter type="and"><condition attribute="name" operator="like" value="%Contoso%" /><condition attribute="accountnumber" operator="eq" value="123" /></filter></link-entity></entity></fetch>');
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

  expect(xml).toBe('<fetch><entity name="contact"><link-entity name="account" from="accountid" to="parentcustomerid" alias="rel_parentcustomerid_account" link-type="inner"><filter type="or"><condition attribute="name" operator="like" value="%Contoso%" /><condition attribute="accountnumber" operator="eq" value="123" /></filter></link-entity></entity></fetch>');
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

  expect(errors).toEqual([
    {
      nodeId: "root",
      message: "OR groups can only combine conditions from the same table path.",
    },
  ]);
});
