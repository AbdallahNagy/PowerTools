import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  StatusBarProvider,
  useStatusItems,
  useToolStatus,
} from "../../src/ui/shared/status";
import ToolHost from "../../src/ui/shell/tool-runtime/ToolHost";
import { defineTool } from "../../src/ui/tools/defineTool";

function StatusItemsProbe() {
  const items = useStatusItems();

  return (
    <output aria-label="status items">
      {items.map((item) => (
        <span key={item.id} data-status-id={item.id}>
          {item.content}
        </span>
      ))}
    </output>
  );
}

function FirstStatusTool() {
  useToolStatus("First status");
  return null;
}

function SecondStatusTool() {
  useToolStatus("Second status");
  return null;
}

function UpdatingStatusTool() {
  const [status, setStatus] = useState<string | null>("Initial status");
  useToolStatus(status);

  return (
    <>
      <button type="button" onClick={() => setStatus("Updated status")}>
        Update
      </button>
      <button type="button" onClick={() => setStatus(null)}>
        Clear
      </button>
    </>
  );
}

let jsxStatusRenderCount = 0;

function JsxStatusTool() {
  jsxStatusRenderCount += 1;
  if (jsxStatusRenderCount > 5) {
    throw new Error("JSX status caused repeated tool renders");
  }

  useToolStatus(<span>JSX status</span>);
  return <output aria-label="tool render count">{jsxStatusRenderCount}</output>;
}

const firstStatusTool = defineTool({
  id: "status-tool",
  title: "Status Tool",
  icon: "status.svg",
  showInActivityBar: false,
  component: FirstStatusTool,
});

const secondStatusTool = defineTool({
  ...firstStatusTool,
  component: SecondStatusTool,
});

const updatingStatusTool = defineTool({
  ...firstStatusTool,
  component: UpdatingStatusTool,
});

const jsxStatusTool = defineTool({
  ...firstStatusTool,
  component: JsxStatusTool,
});

beforeEach(() => {
  jsxStatusRenderCount = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("tool status", () => {
  it("requires a hosted tool instance", () => {
    expect(() =>
      render(
        <StatusBarProvider>
          <FirstStatusTool />
        </StatusBarProvider>,
      ),
    ).toThrow("useToolRuntime must be used within a ToolHost");
  });

  it("keeps status entries separate for two instances of the same tool", () => {
    render(
      <StatusBarProvider>
        <ToolHost
          tab={{ id: "status-tool-1", toolId: "status-tool", title: "Status Tool" }}
          definition={firstStatusTool}
        />
        <ToolHost
          tab={{ id: "status-tool-2", toolId: "status-tool", title: "Status Tool" }}
          definition={secondStatusTool}
        />
        <StatusItemsProbe />
      </StatusBarProvider>,
    );

    const statuses = screen.getByRole("status", { name: "status items" });
    expect(statuses).toHaveTextContent("First status");
    expect(statuses).toHaveTextContent("Second status");
    expect(statuses.querySelector('[data-status-id="tool:status-tool-1"]')).not.toBeNull();
    expect(statuses.querySelector('[data-status-id="tool:status-tool-2"]')).not.toBeNull();
  });

  it("does not rerender a tool when it publishes JSX status content", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <StatusBarProvider>
        <ToolHost
          tab={{ id: "status-tool-jsx", toolId: "status-tool", title: "Status Tool" }}
          definition={jsxStatusTool}
        />
        <StatusItemsProbe />
      </StatusBarProvider>,
    );

    expect(screen.getByRole("status", { name: "status items" })).toHaveTextContent(
      "JSX status",
    );
    expect(screen.getByRole("status", { name: "tool render count" })).toHaveTextContent(
      "1",
    );
  });

  it("updates and clears the current instance status", () => {
    render(
      <StatusBarProvider>
        <ToolHost
          tab={{ id: "status-tool-3", toolId: "status-tool", title: "Status Tool" }}
          definition={updatingStatusTool}
        />
        <StatusItemsProbe />
      </StatusBarProvider>,
    );

    expect(screen.getByRole("status", { name: "status items" })).toHaveTextContent(
      "Initial status",
    );

    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    expect(screen.getByRole("status", { name: "status items" })).toHaveTextContent(
      "Updated status",
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByRole("status", { name: "status items" })).toBeEmptyDOMElement();
  });

  it("removes only the unmounted instance status", () => {
    const { rerender } = render(
      <StatusBarProvider>
        <ToolHost
          tab={{ id: "status-tool-4", toolId: "status-tool", title: "Status Tool" }}
          definition={firstStatusTool}
        />
        <ToolHost
          tab={{ id: "status-tool-5", toolId: "status-tool", title: "Status Tool" }}
          definition={secondStatusTool}
        />
        <StatusItemsProbe />
      </StatusBarProvider>,
    );

    rerender(
      <StatusBarProvider>
        <ToolHost
          tab={{ id: "status-tool-4", toolId: "status-tool", title: "Status Tool" }}
          definition={firstStatusTool}
        />
        <StatusItemsProbe />
      </StatusBarProvider>,
    );

    const statuses = screen.getByRole("status", { name: "status items" });
    expect(statuses).toHaveTextContent("First status");
    expect(statuses).not.toHaveTextContent("Second status");
  });
});
