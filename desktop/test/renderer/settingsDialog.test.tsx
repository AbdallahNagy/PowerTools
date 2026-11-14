import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { McpStatusInfo } from "../../src/ui/platform/desktopBridge";
import { ConnectionsProvider } from "../../src/ui/shared/connections";
import { AgentsContext } from "../../src/ui/shell/agents/AgentsContext";
import { useSettings } from "../../src/ui/shell/settings/SettingsContext";
import { SettingsProvider } from "../../src/ui/shell/settings/SettingsProvider";
import { UpdateProvider } from "../../src/ui/shell/layout/UpdateProvider";
import type { ConnectionSummary } from "../../src/ui/shared/connections";
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
  tools: [
    { name: "connections_list", title: "List connections", description: "Lists saved connections. Read-only.", group: "connections", effect: "read", enabled: true },
    { name: "schema_create_column", title: "Create a column", description: "Adds a column. Changes the environment.", group: "schema", effect: "change", enabled: true },
  ],
  http: { enabled: false, port: 47800 },
};

function OpenButton() {
  const { openAgents } = useContext(AgentsContext);
  return <button onClick={openAgents}>open agents</button>;
}

function OpenSettingsButton() {
  const { openSettings } = useSettings();
  return <button onClick={() => openSettings()}>open settings</button>;
}

function renderShell(overrides: Parameters<typeof renderWithProviders>[1] = {}) {
  return renderWithProviders(
    <ConnectionsProvider>
      <SettingsProvider>
        <OpenButton />
        <OpenSettingsButton />
      </SettingsProvider>
    </ConnectionsProvider>,
    overrides,
  );
}

function renderAgents(overrides: Parameters<typeof renderWithProviders>[1] = {}) {
  const view = renderShell(overrides);
  fireEvent.click(screen.getByText("open agents"));
  return view;
}

