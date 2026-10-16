import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CommandPalette from "../../src/ui/shell/layout/CommandPalette";

describe("command palette results", () => {
  it("keeps the tool title intact and truncates the description in the leftover space", () => {
    render(
      <CommandPalette
        open
        tools={[
          {
            id: "workflow-activities-viewer",
            title: "Workflow Activities Viewer",
            tooltip: "See which activated processes reference a custom workflow activity",
            icon: "icon.svg",
          },
        ]}
        onClose={vi.fn()}
        onOpen={vi.fn()}
      />,
    );

    const option = screen.getByRole("option", { name: /Workflow Activities Viewer/ });
    const title = within(option).getByText("Workflow Activities Viewer");
    const description = within(option).getByText(
      "See which activated processes reference a custom workflow activity",
    );

    expect(title).toHaveClass("min-w-0", "truncate");
    expect(title).not.toHaveClass("flex-1");
    expect(description).toHaveClass("min-w-0", "flex-1", "truncate");
  });

  it("omits a description that repeats the title", () => {
    render(
      <CommandPalette
        open
        tools={[{ id: "connect", title: "Connect", tooltip: "Connect", icon: "icon.svg" }]}
        onClose={vi.fn()}
        onOpen={vi.fn()}
      />,
    );

    const option = screen.getByRole("option", { name: "Connect" });
    expect(within(option).getAllByText("Connect")).toHaveLength(1);
  });

  it("offers to request the typed tool when nothing matches", () => {
    const onRequestTool = vi.fn();
    const onOpen = vi.fn();
    render(
      <CommandPalette
        open
        tools={[{ id: "connect", title: "Connect", icon: "icon.svg" }]}
        onClose={vi.fn()}
        onOpen={onOpen}
        onRequestTool={onRequestTool}
      />,
    );

    const input = screen.getByRole("combobox", { name: "Open tool" });
    fireEvent.change(input, { target: { value: " bulk updater " } });

    expect(screen.getByText("No matching tools")).toBeInTheDocument();
    const request = screen.getByRole("option", { name: 'Request "bulk updater" as a new tool…' });
    expect(request).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRequestTool).toHaveBeenCalledWith("bulk updater");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("puts the request option after the tools in keyboard order", () => {
    const onRequestTool = vi.fn();
    render(
      <CommandPalette
        open
        tools={[{ id: "connect", title: "Connect", icon: "icon.svg" }]}
        onClose={vi.fn()}
        onOpen={vi.fn()}
        onRequestTool={onRequestTool}
      />,
    );

    const input = screen.getByRole("combobox", { name: "Open tool" });
    expect(screen.getByRole("option", { name: "Connect" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "End" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRequestTool).toHaveBeenCalledWith("");
  });
});
