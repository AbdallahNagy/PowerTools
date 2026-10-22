import { fireEvent, screen } from "@testing-library/react";

/** Opens a Combobox, narrows it with `search` when given, and picks the named option. */
export function chooseComboboxOption(combobox: HTMLElement, option: string | RegExp, search?: string): void {
  fireEvent.click(combobox);
  if (search !== undefined) fireEvent.change(combobox, { target: { value: search } });
  fireEvent.click(screen.getByRole("option", { name: option }));
}