describe("Settings: Agents (MCP)", () => {
  it("shows Off by default with the switch unchecked", async () => {
    renderAgents({ bridgeOverrides: { getMcpStatus: async () => OFF } });
    expect(await screen.findByText("Off")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /Let AI agents use Power Tools/ })).not.toBeChecked();
  });

  it("switching on calls setMcpEnabled(true) and shows Running", async () => {
    const setMcpEnabled = vi.fn(async (): Promise<McpStatusInfo> => ({ ...OFF, enabled: true, running: true, port: 5000 }));
    renderAgents({ bridgeOverrides: { getMcpStatus: async () => OFF, setMcpEnabled } });
    const toggle = await screen.findByRole("switch", { name: /Let AI agents use Power Tools/ });
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
    const vscode = screen.getByText(/"servers"/);
    expect(vscode.textContent).toContain('"type": "stdio"');
    expect(vscode.textContent).toContain("--mcp-connector");
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

  it("shows a switch per group with how many of its tools are on, and switches one", async () => {
    const setMcpGroup = vi.fn(async (group: string, enabled: boolean): Promise<McpStatusInfo> => ({
      ...OFF,
      groups: OFF.groups.map((g) => (g.group === group ? { ...g, enabled } : g)),
    }));
    renderAgents({ bridgeOverrides: { getMcpStatus: async () => OFF, setMcpGroup } });
    const schema = await screen.findByRole("switch", { name: "schema tools" });
    expect(schema).not.toBeChecked();
    expect(screen.getByText("Group off")).toBeInTheDocument();
    expect(screen.getByText("1 of 1 on")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "connections tools" })).toBeChecked();
    await waitFor(() => expect(schema).not.toBeDisabled());
    fireEvent.click(schema);
    await waitFor(() => expect(setMcpGroup).toHaveBeenCalledWith("schema", true));
    await waitFor(() => expect(screen.getByRole("switch", { name: "schema tools" })).toBeChecked());
  });

  it("offers the direct HTTP option, saves the port and copies the config through main", async () => {
    const setMcpHttp = vi.fn(async (http: { enabled: boolean; port: number }): Promise<McpStatusInfo> => ({ ...OFF, http }));
    const copyMcpHttpConfig = vi.fn(async () => undefined);
    renderAgents({ bridgeOverrides: { getMcpStatus: async () => OFF, setMcpHttp, copyMcpHttpConfig } });
    const toggle = await screen.findByRole("switch", { name: "Direct HTTP" });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    expect(toggle).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Copy client config" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Port"), { target: { value: "48000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save port" }));
    await waitFor(() => expect(setMcpHttp).toHaveBeenCalledWith({ enabled: false, port: 48000 }));

    fireEvent.click(toggle);
    await waitFor(() => expect(setMcpHttp).toHaveBeenCalledWith({ enabled: true, port: 48000 }));
    const copy = await screen.findByRole("button", { name: "Copy client config" });
    await waitFor(() => expect(copy).not.toBeDisabled());
    fireEvent.click(copy);
    await waitFor(() => expect(copyMcpHttpConfig).toHaveBeenCalledTimes(1));
    expect(document.body.textContent ?? "").not.toMatch(/[0-9a-f]{64}/);
  });

  it("refuses a port outside 1024 to 65535 without calling main", async () => {
    const setMcpHttp = vi.fn(async (http: { enabled: boolean; port: number }): Promise<McpStatusInfo> => ({ ...OFF, http }));
    renderAgents({ bridgeOverrides: { getMcpStatus: async () => OFF, setMcpHttp } });
    await screen.findByRole("switch", { name: "Direct HTTP" });
    fireEvent.change(screen.getByLabelText("Port"), { target: { value: "80" } });
    fireEvent.click(screen.getByRole("button", { name: "Save port" }));
    expect(await screen.findByText("Enter a port from 1024 to 65535.")).toBeInTheDocument();
    expect(setMcpHttp).not.toHaveBeenCalled();
  });

  it("warns before regenerating the token, then regenerates it", async () => {
    const regenerateMcpHttpToken = vi.fn(async (): Promise<McpStatusInfo> => ({ ...OFF, http: { enabled: true, port: 47800 } }));
    renderAgents({
      bridgeOverrides: { getMcpStatus: async () => ({ ...OFF, http: { enabled: true, port: 47800 } }), regenerateMcpHttpToken },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Regenerate token" }));
    expect(screen.getByText(/clients using the old config will stop working/i)).toBeInTheDocument();
    expect(regenerateMcpHttpToken).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Regenerate and restart" }));
    await waitFor(() => expect(regenerateMcpHttpToken).toHaveBeenCalledTimes(1));
  });

  it("reloads the status when Refresh is pressed", async () => {
    const getMcpStatus = vi.fn(async () => OFF);
    renderAgents({ bridgeOverrides: { getMcpStatus } });
    await screen.findByText("Off");
    fireEvent.click(screen.getByRole("button", { name: "Refresh activity" }));
    await waitFor(() => expect(getMcpStatus).toHaveBeenCalledTimes(2));
  });

  it("opens at Agents from the Agents (MCP) menu event", async () => {
    const view = renderShell();
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
    view.bridge.emitOpenAgents();
    expect(await screen.findByRole("heading", { name: "Agents (MCP)" })).toBeInTheDocument();
  });

  it("lists each tool with its effect, filters by search, and switches one tool", async () => {
    const setMcpTool = vi.fn(async (name: string, enabled: boolean): Promise<McpStatusInfo> => ({
      ...OFF,
      tools: OFF.tools.map((t) => (t.name === name ? { ...t, enabled } : t)),
    }));
    renderAgents({ bridgeOverrides: { getMcpStatus: async () => OFF, setMcpTool } });
    fireEvent.click(await screen.findByRole("button", { name: "Show connections tools" }));
    const toggle = screen.getByRole("switch", { name: "connections_list tool" });
    expect(screen.getByText("Read")).toBeInTheDocument();
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(toggle);
    await waitFor(() => expect(setMcpTool).toHaveBeenCalledWith("connections_list", false));
    await waitFor(() => expect(screen.getByRole("switch", { name: "connections_list tool" })).not.toBeChecked());

    fireEvent.change(screen.getByLabelText("Search agent tools"), { target: { value: "column" } });
    expect(screen.getByText("schema_create_column")).toBeInTheDocument();
    expect(screen.queryByText("connections_list")).not.toBeInTheDocument();
    // A tool of a switched-off group cannot be switched on its own.
    expect(screen.getByRole("switch", { name: "schema_create_column tool" })).toBeDisabled();
    // It also reads as off, since agents do not get it, though its own setting is kept.
    expect(screen.getByRole("switch", { name: "schema_create_column tool" })).not.toBeChecked();
  });
});

