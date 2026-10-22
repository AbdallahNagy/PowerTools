import { describe, expect, it } from "vitest";
import { buildFetchXml } from "../../model/fetchxml";
import type { FieldMetadata, FilterCondition, FilterRelationship, RelationshipMetadata } from "../../model/types";
import { mapLike, parseViewFilters } from "../../model/viewFilters";

function field(logicalName: string, displayName = logicalName): FieldMetadata {
  return {
    logicalName,
    displayName,
    attributeType: "String",
    isPrimaryId: false,
    isCustomAttribute: false,
    isInDefaultView: false,
    requiredLevel: "None",
    isValidForCreate: true,
    isValidForUpdate: true,
  };
}

const fields = [field("statecode"), field("ownerid"), field("name"), field("createdon"), field("primarycontactid", "Primary Contact")];
const relationships: RelationshipMetadata[] = [
  {
    schemaName: "account_primary_contact",
    relationshipType: "many-to-one",
    sourceEntity: "account",
    targetEntity: "contact",
    sourceAttribute: "primarycontactid",
    targetAttribute: "contactid",
    displayName: "account_primary_contact",
    isCustomRelationship: false,
  },
];
const context = {
  fields,
  relationships,
  tables: [{ logicalName: "contact", displayName: "Contact", primaryIdAttribute: "contactid", primaryNameAttribute: "fullname", isCustom: false }],
};

function conditions(xml: string): FilterCondition[] {
  return parseViewFilters(xml, context).root.children.filter(
    (child): child is FilterCondition => child.kind === "condition",
  );
}

describe("parseViewFilters", () => {
  it("loads an Active view's statecode filter as an editable condition", () => {
    const [condition] = conditions(
      '<fetch><entity name="account"><attribute name="name" /><filter type="and"><condition attribute="statecode" operator="eq" value="0" /></filter></entity></fetch>',
    );
    expect(condition).toMatchObject({ field: "statecode", operator: "eq", value: "0" });
  });

  it("keeps lookup names, current-user operators, and relative dates", () => {
    const [owner, contact, created] = conditions(
      '<fetch><entity name="account"><filter type="and">' +
        '<condition attribute="ownerid" operator="eq-userid" />' +
        '<condition attribute="primarycontactid" operator="in"><value uiname="Ann" uitype="contact">{0D2E5C7A-1111-4E2B-9C3D-000000000001}</value></condition>' +
        '<condition attribute="createdon" operator="last-x-days" value="30" />' +
        "</filter></entity></fetch>",
    );
    expect(owner).toMatchObject({ operator: "eq-userid" });
    expect(owner).not.toHaveProperty("value");
    expect(contact).toMatchObject({
      operator: "in",
      value: ["0d2e5c7a-1111-4e2b-9c3d-000000000001"],
      valueLabels: { "0d2e5c7a-1111-4e2b-9c3d-000000000001": "Ann" },
      lookupTarget: "contact",
    });
    expect(created).toMatchObject({ operator: "last-x-days", value: "30" });
  });

  it("turns an inner link-entity filter into a related-table filter that renders back", () => {
    const { root, skipped } = parseViewFilters(
      '<fetch><entity name="account"><filter type="or"><condition attribute="name" operator="like" value="%con%" /><condition attribute="name" operator="like" value="ab%" /></filter>' +
        '<link-entity name="contact" from="contactid" to="primarycontactid" alias="pc"><filter><condition attribute="lastname" operator="eq" value="Smith" /></filter></link-entity>' +
        "</entity></fetch>",
      context,
    );

    expect(skipped).toEqual([]);
    expect(root.logic).toBe("and");
    const [orGroup, related] = root.children;
    expect(orGroup).toMatchObject({ kind: "group", logic: "or" });
    expect(related).toMatchObject({
      kind: "relationship",
      relationship: { relationshipSchemaName: "account_primary_contact", label: "Primary Contact > Contact" },
    });

    const xml = buildFetchXml("account", root, ["name"]);
    expect(xml).toContain('<condition attribute="name" operator="like" value="%con%" />');
    expect(xml).toContain('<condition attribute="name" operator="like" value="ab%" />');
    const alias = (related as FilterRelationship).relationship.alias;
    expect(xml).toContain(
      `<link-entity name="contact" from="contactid" to="primarycontactid" alias="${alias}" link-type="inner"><filter type="and"><condition attribute="lastname" operator="eq" value="Smith" /></filter></link-entity>`,
    );
  });

  it("lists what it cannot load", () => {
    const { root, skipped } = parseViewFilters(
      '<fetch><entity name="account"><filter><condition attribute="statecode" operator="eq" value="0" />' +
        '<condition attribute="name" operator="contain-values" value="x" />' +
        '<condition attribute="gone" operator="eq" value="1" /></filter>' +
        '<link-entity name="contact" from="contactid" to="primarycontactid" link-type="outer"><filter><condition attribute="contactid" operator="null" /></filter></link-entity>' +
        "</entity></fetch>",
      context,
    );
    expect(root.children).toHaveLength(1);
    expect(skipped).toEqual([
      "name contain-values (operator not supported)",
      "gone eq (column not found)",
      "Filters on contact (outer join)",
    ]);
  });

  it("gives an empty filter for a view with no filter", () => {
    const { root, skipped } = parseViewFilters('<fetch><entity name="account"><attribute name="name" /></entity></fetch>', context);
    expect(skipped).toEqual([]);
    expect(root.children).toHaveLength(1);
    expect(root.children[0]).toMatchObject({ kind: "condition", field: null });
  });
});

describe("mapLike", () => {
  it("maps like patterns onto the builder operators", () => {
    expect(mapLike("like", "%a[_]b%")).toEqual({ operator: "like", value: "a_b" });
    expect(mapLike("like", "ab%")).toEqual({ operator: "begins-with", value: "ab" });
    expect(mapLike("like", "%ab")).toEqual({ operator: "ends-with", value: "ab" });
    expect(mapLike("like", "a%b")).toBeNull();
    expect(mapLike("not-like", "ab%")).toBeNull();
  });
});
