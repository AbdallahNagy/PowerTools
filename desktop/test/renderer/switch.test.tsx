import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Switch } from "../../src/ui/shared/ui";

describe("Switch", () => {
  it("is a named switch that reports its state and flips on click", () => {
    const onChange = vi.fn();
    const { rerender } = render(<Switch checked={false} onChange={onChange} aria-label="Crash reports" />);
    const control = screen.getByRole("switch", { name: "Crash reports" });
    expect(control).not.toBeChecked();
    fireEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(true);

    rerender(<Switch checked onChange={onChange} aria-label="Crash reports" />);
    expect(control).toBeChecked();
    fireEvent.click(control);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("ignores clicks while disabled", () => {
    const onChange = vi.fn();
    render(<Switch checked={false} disabled onChange={onChange} aria-label="Off" />);
    fireEvent.click(screen.getByRole("switch", { name: "Off" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
