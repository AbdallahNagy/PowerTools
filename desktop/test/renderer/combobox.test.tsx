import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Combobox, Field, type ComboboxOption } from "../../src/ui/shared/ui";

const tables: ComboboxOption[] = [
  { value: "account", label: "Account", description: "account" },
  { value: "contact", label: "Contact", description: "contact" },
  { value: "new_accountsegment", label: "Account Segment", description: "new_accountsegment" },
  { value: "locked", label: "Locked", description: "locked", disabled: true },
  { value: "systemuser", label: "User", description: "systemuser" },
];

function Harness({ onChange = () => {}, options = tables }: { onChange?: (value: string) => void; options?: ComboboxOption[] }) {
  const [value, setValue] = useState("");
  return (
    <Field label="Table">
      <Combobox
        value={value}
        options={options}
        placeholder="Choose a table"
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
    </Field>
  );
}

const optionNames = () => screen.queryAllByRole("option").map((option) => option.textContent);

describe("Combobox", () => {
  it("is labelled by its field and shows the placeholder", () => {
    render(<Harness />);
    const combobox = screen.getByRole("combobox", { name: "Table" });
    expect(combobox).toHaveAttribute("placeholder", "Choose a table");
    expect(combobox).toHaveAttribute("aria-expanded", "false");
  });

  it("filters the list as the user types words", () => {
    render(<Harness />);
    const combobox = screen.getByRole("combobox", { name: "Table" });

    fireEvent.change(combobox, { target: { value: "seg acc" } });
    expect(combobox).toHaveAttribute("aria-expanded", "true");
    expect(optionNames()).toEqual(["Account Segmentnew_accountsegment"]);
    expect(screen.getByRole("option", { name: "Account Segment (new_accountsegment)" })).toBeInTheDocument();

    fireEvent.change(combobox, { target: { value: "systemuser" } });
    expect(optionNames()).toEqual(["Usersystemuser"]);

    fireEvent.change(combobox, { target: { value: "zzz" } });
    expect(screen.getByText("No matches.")).toBeInTheDocument();
  });

  it("selects an option with the mouse and shows it in the input", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const combobox = screen.getByRole("combobox", { name: "Table" });

    fireEvent.click(combobox);
    expect(screen.getAllByRole("option")).toHaveLength(tables.length);
    fireEvent.click(screen.getByRole("option", { name: /^Contact/ }));

    expect(onChange).toHaveBeenCalledWith("contact");
    expect(combobox).toHaveValue("Contact (contact)");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("supports the keyboard and skips disabled options", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const combobox = screen.getByRole("combobox", { name: "Table" });

    fireEvent.change(combobox, { target: { value: "e" } });
    // Account Segment, Locked (disabled), User.
    expect(combobox).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[0]!.id);
    fireEvent.keyDown(combobox, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: /^User/ }).id).toBe(combobox.getAttribute("aria-activedescendant"));
    fireEvent.keyDown(combobox, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("systemuser");
    expect(combobox).toHaveValue("User (systemuser)");
  });

  it("restores the selection on Escape without changing it", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const combobox = screen.getByRole("combobox", { name: "Table" });

    fireEvent.change(combobox, { target: { value: "cont" } });
    fireEvent.keyDown(combobox, { key: "Escape" });

    expect(onChange).not.toHaveBeenCalled();
    expect(combobox).toHaveValue("");
    expect(combobox).toHaveAttribute("aria-expanded", "false");
  });

  it("does not open when disabled", () => {
    render(<Combobox value="" options={tables} onChange={() => {}} disabled aria-label="Table" />);
    const combobox = screen.getByRole("combobox", { name: "Table" });
    fireEvent.click(combobox);
    expect(combobox).toBeDisabled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  describe("with a long list", () => {
    afterEach(() => vi.restoreAllMocks());

    it("lists group headings and renders only the options in view", () => {
      // jsdom has no layout; give the list a 400px viewport.
      vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(400);
      vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(300);
      const many: ComboboxOption[] = Array.from({ length: 500 }, (_, index) => ({
        value: `field${index}`,
        label: `Field ${index}`,
        group: index < 400 ? "Fields" : "Related tables",
      }));
      render(<Harness options={many} />);
      const combobox = screen.getByRole("combobox", { name: "Table" });

      fireEvent.change(combobox, { target: { value: "field 42" } });
      // Fields 42, 142, 242, 342 and related 420-429, 442 are few enough to render in full.
      expect(screen.getByText("Fields")).toBeInTheDocument();
      expect(screen.getByText("Related tables")).toBeInTheDocument();
      expect(screen.getAllByRole("option")).toHaveLength(15);

      fireEvent.change(combobox, { target: { value: "field" } });
      const rendered = screen.getAllByRole("option");
      expect(rendered.length).toBeGreaterThan(1);
      expect(rendered.length).toBeLessThan(60);
      expect(rendered[0]).toHaveAttribute("aria-setsize", "500");
      expect(rendered[0]).toHaveAttribute("aria-posinset", "1");
    });
  });
});
