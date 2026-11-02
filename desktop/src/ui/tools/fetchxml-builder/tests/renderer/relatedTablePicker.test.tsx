import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { EntityInfo } from "../../../../shared/contracts/dataverse";
import { DragProvider } from "../../components/filter-builder/DragProvider";
import { GroupNode } from "../../components/filter-builder/GroupNode";
import { FetchXmlBuilderProvider } from "../../context/FetchXmlBuilderProvider";
import { addRelationshipToTree } from "../../hooks/useFilterTree";
import { buildFetchXml } from "../../model/fetchxml";
import type {
  FieldMetadata,
  FilterGroup,
  RelationshipMetadata,
  RelationshipPathSegment,
} from "../../model/types";

const tables: EntityInfo[] = [
  { logicalName: "contact", displayName: "Contact", primaryIdAttribute: "contactid", primaryNameAttribute: "fullname", isCustom: false },
  { logicalName: "account", displayName: "Account", primaryIdAttribute: "accountid", primaryNameAttribute: "name", isCustom: false },
  { logicalName: "systemuser", displayName: "User", primaryIdAttribute: "systemuserid", primaryNameAttribute: "fullname", isCustom: false },
];

function lookup(logicalName: string, displayName: string): FieldMetadata {
  return {
    logicalName,
    displayName,
    attributeType: "Lookup",
    isPrimaryId: false,
    isCustomAttribute: false,
    isInDefaultView: false,
    requiredLevel: "None",
    isValidForCreate: true,
    isValidForUpdate: true,
  };
}

const fields = [lookup("parentcustomerid", "Company Name"), lookup("createdby", "Created By")];

const relationships: RelationshipMetadata[] = [
  {
    schemaName: "contact_customer_accounts",
    relationshipType: "many-to-one",
    sourceEntity: "contact",
    targetEntity: "account",
    sourceAttribute: "parentcustomerid",
    targetAttribute: "accountid",
    displayName: "contact_customer_accounts",
    isCustomRelationship: false,
  },
  {
    schemaName: "lk_contactbase_createdby",
    relationshipType: "many-to-one",
    sourceEntity: "contact",
    targetEntity: "systemuser",
    sourceAttribute: "createdby",
    targetAttribute: "systemuserid",
    displayName: "lk_contactbase_createdby",
    isCustomRelationship: false,
  },
  {
    schemaName: "contact_tasks",
    relationshipType: "one-to-many",
    sourceEntity: "contact",
    targetEntity: "task",
    sourceAttribute: "contactid",
    targetAttribute: "regardingobjectid",
    displayName: "contact_tasks",
    isCustomRelationship: false,
  },
];

function blankRoot(logic: "and" | "or" = "and"): FilterGroup {
  return {
    id: "root",
    kind: "group",
    logic,
    children: [{ id: "blank", kind: "condition", field: null, fieldRef: null, operator: null }],
  };
}

function renderGroup(root: FilterGroup) {
  const actions = {
    root,
    addCondition: vi.fn(),
    addGroup: vi.fn(),
    addRelationship: vi.fn(),
    replaceConditionWithRelationship: vi.fn(),
    updateCondition: vi.fn(),
    toggleLogic: vi.fn(),
    remove: vi.fn(),
    duplicate: vi.fn(),
    move: vi.fn(),
    reset: vi.fn(),
    load: vi.fn(),
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <FetchXmlBuilderProvider connectionId={null} tables={tables}>
        <DragProvider root={root}>
          <GroupNode
            group={root}
            fields={fields}
            rootEntity={tables[0]}
            connectionId={null}
            tables={tables}
            relationships={relationships}
            errors={[]}
            depth={0}
            path={[]}
            isRoot
            actions={actions}
          />
        </DragProvider>
      </FetchXmlBuilderProvider>
    </QueryClientProvider>,
  );

  return actions;
}

describe("FetchXML Builder related table filters", () => {
  it("lists the table's lookups and adds the chosen one to the group", () => {
    const actions = renderGroup(blankRoot());

    fireEvent.click(screen.getByRole("button", { name: "+ related table" }));
    const picker = screen.getByRole("combobox", { name: "Related table" });
    expect(picker).toHaveFocus();
    const list = screen.getByRole("listbox", { name: "Related table" });
    expect(within(list).getAllByRole("option").map((option) => option.getAttribute("aria-label"))).toEqual([
      "Company Name > Account (account)",
      "Created By > User (systemuser)",
    ]);

    fireEvent.change(picker, { target: { value: "company" } });
    fireEvent.keyDown(picker, { key: "Enter" });

    expect(actions.addRelationship).toHaveBeenCalledWith(
      "root",
      expect.objectContaining({
        targetEntity: "account",
        linkFromAttribute: "accountid",
        linkToAttribute: "parentcustomerid",
        label: "Company Name > Account",
      }),
    );
    expect(screen.getByRole("button", { name: "+ related table" })).toBeInTheDocument();
  });

  it("does not offer related tables in an OR group", () => {
    renderGroup(blankRoot("or"));

    expect(screen.queryByRole("button", { name: "+ related table" })).not.toBeInTheDocument();
  });

  it("builds a link-entity filter from the added related table", () => {
    const actions = renderGroup(blankRoot());
    fireEvent.click(screen.getByRole("button", { name: "+ related table" }));
    fireEvent.click(screen.getByRole("option", { name: "Company Name > Account (account)" }));
    const segment = actions.addRelationship.mock.calls[0][1] as RelationshipPathSegment;

    const withRelationship = addRelationshipToTree(blankRoot(), "root", segment);
    const relationship = withRelationship.children[0];
    if (relationship.kind !== "relationship") throw new Error("Expected a related table filter");
    const filled: FilterGroup = {
      ...withRelationship,
      children: [
        {
          ...relationship,
          group: {
            ...relationship.group,
            children: [
              { id: "name", kind: "condition", field: "name", fieldRef: { kind: "root", field: "name" }, operator: "eq", value: "Contoso" },
            ],
          },
        },
      ],
    };

    expect(buildFetchXml("contact", filled, ["fullname"])).toBe(
      '<fetch><entity name="contact"><attribute name="fullname" />' +
        `<link-entity name="account" from="accountid" to="parentcustomerid" alias="${relationship.relationship.alias}" link-type="inner">` +
        '<filter type="and"><condition attribute="name" operator="eq" value="Contoso" /></filter>' +
        "</link-entity></entity></fetch>",
    );
  });
});
