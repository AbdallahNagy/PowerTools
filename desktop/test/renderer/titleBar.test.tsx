import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import TitleBar from "../../src/ui/components/layout/TitleBar";
import { renderWithProviders } from "../support/render";

describe("title bar", () => {
  it("puts File, Edit, View, Help on the same row as the window controls", async () => {
    const popupAppMenu = vi.fn(async () => undefined);
    const minimizeWindow = vi.fn(async () => undefined);
    const toggleMaximizeWindow = vi.fn(async () => undefined);
    const closeWindow = vi.fn(async () => undefined);
    const onToggleSidebar = vi.fn();

    renderWithProviders(
      <TitleBar sidebarVisible onToggleSidebar={onToggleSidebar} />,
      {
        bridgeOverrides: {
          popupAppMenu,
          minimizeWindow,
          toggleMaximizeWindow,
          closeWindow,
        },
      },
    );

    const titleBar = await screen.findByTestId("title-bar");
    const mark = screen.getByRole("img", { name: "Power Tools" });
    const file = screen.getByRole("button", { name: "File" });
    const edit = screen.getByRole("button", { name: "Edit" });
    const view = screen.getByRole("button", { name: "View" });
    const help = screen.getByRole("button", { name: "Help" });
    const minimize = screen.getByRole("button", { name: "Minimize" });
    const maximize = screen.getByRole("button", { name: "Maximize" });
    const close = screen.getByRole("button", { name: "Close" });

    expect(titleBar).toContainElement(mark);
    expect(titleBar).toContainElement(file);
    expect(
      mark.compareDocumentPosition(file) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(titleBar).toContainElement(edit);
    expect(titleBar).toContainElement(view);
    expect(titleBar).toContainElement(help);
    expect(titleBar).toContainElement(minimize);
    expect(titleBar).toContainElement(maximize);
    expect(titleBar).toContainElement(close);
    expect(
      file.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    fireEvent.click(file);
    expect(popupAppMenu).toHaveBeenCalledWith("file", expect.any(Number), expect.any(Number));

    fireEvent.click(screen.getByRole("button", { name: "Hide sidebar" }));
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);

    fireEvent.click(minimize);
    fireEvent.click(maximize);
    fireEvent.click(close);
    expect(minimizeWindow).toHaveBeenCalledTimes(1);
    expect(toggleMaximizeWindow).toHaveBeenCalledTimes(1);
    expect(closeWindow).toHaveBeenCalledTimes(1);
  });

  it("shows Restore after the window reports it is maximized", async () => {
    const { bridge } = renderWithProviders(
      <TitleBar sidebarVisible={false} onToggleSidebar={() => undefined} />,
      {
        bridgeOverrides: {
          isWindowMaximized: async () => true,
        },
      },
    );

    expect(await screen.findByRole("button", { name: "Restore" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show sidebar" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    act(() => {
      bridge.emitWindowMaximizedChanged(false);
    });
    expect(screen.getByRole("button", { name: "Maximize" })).toBeInTheDocument();
  });
});
