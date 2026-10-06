import { useState } from "react";
import { fireEvent, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import Layout from "../../src/ui/components/layout/Layout";
import CommandPalette from "../../src/ui/components/layout/CommandPalette";
import { TabProvider } from "../../src/ui/context/TabContext";
import { useTabs } from "../../src/ui/context/useTabs";
import { useShellShortcuts } from "../../src/ui/shell/keyboard/useShellShortcuts";
import {
  isActivationTarget,
  isTextEntryTarget,
  shouldIgnoreShellShortcut,
} from "../../src/ui/shell/keyboard/shellShortcuts";
import { PrimaryActionProvider, PrimaryActionScope, usePrimaryAction } from "../../src/ui/shared/keyboard";
import { Modal } from "../../src/ui/shared/ui";
import { ACTIVITY_BAR_TOOLS } from "../../src/ui/tools/registry";
import { renderWithProviders } from "../support/render";

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => vi.stubGlobal("ResizeObserver", TestResizeObserver));
afterEach(() => vi.restoreAllMocks());
afterAll(() => vi.unstubAllGlobals());

function Probe({ enabled }: { enabled: boolean }) {
  const [runs, setRuns] = useState(0);
  usePrimaryAction({
    label: "Run",
    enabled,
    run: () => setRuns((count) => count + 1),
  });
  return <output aria-label="primary runs">{runs}</output>;
}

function ShellHarness({
  enabled = true,
  modal = false,
}: {
  enabled?: boolean;
  modal?: boolean;
}) {
  const { openTool, tabs, activeTabId } = useTabs();
  const [quickOpen, setQuickOpen] = useState(false);
  const [sidebar, setSidebar] = useState(true);

  useShellShortcuts({
    quickOpen,
    onQuickOpenChange: setQuickOpen,
    onToggleSidebar: () => setSidebar((visible) => !visible),
  });

  return (
    <>
      <output aria-label="open tab titles">{tabs.map((tab) => tab.title).join(" | ")}</output>
      <output aria-label="active tab">{activeTabId}</output>
      <output aria-label="sidebar">{sidebar ? "visible" : "hidden"}</output>
      <input aria-label="Notes" />
      <textarea
        aria-label="Query"
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
          }
        }}
      />
      <button type="button">Local action</button>
      <PrimaryActionScope instanceId="welcome">
        <Probe enabled={enabled} />
      </PrimaryActionScope>
      <CommandPalette
        open={quickOpen}
        tools={ACTIVITY_BAR_TOOLS}
        onClose={() => setQuickOpen(false)}
        onOpen={(toolId) => {
          openTool(toolId);
          setQuickOpen(false);
        }}
      />
      <Modal open={modal} title="Confirm" onClose={() => undefined}>
        <p>Working</p>
      </Modal>
    </>
  );
}

function renderHarness(props?: { enabled?: boolean; modal?: boolean }) {
  return renderWithProviders(
    <PrimaryActionProvider>
      <TabProvider>
        <ShellHarness {...props} />
      </TabProvider>
    </PrimaryActionProvider>,
  );
}