describe("Settings dialog", () => {
  it("opens from the File > Settings menu event on Appearance and moves between sections", async () => {
    const view = renderShell();
    view.bridge.emitOpenSettings();
    expect(await screen.findByRole("heading", { name: "Appearance" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keyboard shortcuts" }));
    expect(screen.getByRole("heading", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    expect(screen.getByText("Ctrl+,")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keyboard shortcuts" })).toHaveAttribute("aria-current", "page");
  });

  it("changes the theme through main", async () => {
    const setThemePreference = vi.fn(async (theme: "system" | "dark" | "light") => ({
      theme,
      usageStats: true,
      crashReports: true,
      version: "1.2.3",
      updatesEnabled: true,
    }));
    renderShell({ bridgeOverrides: { setThemePreference } });
    fireEvent.click(screen.getByText("open settings"));
    const dark = await screen.findByRole("radio", { name: /Dark/ });
    await waitFor(() => expect(dark).not.toBeDisabled());
    expect(screen.getByRole("radio", { name: /System/ })).toBeChecked();
    fireEvent.click(dark);
    await waitFor(() => expect(setThemePreference).toHaveBeenCalledWith("dark"));
    await waitFor(() => expect(screen.getByRole("radio", { name: /Dark/ })).toBeChecked());
  });

  it("switches usage stats and crash reports off", async () => {
    const view = renderShell();
    const setUsageStatsEnabled = vi.spyOn(view.bridge, "setUsageStatsEnabled");
    const setCrashReportsEnabled = vi.spyOn(view.bridge, "setCrashReportsEnabled");
    fireEvent.click(screen.getByText("open settings"));
    fireEvent.click(await screen.findByRole("button", { name: "Privacy" }));
    const usage = await screen.findByRole("switch", { name: "Send anonymous usage stats" });
    await waitFor(() => expect(usage).toBeChecked());
    fireEvent.click(usage);
    await waitFor(() => expect(setUsageStatsEnabled).toHaveBeenCalledWith(false));
    const crash = screen.getByRole("switch", { name: "Send crash reports" });
    await waitFor(() => expect(crash).not.toBeDisabled());
    fireEvent.click(crash);
    await waitFor(() => expect(setCrashReportsEnabled).toHaveBeenCalledWith(false));
  });

  it("refreshes when a preference changes from the native menu", async () => {
    const getAppSettings = vi.fn(async () => ({ theme: "system" as const, usageStats: true, crashReports: true, version: "1.2.3", updatesEnabled: true }));
    const view = renderShell({ bridgeOverrides: { getAppSettings } });
    fireEvent.click(screen.getByText("open settings"));
    await waitFor(() => expect(getAppSettings).toHaveBeenCalledTimes(1));
    view.bridge.emitAppSettingsChanged();
    await waitFor(() => expect(getAppSettings).toHaveBeenCalledTimes(2));
  });

  it("lets agents make changes without asking per connection", async () => {
    const connection: ConnectionSummary = {
      id: "c1",
      legacyName: null,
      organization: "Contoso",
      environment: "Dev",
      browser: null,
      envUrl: "https://contoso-dev.crm.dynamics.com",
      crmType: "online",
      needsPassword: false,
      agentChangesWithoutAsking: false,
    };
    const updateConnection = vi.fn(async () => ({ success: true }));
    renderShell({ bridgeOverrides: { listConnections: async () => [connection], updateConnection } });
    fireEvent.click(screen.getByText("open settings"));
    fireEvent.click(await screen.findByRole("button", { name: "Agent permissions" }));
    const toggle = await screen.findByRole("switch", { name: /Let agents make changes without asking on/ });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => expect(updateConnection).toHaveBeenCalledWith("c1", { agentChangesWithoutAsking: true }));
  });

  it("opens the data folder through main and shows the version", async () => {
    const view = renderShell();
    const openSettingsFolder = vi.spyOn(view.bridge, "openSettingsFolder");
    fireEvent.click(screen.getByText("open settings"));
    fireEvent.click(await screen.findByRole("button", { name: "Updates & About" }));
    expect(await screen.findByText("Power Tools v1.2.3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open data folder" }));
    await waitFor(() => expect(openSettingsFolder).toHaveBeenCalledWith("data"));
  });

  it("waits for an update check and says when it found nothing", async () => {
    let finish: () => void = () => undefined;
    const checkForUpdates = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    renderWithProviders(
      <ConnectionsProvider>
        <UpdateProvider>
          <SettingsProvider>
            <OpenSettingsButton />
          </SettingsProvider>
        </UpdateProvider>
      </ConnectionsProvider>,
      { bridgeOverrides: { checkForUpdates, getUpdateStatus: async () => ({ state: "idle" }) } },
    );
    fireEvent.click(screen.getByText("open settings"));
    fireEvent.click(await screen.findByRole("button", { name: "Updates & About" }));
    const button = await screen.findByRole("button", { name: "Check for updates" });
    await waitFor(() => expect(screen.getByText("Power Tools is up to date.")).toBeInTheDocument());
    fireEvent.click(button);
    expect(await screen.findByText("Checking for updates…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check for updates" })).toBeDisabled();
    act(() => finish());
    expect(await screen.findByText(/You have the latest version\. Checked at/)).toBeInTheDocument();
    expect(checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it("says a development build does not check for updates", async () => {
    renderShell({
      bridgeOverrides: {
        getAppSettings: async () => ({ theme: "system", usageStats: true, crashReports: true, version: "1.2.3", updatesEnabled: false }),
      },
    });
    fireEvent.click(screen.getByText("open settings"));
    fireEvent.click(await screen.findByRole("button", { name: "Updates & About" }));
    expect(await screen.findByText(/development build, so it does not check for updates/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check for updates" })).not.toBeInTheDocument();
  });
});
