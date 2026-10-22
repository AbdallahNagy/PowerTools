import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ColumnPickerModal } from "../../components/ColumnPickerModal";
import { ColumnsBar } from "../../components/ColumnsBar";
import type { EntityView, FieldMetadata } from "../../model/types";

function field(logicalName: string, displayName: string): FieldMetadata {
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

const fields = [
  field("name", "Account Name"),
  field("telephone1", "Main Phone"),
  field("description", "Description"),
];

const views: EntityView[] = [
  { id: "v1", name: "Active Accounts", kind: "system", isDefault: true, columns: ["name", "telephone1"], fetchXml: "" },
  { id: "v2", name: "My Phone List", kind: "personal", isDefault: false, columns: ["telephone1"], fetchXml: "" },
];

describe("FetchXML Builder columns", () => {
  it("adds a checked column after the current columns", () => {
    const onApply = vi.fn();
    render(
      <ColumnPickerModal open fields={fields} columns={["name"]} onClose={() => {}} onApply={onApply} />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Search columns" }), { target: { value: "desc" } });
    expect(screen.queryByText("Main Phone")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApply).toHaveBeenCalledWith(["name", "description"]);
  });

  it("lists system and personal views and removes a chosen column", () => {
    const onSelectView = vi.fn();
    const onRemoveColumn = vi.fn();
    render(
      <ColumnsBar
        columns={["name", "telephone1"]}
        fields={fields}
        views={views}
        viewsLoading={false}
        viewsError={null}
        selectedViewId=""
        onSelectView={onSelectView}
        onRemoveColumn={onRemoveColumn}
        onEditColumns={() => {}}
      />,
    );

    expect(screen.getByRole("group", { name: "System views" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "My views" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "View" }), { target: { value: "v2" } });
    expect(onSelectView).toHaveBeenCalledWith(views[1]);

    fireEvent.click(screen.getByRole("button", { name: "Remove Main Phone" }));
    expect(onRemoveColumn).toHaveBeenCalledWith("telephone1");
  });
});
