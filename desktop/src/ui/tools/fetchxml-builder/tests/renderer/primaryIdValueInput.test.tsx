import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { EntityInfo } from "../../../../shared/contracts/dataverse";
import { DragProvider } from "../../components/filter-builder/DragProvider";
import { GroupNode } from "../../components/filter-builder/GroupNode";
import { FetchXmlBuilderProvider } from "../../context/FetchXmlBuilderProvider";
import type { FieldMetadata, FilterGroup } from "../../model/types";

const account: EntityInfo = {
  logicalName: "account",
  displayName: "Account",
  primaryIdAttribute: "accountid",
  primaryNameAttribute: "name",
  isCustom: false,
};

const contact: EntityInfo = {
  logicalName: "contact",
  displayName: "Contact",
  primaryIdAttribute: "contactid",
  primaryNameAttribute: "fullname",
  isCustom: false,
};

const baseField: FieldMetadata = {
  logicalName: "accountid",
  displayName: "Account",
  attributeType: "Uniqueidentifier",
  isPrimaryId: true,
  isCustomAttribute: false,
  isInDefaultView: false,
  requiredLevel: "SystemRequired",
  isValidForCreate: false,
  isValidForUpdate: false,
};

function renderCondition(
  field: FieldMetadata,
  options: { operator?: "eq" | "in"; tables?: EntityInfo[]; value?: string | string[] } = {},
) {
  const root: FilterGroup = {
    id: "root",
    kind: "group",
    logic: "and",
    children: [
      {
        id: "condition",
        kind: "condition",
        field: field.logicalName,
        fieldRef: { kind: "root", field: field.logicalName },
        operator: options.operator ?? "eq",
        value: options.value,
      },
    ],
  };
  const actions = {
    root,
    addCondition: vi.fn(),
    addGroup: vi.fn(),
    replaceConditionWithRelationship: vi.fn(),
    updateCondition: vi.fn(),
    toggleLogic: vi.fn(),
    remove: vi.fn(),
    duplicate: vi.fn(),
    move: vi.fn(),
    reset: vi.fn(),
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const tables = options.tables ?? [account];

  render(
    <QueryClientProvider client={queryClient}>
      <FetchXmlBuilderProvider connectionName={null} tables={tables}>
        <DragProvider root={root}>
          <GroupNode
            group={root}
            fields={[field]}
            rootEntity={account}
            connectionName={null}
            tables={tables}
            relationships={[]}
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

describe("FetchXML Builder GUID value editors", () => {
  it("opens a record picker for the table primary ID", () => {
    renderCondition(baseField);

    fireEvent.click(screen.getByRole("button", { name: "Search records" }));

    expect(screen.getByPlaceholderText("Select record...")).toHaveAttribute("readonly");
    expect(screen.getByRole("option", { name: "Account (account)" })).toBeInTheDocument();
  });

  it("keeps an ordinary uniqueidentifier as a text value", () => {
    renderCondition({
      ...baseField,
      logicalName: "sampletrackingid",
      displayName: "Tracking ID",
      isPrimaryId: false,
      isCustomAttribute: true,
      isValidForCreate: true,
      isValidForUpdate: true,
    });

    expect(screen.queryByRole("button", { name: "Search records" })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Value…")).not.toHaveAttribute("readonly");
  });

  it("preserves the referenced table for existing multi-value lookups", () => {
    const actions = renderCondition(
      {
        ...baseField,
        logicalName: "primarycontactid",
        displayName: "Primary Contact",
        attributeType: "Lookup",
        isPrimaryId: false,
        targets: ["contact"],
      },
      { operator: "in", tables: [account, contact], value: ["contact-guid"] },
    );

    fireEvent.click(screen.getByRole("button", { name: "1 selected" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(actions.updateCondition).toHaveBeenCalledWith(
      "condition",
      expect.objectContaining({ lookupTarget: "contact" }),
    );
  });
});