describe("shell keyboard shortcuts", () => {
  it("treats text fields and buttons as targets that keep plain Enter", () => {
    const input = document.createElement("input");
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    const icon = document.createElement("span");
    const button = document.createElement("button");
    button.append(icon);
    document.body.append(input, editor, button);

    expect(isTextEntryTarget(input)).toBe(true);
    expect(isTextEntryTarget(editor)).toBe(true);
    expect(isActivationTarget(icon)).toBe(true);
    expect(
      shouldIgnoreShellShortcut({
        shortcut: "primary-action",
        target: input,
        defaultPrevented: false,
        isComposing: false,
      }),
    ).toBe(true);
    expect(
      shouldIgnoreShellShortcut({
        shortcut: "primary-action-from-field",
        target: input,
        defaultPrevented: false,
        isComposing: false,
      }),
    ).toBe(false);
  });

  it("closes the active tab and cycles the remaining tabs", () => {
    vi.spyOn(Date, "now").mockReturnValue(501);
    renderHarness();

    fireEvent.keyDown(document.body, { key: "p", ctrlKey: true });
    fireEvent.change(screen.getByRole("combobox", { name: "Open tool" }), {
      target: { value: "workflow activities" },
    });
    expect(screen.getByRole("option", { name: /Workflow Activities Viewer/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Data Migration/ })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Open tool" }), { key: "Enter" });

    fireEvent.keyDown(document.body, { key: "p", ctrlKey: true });
    fireEvent.change(screen.getByRole("combobox", { name: "Open tool" }), {
      target: { value: "fetchxml" },
    });
    expect(screen.getByRole("option", { name: /FetchXML Builder/ })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Open tool" }), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Open tool" }), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Open tool" }), { key: "Enter" });

    expect(screen.getByRole("status", { name: "open tab titles" })).toHaveTextContent(
      "Welcome | Workflow Activities Viewer | FetchXML Tester",
    );
    expect(screen.getByRole("status", { name: "active tab" })).toHaveTextContent(
      "fetchxml-tester-501",
    );

    fireEvent.keyDown(document.body, { key: "Tab", ctrlKey: true });
    expect(screen.getByRole("status", { name: "active tab" })).toHaveTextContent("welcome");

    fireEvent.keyDown(document.body, { key: "Tab", ctrlKey: true, shiftKey: true });
    expect(screen.getByRole("status", { name: "active tab" })).toHaveTextContent(
      "fetchxml-tester-501",
    );

    fireEvent.keyDown(document.body, { key: "w", ctrlKey: true, repeat: true });
    expect(screen.getByRole("status", { name: "active tab" })).toHaveTextContent(
      "fetchxml-tester-501",
    );

    fireEvent.keyDown(document.body, { key: "w", ctrlKey: true });
    expect(screen.getByRole("status", { name: "open tab titles" })).toHaveTextContent(
      "Welcome | Workflow Activities Viewer",
    );
    expect(screen.getByRole("status", { name: "active tab" })).toHaveTextContent(
      "workflow-activities-viewer-501",
    );
  });

  it("runs the active tab primary action from Enter and Ctrl+Enter", () => {
    renderHarness();

    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(screen.getByRole("status", { name: "primary runs" })).toHaveTextContent("1");

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Notes" }), { key: "Enter" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Local action" }), { key: "Enter" });
    expect(screen.getByRole("status", { name: "primary runs" })).toHaveTextContent("1");

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Notes" }), {
      key: "Enter",
      ctrlKey: true,
    });
    expect(screen.getByRole("status", { name: "primary runs" })).toHaveTextContent("2");

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Query" }), {
      key: "Enter",
      ctrlKey: true,
    });
    expect(screen.getByRole("status", { name: "primary runs" })).toHaveTextContent("2");
  });

  it("does not run a disabled primary action", () => {
    renderHarness({ enabled: false });

    fireEvent.keyDown(document.body, { key: "Enter" });
    fireEvent.keyDown(document.body, { key: "Enter", ctrlKey: true });

    expect(screen.getByRole("status", { name: "primary runs" })).toHaveTextContent("0");
  });

  it("ignores shell shortcuts while a modal is open", () => {
    renderHarness({ modal: true });

    fireEvent.keyDown(document.body, { key: "w", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "b", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "p", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "Enter" });

    expect(screen.getByRole("status", { name: "active tab", hidden: true })).toHaveTextContent("welcome");
    expect(screen.getByRole("status", { name: "sidebar", hidden: true })).toHaveTextContent("visible");
    expect(screen.queryByRole("combobox", { name: "Open tool" })).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "primary runs", hidden: true })).toHaveTextContent("0");
    expect(document.querySelector("[data-app-modal]")).not.toBeNull();
  });

  it("toggles the sidebar and quick open from the shell", () => {
    renderHarness();

    fireEvent.keyDown(document.body, { key: "b", ctrlKey: true });
    expect(screen.getByRole("status", { name: "sidebar" })).toHaveTextContent("hidden");

    fireEvent.keyDown(document.body, { key: "p", ctrlKey: true });
    expect(screen.getByRole("dialog", { name: "Open tool" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Open tool" }), {
      target: { value: "no-such-tool" },
    });
    expect(screen.getByText("No matching tools")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Open tool" }), { key: "Enter" });
    expect(screen.getByRole("status", { name: "active tab" })).toHaveTextContent("welcome");

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("combobox", { name: "Open tool" })).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "primary runs" })).toHaveTextContent("0");
  });

  it("toggles the real sidebar and quick open from the layout", async () => {
    renderWithProviders(
      <PrimaryActionProvider>
        <TabProvider>
          <Layout />
        </TabProvider>
      </PrimaryActionProvider>,
    );

    expect(await screen.findByRole("navigation", { name: "Tools" })).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: "b", ctrlKey: true });
    expect(screen.queryByRole("navigation", { name: "Tools" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show sidebar" })).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: "p", ctrlKey: true });
    expect(screen.getByRole("combobox", { name: "Open tool" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Workflow Activities Viewer/ })).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("combobox", { name: "Open tool" })).not.toBeInTheDocument();
  });
});
