import { useState } from "react";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AttributePickerModal } from "../../components/dialogs/AttributePickerModal";
import type { EntityAttributeDto } from "../../model/contracts";
import { renderWithProviders } from "../../../../../../test/support/render";

const attributes: EntityAttributeDto[] = [
  {
    logicalName: "accountid",
    displayName: "Account",
    attributeType: "Uniqueidentifier",
    isPrimaryId: true,
  },
  {
    logicalName: "name",
    displayName: "Account Name",
    attributeType: "String",
    isPrimaryId: false,
  },
  {
    logicalName: "revenue",
    displayName: "Revenue",
    attributeType: "Money",
    isPrimaryId: false,
  },
];

function Harness({
  initialSelected = [],
  isLoading,
}: {
  initialSelected?: string[];
  isLoading?: boolean;
}) {
  const [selected, setSelected] = useState(initialSelected);
  return (
    <AttributePickerModal
      open
      attributes={attributes}
      selected={selected}
      isLoading={isLoading}
      onChange={setSelected}
      onClose={() => undefined}
    />
  );
}

function checkedNames() {
  return screen
    .getAllByRole("checkbox")
    .filter((input) => (input as HTMLInputElement).checked)
    .map((input) => input.closest("label")?.textContent ?? "");
}

describe("AttributePickerModal", () => {
  it("selects every visible attribute", () => {
    renderWithProviders(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Select all" }));

    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(checkedNames()).toEqual([
      "Account (accountid)",
      "Account Name (name)",
      "Revenue (revenue)",
    ]);
    expect(screen.getByRole("button", { name: "Select all" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Select none" })).toBeEnabled();
  });

  it("clears every visible attribute", () => {
    renderWithProviders(<Harness initialSelected={["accountid", "name", "revenue"]} />);

    fireEvent.click(screen.getByRole("button", { name: "Select none" }));

    expect(screen.getByText("0 selected")).toBeInTheDocument();
    expect(checkedNames()).toEqual([]);
    expect(screen.getByRole("button", { name: "Select none" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Select all" })).toBeEnabled();
  });

  it("selects only search matches and keeps hidden selections", () => {
    renderWithProviders(<Harness initialSelected={["revenue"]} />);

    fireEvent.change(screen.getByPlaceholderText("Search attributes…"), {
      target: { value: "Account" },
    });
    expect(screen.queryByText("Revenue")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.click(screen.getByLabelText("Clear search"));

    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(checkedNames()).toEqual([
      "Account (accountid)",
      "Account Name (name)",
      "Revenue (revenue)",
    ]);
  });

  it("clears only search matches and keeps hidden selections", () => {
    renderWithProviders(<Harness initialSelected={["accountid", "name", "revenue"]} />);

    fireEvent.change(screen.getByPlaceholderText("Search attributes…"), {
      target: { value: "Revenue" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Select none" }));
    fireEvent.click(screen.getByLabelText("Clear search"));

    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(checkedNames()).toEqual(["Account (accountid)", "Account Name (name)"]);
  });

  it("disables bulk actions while loading or when nothing matches", () => {
    const { rerender } = renderWithProviders(<Harness isLoading />);

    expect(screen.getByRole("button", { name: "Select all" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Select none" })).toBeDisabled();

    rerender(<Harness />);
    fireEvent.change(screen.getByPlaceholderText("Search attributes…"), {
      target: { value: "does-not-exist" },
    });

    expect(screen.getByRole("button", { name: "Select all" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Select none" })).toBeDisabled();
  });
});
