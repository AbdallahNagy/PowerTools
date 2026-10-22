import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { EntityInfo } from "../../../../shared/contracts/dataverse";
import { FieldPicker } from "../../components/filter-builder/FieldPicker";
import type { FieldMetadata, RelationshipMetadata } from "../../model/types";

function field(logicalName: string, displayName: string, attributeType: FieldMetadata["attributeType"] = "String"): FieldMetadata {
  return {
    logicalName,
    displayName,
    attributeType,
    isPrimaryId: false,
    isCustomAttribute: false,
    isInDefaultView: false,
    requiredLevel: "None",
    isValidForCreate: true,
    isValidForUpdate: true,
  };
}

const fields = [
  field("name", "Account Name"),
  field("accountnumber", "Account Number"),
  field("revenue", "Annual Revenue", "Money"),
  field("primarycontactid", "Primary Contact", "Lookup"),
];

const tables: EntityInfo[] = [
  { logicalName: "contact", displayName: "Contact", primaryIdAttribute: "contactid", primaryNameAttribute: "fullname", isCustom: false },
];

const relationships: RelationshipMetadata[] = [
  {
    schemaName: "account_primary_contact",
    relationshipType: "many-to-one",
    sourceEntity: "account",
    targetEntity: "contact",
    sourceAttribute: "primarycontactid",
    targetAttribute: "contactid",
    displayName: "Primary Contact",
    isCustomRelationship: false,
  },
];

function renderPicker(onChange = vi.fn(), onSelectRelationship = vi.fn()) {
  render(
    <FieldPicker
      value={null}
      fields={fields}
      tables={tables}
      relationships={relationships}
      path={[]}
      allowRelationships
      onChange={onChange}
      onSelectRelationship={onSelectRelationship}
    />,
  );
  return { combobox: screen.getByRole("combobox"), onChange, onSelectRelationship };
}

describe("FieldPicker", () => {
  it("narrows fields and related tables by typed words", () => {
    const { combobox } = renderPicker();

    fireEvent.change(combobox, { target: { value: "acc num" } });
    expect(screen.getAllByRole("option").map((option) => option.getAttribute("aria-label"))).toEqual([
      "Account Number (accountnumber)",
    ]);

    fireEvent.change(combobox, { target: { value: "contact" } });
    expect(screen.getByText("Fields")).toBeInTheDocument();
    expect(screen.getByText("Related tables")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Primary Contact (primarycontactid)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Primary Contact > Contact (contact)" })).toBeInTheDocument();
  });

  it("matches the logical name", () => {
    const { combobox, onChange } = renderPicker();

    fireEvent.change(combobox, { target: { value: "revenue" } });
    fireEvent.keyDown(combobox, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith({ kind: "root", field: "revenue" });
  });

  it("opens a related table", () => {
    const { combobox, onSelectRelationship } = renderPicker();

    fireEvent.change(combobox, { target: { value: "> contact" } });
    fireEvent.click(screen.getByRole("option", { name: "Primary Contact > Contact (contact)" }));

    expect(onSelectRelationship).toHaveBeenCalledWith(
      expect.objectContaining({ targetEntity: "contact", label: "Primary Contact > Contact" }),
    );
  });
});
