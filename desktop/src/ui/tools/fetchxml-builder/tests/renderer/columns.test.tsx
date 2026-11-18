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
    fireEvent.click(screen.getByRole("checkbox", { name: /^Description/ }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApply).toHaveBeenCalledWith(["name", "description"]);
  });

  it("selects all columns, then deselects all when clicked again", () => {
    const onApply = vi.fn();
    render(
      <ColumnPickerModal open fields={fields} columns={["name"]} onClose={() => {}} onApply={onApply} />,
    );

    const selectAll = screen.getByRole("checkbox", { name: /Select all/ });
    expect(selectAll).not.toBeChecked();
    expect((selectAll as HTMLInputElement).indeterminate).toBe(true);

    fireEvent.click(selectAll);
    expect(selectAll).toBeChecked();
    expect(screen.getByText("3 selected")).toBeInTheDocument();

    fireEvent.click(selectAll);
    expect(selectAll).not.toBeChecked();
    expect(screen.getByText("0 selected")).toBeInTheDocument();
  });

  it("limits select all to the columns matching the search", () => {
    const onApply = vi.fn();
    render(
      <ColumnPickerModal open fields={fields} columns={["name"]} onClose={() => {}} onApply={onApply} />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Search columns" }), { target: { value: "phone" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Select all matching/ }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApply).toHaveBeenCalledWith(["name", "telephone1"]);
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
