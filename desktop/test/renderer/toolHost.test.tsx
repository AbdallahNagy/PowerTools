import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import TabBar from "../../src/ui/components/layout/TabBar";
import { TabProvider } from "../../src/ui/context/TabContext";
import ToolHost from "../../src/ui/shell/tool-runtime/ToolHost";
import { useToolRuntime } from "../../src/ui/shell/tool-runtime/useToolRuntime";
import { defineTool } from "../../src/ui/tools/defineTool";
import { TOOL_REGISTRY } from "../../src/ui/tools/registry";

function RuntimeProbe() {
  const { instanceId, toolId } = useToolRuntime();
  return <output aria-label="runtime identity">{toolId}:{instanceId}</output>;
}

function ThrowingTool(): never {
  throw new Error("tool render failed");
}

const runtimeProbeTool = defineTool({
  id: "runtime-probe",
  title: "Runtime Probe",
  icon: "probe.svg",
  showInActivityBar: false,
  component: RuntimeProbe,
});

const throwingTool = defineTool({
  id: "throwing-tool",
  title: "Throwing Tool",
  icon: "throwing.svg",
  showInActivityBar: false,
  component: ThrowingTool,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("tool host", () => {
  it("rejects runtime consumers outside a ToolHost", () => {
    expect(() => render(<RuntimeProbe />)).toThrow(
      "useToolRuntime must be used within a ToolHost",
    );
  });

  it("provides the current tool and instance identity", () => {
    render(
      <ToolHost
        tab={{
          id: "runtime-probe-101",
          toolId: "runtime-probe",
          title: "Runtime Probe",
        }}
        definition={runtimeProbeTool}
      />,
    );

    expect(screen.getByRole("status", { name: "runtime identity" })).toHaveTextContent(
      "runtime-probe:runtime-probe-101",
    );
  });

  it("contains one failed instance without removing a healthy instance", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <>
        <ToolHost
          tab={{
            id: "throwing-tool-201",
            toolId: "throwing-tool",
            title: "Throwing Tool",
          }}
          definition={throwingTool}
        />
        <ToolHost
          tab={{
            id: "runtime-probe-202",
            toolId: "runtime-probe",
            title: "Runtime Probe",
          }}
          definition={runtimeProbeTool}
        />
      </>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Throwing Tool encountered an unexpected error.",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Close and reopen this tab to try again.",
    );
    expect(screen.getByRole("status", { name: "runtime identity" })).toHaveTextContent(
      "runtime-probe:runtime-probe-202",
    );
  });

  it("routes registry-backed TabBar content through the error boundary", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const welcomeTool = TOOL_REGISTRY.welcome;
    const previousComponent = welcomeTool.component;
    welcomeTool.component = ThrowingTool;

    try {
      render(
        <TabProvider>
          <span>Shell remains available</span>
          <TabBar />
        </TabProvider>,
      );
    } finally {
      welcomeTool.component = previousComponent;
    }

    expect(screen.getByText("Shell remains available")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Welcome encountered an unexpected error.",
    );
  });
});
