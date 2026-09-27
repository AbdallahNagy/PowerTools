import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { SearchableSelect, type SearchableSelectOption } from "../../src/ui/shared/ui";

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const options: SearchableSelectOption[] = [
  { value: "account", label: "Account", description: "account" },
  { value: "contact", label: "Contact", description: "contact" },
  { value: "opportunity", label: "Opportunity", description: "opportunity" },
];

const groupedOptions: SearchableSelectOption[] = [
  { value: "field:name", label: "Account Name", description: "name", group: "Fields" },
  { value: "field:revenue", label: "Revenue", description: "revenue", group: "Fields" },
  { value: "relationship:0", label: "Primary Contact > Contact", group: "Related tables" },
];

function Harness({
  initialValue = "",
  selectOptions = options,
  disabled,
  variant = "popover",
  onChange = vi.fn(),
}: {
  initialValue?: string;
  selectOptions?: SearchableSelectOption[];
  disabled?: boolean;
  variant?: "popover" | "inline";
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <SearchableSelect
      aria-label="Table"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      options={selectOptions}
      placeholder="— select a table —"
      searchPlaceholder="Search tables…"
      disabled={disabled}
      variant={variant}
    />
  );
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      width: 288,
      height: 32,
      top: 0,
      left: 0,
      right: 288,
      bottom: 32,
      toJSON() {
        return {};
      },
    }) as DOMRect;
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("SearchableSelect", () => {
  it("filters options by label and description", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("combobox", { name: "Table" }));
    await user.keyboard("cont");

    expect(await screen.findByRole("option", { name: /Contact/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Account/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Opportunity/ })).not.toBeInTheDocument();
  });

  it("shows an empty state when nothing matches", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("combobox", { name: "Table" }));
    await user.keyboard("zzzz");

    expect(await screen.findByText("No matches")).toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("commits a click selection", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);

    await user.click(screen.getByRole("combobox", { name: "Table" }));
    await user.click(await screen.findByRole("option", { name: /Account/ }));

    expect(onChange).toHaveBeenCalledWith("account");
  });

  it("commits the focused option with Enter", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);

    const combobox = screen.getByRole("combobox", { name: "Table" });
    await user.click(combobox);
    await screen.findByRole("option", { name: /Account/ });
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalled();
  });

  it("closes on Escape without changing the value", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness initialValue="contact" onChange={onChange} />);

    await user.click(screen.getByRole("combobox", { name: "Table" }));
    expect(await screen.findByRole("option", { name: /Account/ })).toBeInTheDocument();
    await user.keyboard("{Escape}");

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Table" })).toHaveValue("Contact");
  });

  it("moves the highlighted option with arrow keys", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("combobox", { name: "Table" }));
    const account = await screen.findByRole("option", { name: /Account/ });
    const contact = screen.getByRole("option", { name: /Contact/ });

    await user.keyboard("{ArrowDown}");
    expect(contact).toHaveAttribute("data-focus");
    expect(account).not.toHaveAttribute("data-focus");
  });

  it("does not open when disabled", async () => {
    const user = userEvent.setup();
    render(<Harness disabled />);

    const combobox = screen.getByRole("combobox", { name: "Table" });
    expect(combobox).toBeDisabled();
    await user.click(combobox);

    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("renders option groups", async () => {
    const user = userEvent.setup();
    render(<Harness selectOptions={groupedOptions} />);

    await user.click(screen.getByRole("combobox", { name: "Table" }));

    expect(await screen.findByRole("group", { name: "Fields" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Related tables" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Account Name/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Primary Contact/ })).toBeInTheDocument();
  });

  it("keeps the inline list open after a selection", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness variant="inline" onChange={onChange} />);

    expect(screen.getByRole("option", { name: /Account/ })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /Contact/ }));

    expect(onChange).toHaveBeenCalledWith("contact");
    expect(screen.getByRole("option", { name: /Account/ })).toBeInTheDocument();
  });

  it("filters the inline list from the search box", async () => {
    render(<Harness variant="inline" />);

    fireEvent.change(screen.getByRole("combobox", { name: "Table" }), {
      target: { value: "opp" },
    });

    expect(screen.getByRole("option", { name: /Opportunity/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Account/ })).not.toBeInTheDocument();
  });
});
