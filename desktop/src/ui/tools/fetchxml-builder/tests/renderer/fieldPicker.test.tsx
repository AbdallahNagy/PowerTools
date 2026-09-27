import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { EntityInfo } from "../../../../shared/contracts/dataverse";
import { FieldPicker } from "../../components/filter-builder/FieldPicker";
import type { FieldMetadata, RelationshipMetadata } from "../../model/types";
import { renderWithProviders } from "../../../../../../test/support/render";

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

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

const nameField: FieldMetadata = {
  logicalName: "name",
  displayName: "Account Name",
  attributeType: "String",
  isPrimaryId: false,
  isCustomAttribute: false,
  isInDefaultView: true,
  requiredLevel: "None",
  isValidForCreate: true,
  isValidForUpdate: true,
};

const primaryContact: FieldMetadata = {
  logicalName: "primarycontactid",
  displayName: "Primary Contact",
  attributeType: "Lookup",
  isPrimaryId: false,
  isCustomAttribute: false,
  isInDefaultView: false,
  requiredLevel: "None",
  isValidForCreate: true,
  isValidForUpdate: true,
  targets: ["contact"],
};

const relationship: RelationshipMetadata = {
  schemaName: "account_primary_contact",
  relationshipType: "many-to-one",
  sourceEntity: "account",
  targetEntity: "contact",
  sourceAttribute: "primarycontactid",
  targetAttribute: "contactid",
  displayName: "Primary Contact",
  isCustomRelationship: false,
};

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      width: 224,
      height: 32,
      top: 0,
      left: 0,
      right: 224,
      bottom: 32,
      toJSON() {
        return {};
      },
    }) as DOMRect;
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("FieldPicker", () => {
  it("selects a field through SearchableSelect", async () => {
    const onChange = vi.fn();
    const onSelectRelationship = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <FieldPicker
        value={null}
        fields={[nameField, primaryContact]}
        tables={[account, contact]}
        relationships={[relationship]}
        path={[]}
        allowRelationships
        onChange={onChange}
        onSelectRelationship={onSelectRelationship}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Field" }));
    await user.click(await screen.findByRole("option", { name: /Account Name/ }));

    expect(onChange).toHaveBeenCalledWith({ kind: "root", field: "name" });
    expect(onSelectRelationship).not.toHaveBeenCalled();
  });

  it("selects a related table through grouped options", async () => {
    const onChange = vi.fn();
    const onSelectRelationship = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <FieldPicker
        value={null}
        fields={[nameField, primaryContact]}
        tables={[account, contact]}
        relationships={[relationship]}
        path={[]}
        allowRelationships
        onChange={onChange}
        onSelectRelationship={onSelectRelationship}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Field" }));
    expect(await screen.findByRole("group", { name: "Related tables" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /Primary Contact > Contact/ }));

    expect(onChange).not.toHaveBeenCalled();
    expect(onSelectRelationship).toHaveBeenCalledWith(
      expect.objectContaining({
        relationshipSchemaName: "account_primary_contact",
        targetEntity: "contact",
        sourceAttribute: "primarycontactid",
      }),
    );
  });
});
