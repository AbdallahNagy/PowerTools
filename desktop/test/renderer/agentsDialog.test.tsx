import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { McpStatusInfo } from "../../src/ui/platform/desktopBridge";
import { AgentsProvider } from "../../src/ui/shell/agents/AgentsProvider";
import { AgentsContext } from "../../src/ui/shell/agents/AgentsContext";
import { renderWithProviders } from "../support/render";
import { useContext } from "react";

const OFF: McpStatusInfo = {
  enabled: false,
  running: false,
  port: null,
  discoveryPath: "/users/me/power-tools/mcp-endpoint.json",
  error: null,
  connectorCommand: '"/program files/power-tools/api/PowerTools.API.exe" --mcp-connector',
  connector: { command: "/program files/power-tools/api/PowerTools.API.exe", args: ["--mcp-connector"] },
  recent: [],
  groups: [
    { group: "connections", enabled: true, tools: 1 },
    { group: "schema", enabled: false, tools: 13 },
  ],
};

function OpenButton() {
  const { openAgents } = useContext(AgentsContext);
  return <button onClick={openAgents}>open agents</button>;
}

function renderAgents(overrides: Parameters<typeof renderWithProviders>[1] = {}) {
  const view = renderWithProviders(
    <AgentsProvider>
      <OpenButton />
    </AgentsProvider>,
    overrides,
  );
  fireEvent.click(screen.getByText("open agents"));
  return view;
}

describe("Agents dialog", () => {
  it("shows Off by default with the switch unchecked", async () => {
    renderAgents({ bridgeOverrides: { getMcpStatus: async () => OFF } });
    expect(await screen.findByText("Off")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Let AI agents use Power Tools/ })).not.toBeChecked();
  });

  it("switching on calls setMcpEnabled(true) and shows Running", async () => {
    const setMcpEnabled = vi.fn(async (): Promise<McpStatusInfo> => ({ ...OFF, enabled: true, running: true, port: 5000 }));
    renderAgents({ bridgeOverrides: { getMcpStatus: async () => OFF, setMcpEnabled } });
    const toggle = await screen.findByRole("checkbox", { name: /Let AI agents use Power Tools/ });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(toggle);
    expect(await screen.findByText("Running")).toBeInTheDocument();
    expect(setMcpEnabled).toHaveBeenCalledWith(true);
  });

  it("shows why the server could not start", async () => {
    renderAgents({ bridgeOverrides: { getMcpStatus: async () => ({ ...OFF, enabled: true, error: "Port in use" }) } });
    expect(await screen.findByText("Could not start: Port in use")).toBeInTheDocument();
  });

  it("offers a Claude Code command and a JSON config that start the connector", async () => {
    renderAgents({ bridgeOverrides: { getMcpStatus: async () => OFF } });
    const code = await screen.findByText(/^claude mcp add powertools -- /);
    expect(code.textContent).toContain("--mcp-connector");
    const json = screen.getByText(/"mcpServers"/);
    expect(json.textContent).toContain("--mcp-connector");
  });

  it("lists recent activity without ids or tokens", async () => {
    renderAgents({
      bridgeOverrides: {
        getMcpStatus: async () => ({
          ...OFF,
          running: true,
          enabled: true,
          recent: [
            { time: "2026-11-12T10:00:00.000Z", client: "claude-code", tool: "metadata_get_table", connection: "A · Dev", effect: "read", approval: "not-needed", outcome: "ok", summary: "metadata_get_table account" },
          ],
        }),
      },
    });
    expect(await screen.findByText("metadata_get_table")).toBeInTheDocument();
    expect(screen.getByText("A · Dev")).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toMatch(/[0-9a-f]{64}/);
  });

  it("shows a checkbox per group with its tool count, and switches one", async () => {
    const setMcpGroup = vi.fn(async (group: string, enabled: boolean): Promise<McpStatusInfo> => ({
      ...OFF,
      groups: OFF.groups.map((g) => (g.group === group ? { ...g, enabled } : g)),
    }));
    renderAgents({ bridgeOverrides: { getMcpStatus: async () => OFF, setMcpGroup } });
    const schema = await screen.findByRole("checkbox", { name: "schema tools" });
    expect(schema).not.toBeChecked();
    expect(screen.getByText("13 tools")).toBeInTheDocument();
    expect(screen.getByText("1 tool")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "connections tools" })).toBeChecked();
    await waitFor(() => expect(schema).not.toBeDisabled());
    fireEvent.click(schema);
    await waitFor(() => expect(setMcpGroup).toHaveBeenCalledWith("schema", true));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "schema tools" })).toBeChecked());
  });

  it("reloads the status when Refresh is pressed", async () => {
    const getMcpStatus = vi.fn(async () => OFF);
    renderAgents({ bridgeOverrides: { getMcpStatus } });
    await screen.findByText("Off");
    fireEvent.click(screen.getByRole("button", { name: "Refresh activity" }));
    await waitFor(() => expect(getMcpStatus).toHaveBeenCalledTimes(2));
  });

  it("opens from the File menu event", async () => {
    const view = renderWithProviders(<AgentsProvider>{null}</AgentsProvider>);
    expect(screen.queryByText("Agents (MCP)")).not.toBeInTheDocument();
    view.bridge.emitOpenAgents();
    expect(await screen.findByText("Agents (MCP)")).toBeInTheDocument();
  });
});
