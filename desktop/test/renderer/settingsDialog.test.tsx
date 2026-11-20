import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
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
  connectorCommand: '"/users/test/appdata/local/power tools/mcp/PowerTools.McpConnector.exe"',
  connector: { command: "/users/me/appdata/local/power tools/mcp/PowerTools.McpConnector.exe", args: [] },
  recent: [],
  legacySetups: [],
  groups: [
    { group: "connections", enabled: true, tools: 1 },
    { group: "schema", enabled: false, tools: 13 },
  ],
  tools: [
    { name: "connections_list", title: "List connections", description: "Lists saved connections. Read-only.", group: "connections", effect: "read", enabled: true },
    { name: "schema_create_column", title: "Create a column", description: "Adds a column. Changes the environment.", group: "schema", effect: "change", enabled: true },
  ],
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

async function openTab(name: string) {
  const nav = await screen.findByRole("navigation", { name: "Settings sections" });
  fireEvent.click(within(nav).getByRole("button", { name }));
}

describe("Settings: MCP server", () => {
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
    const code = await screen.findByText(/^claude mcp add --scope user powertools -- /);
    expect(code.textContent).toContain("PowerTools.McpConnector.exe");
    expect(screen.getByRole("button", { name: "Claude Code" })).toHaveAttribute("aria-pressed", "true");

    // One client's setup shows at a time.
    fireEvent.click(screen.getByRole("button", { name: "Claude Desktop" }));
    expect(screen.queryByText(/^claude mcp add --scope user powertools -- /)).not.toBeInTheDocument();
    const json = screen.getByText(/"mcpServers"/);
    expect(json.textContent).toContain("PowerTools.McpConnector.exe");
    expect(screen.getByRole("button", { name: "Copy Claude Desktop" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "VS Code" }));
    const vscode = screen.getByText(/"servers"/);
    expect(vscode.textContent).toContain('"type": "stdio"');
    expect(vscode.textContent).toContain("PowerTools.McpConnector.exe");
  });

  it("warns about client setups that still start PowerTools.API.exe and shows the new command", async () => {
    renderAgents({
      bridgeOverrides: {
        getMcpStatus: async () => ({
          ...OFF,
          legacySetups: [
            { client: "Claude Code", configPath: "C:\\Users\\me\\.claude.json", server: "powertools", scope: "user" },
            { client: "Claude Desktop", configPath: "C:\\Users\\me\\AppData\\Roaming\\Claude\\claude_desktop_config.json", server: "pt" },
          ],
        }),
      },
    });
    expect(await screen.findByText("Update your agent setup so Power Tools can update")).toBeInTheDocument();
    const fix = screen.getByText(/^claude mcp remove --scope user powertools/);
    expect(fix.textContent).toContain("claude mcp add --scope user powertools -- ");
    expect(fix.textContent).toContain("PowerTools.McpConnector.exe");
    expect(screen.getByText(/Replace the "pt" entry in .*claude_desktop_config\.json/)).toBeInTheDocument();
  });

  it("shows no update warning when every setup uses the new connector", async () => {
    renderAgents({ bridgeOverrides: { getMcpStatus: async () => OFF } });
    await screen.findByText("Off");
    expect(screen.queryByText("Update your agent setup so Power Tools can update")).not.toBeInTheDocument();
  });

  it("lists recent activity on its own tab without ids or tokens", async () => {
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
    await screen.findByText("Running");
    await openTab("Agent activity");
    expect(await screen.findByRole("heading", { name: "Agent activity" })).toBeInTheDocument();
    expect(screen.getAllByText("metadata_get_table").length).toBeGreaterThan(0);
    expect(screen.getByText("account")).toBeInTheDocument();
    expect(screen.getByText("A · Dev")).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toMatch(/[0-9a-f]{64}/);
  });

  it("shows a switch per group with how many of its tools are on, and switches one", async () => {
    const setMcpGroup = vi.fn(async (group: string, enabled: boolean): Promise<McpStatusInfo> => ({
      ...OFF,
      groups: OFF.groups.map((g) => (g.group === group ? { ...g, enabled } : g)),
    }));
    renderAgents({ bridgeOverrides: { getMcpStatus: async () => OFF, setMcpGroup } });
    await screen.findByText("Off");
    await openTab("Agent tools");
    const schema = await screen.findByRole("switch", { name: "Schema tools" });
    expect(schema).not.toBeChecked();
    expect(screen.getByText(/Group off\./)).toBeInTheDocument();
    expect(screen.getByText(/1 of 1 on\./)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Connections tools" })).toBeChecked();
    await waitFor(() => expect(schema).not.toBeDisabled());
    fireEvent.click(schema);
    await waitFor(() => expect(setMcpGroup).toHaveBeenCalledWith("schema", true));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Schema tools" })).toBeChecked());
  });

  it("has no direct HTTP option", async () => {
    renderAgents({ bridgeOverrides: { getMcpStatus: async () => OFF } });
    await screen.findByText("Off");
    expect(screen.queryByRole("switch", { name: "Direct HTTP" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy client config" })).toBeNull();
  });

  it("reloads the status when Refresh is pressed", async () => {
    const getMcpStatus = vi.fn(async () => OFF);
    renderAgents({ bridgeOverrides: { getMcpStatus } });
    await screen.findByText("Off");
    await openTab("Agent activity");
    // Opening the tab reads the activity again.
    await waitFor(() => expect(getMcpStatus).toHaveBeenCalledTimes(2));
    fireEvent.click(await screen.findByRole("button", { name: "Refresh activity" }));
    await waitFor(() => expect(getMcpStatus).toHaveBeenCalledTimes(3));
  });

  it("shows the switch as it is when the section is opened again, without drawing it off first", async () => {
    const running: McpStatusInfo = { ...OFF, enabled: true, running: true, port: 5000 };
    let calls = 0;
    // Only the first read answers; later ones hang, as a slow main process would.
    const getMcpStatus = vi.fn(() => (++calls === 1 ? Promise.resolve(running) : new Promise<McpStatusInfo>(() => undefined)));
    renderAgents({ bridgeOverrides: { getMcpStatus } });
    const name = /Let AI agents use Power Tools/;
    expect(await screen.findByRole("switch", { name })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Privacy" }));
    fireEvent.click(screen.getByRole("button", { name: "MCP server" }));
    expect(screen.getByRole("switch", { name })).toBeChecked();
    expect(screen.getByRole("switch", { name })).not.toBeDisabled();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(getMcpStatus).toHaveBeenCalledTimes(2);

    // Closing and opening Settings keeps it too.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument());
    fireEvent.click(screen.getByText("open agents"));
    expect(await screen.findByRole("switch", { name })).toBeChecked();
    expect(screen.getByRole("switch", { name })).not.toBeDisabled();
  });

  it("shows that the server state is loading instead of an off switch", async () => {
    renderAgents({ bridgeOverrides: { getMcpStatus: () => new Promise<McpStatusInfo>(() => undefined) } });
    expect(await screen.findByRole("status", { name: /Loading Let AI agents use Power Tools/ })).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /Let AI agents use Power Tools/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Off")).not.toBeInTheDocument();
  });

  it("opens at MCP server from the Agents (MCP) menu event", async () => {
    const view = renderShell();
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
    view.bridge.emitOpenAgents();
    expect(await screen.findByRole("heading", { name: "MCP server" })).toBeInTheDocument();
  });

  it("lists each tool with its effect, filters by search, and switches one tool", async () => {
    const setMcpTool = vi.fn(async (name: string, enabled: boolean): Promise<McpStatusInfo> => ({
      ...OFF,
      tools: OFF.tools.map((t) => (t.name === name ? { ...t, enabled } : t)),
    }));
    renderAgents({ bridgeOverrides: { getMcpStatus: async () => OFF, setMcpTool } });
    await screen.findByText("Off");
    await openTab("Agent tools");
    fireEvent.click(await screen.findByRole("button", { name: "Show Connections tools" }));
    const toggle = screen.getByRole("switch", { name: "List connections (connections_list)" });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(toggle);
    await waitFor(() => expect(setMcpTool).toHaveBeenCalledWith("connections_list", false));
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "List connections (connections_list)" })).not.toBeChecked(),
    );

    fireEvent.change(screen.getByLabelText("Search agent tools"), { target: { value: "column" } });
    const column = screen.getByRole("switch", { name: "Create a column (schema_create_column)" });
    expect(screen.queryByText("List connections")).not.toBeInTheDocument();
    // A tool of a switched-off group cannot be switched on its own.
    expect(column).toBeDisabled();
    // It also reads as off, since agents do not get it, though its own setting is kept.
    expect(column).not.toBeChecked();
  });

  it("flips a tool switch at once without dimming the others while main saves", async () => {
    let finish: (status: McpStatusInfo) => void = () => undefined;
    const setMcpTool = vi.fn(() => new Promise<McpStatusInfo>((resolve) => (finish = resolve)));
    renderAgents({ bridgeOverrides: { getMcpStatus: async () => OFF, setMcpTool } });
    await screen.findByText("Off");
    await openTab("Agent tools");
    fireEvent.click(await screen.findByRole("button", { name: "Show Connections tools" }));
    const name = "List connections (connections_list)";
    await waitFor(() => expect(screen.getByRole("switch", { name })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("switch", { name }));
    expect(screen.getByRole("switch", { name })).not.toBeChecked();
    expect(screen.getByRole("switch", { name })).not.toBeDisabled();
    expect(screen.getByRole("switch", { name: "Connections tools" })).not.toBeDisabled();
    act(() => finish({ ...OFF, tools: OFF.tools.map((t) => (t.name === "connections_list" ? { ...t, enabled: false } : t)) }));
    await waitFor(() => expect(setMcpTool).toHaveBeenCalledWith("connections_list", false));
    expect(screen.getByRole("switch", { name })).not.toBeChecked();
  });

  it("puts a tool switch back when main cannot save it", async () => {
    const setMcpTool = vi.fn(async (): Promise<McpStatusInfo> => {
      throw new Error("Could not save");
    });
    renderAgents({ bridgeOverrides: { getMcpStatus: async () => OFF, setMcpTool } });
    await screen.findByText("Off");
    await openTab("Agent tools");
    fireEvent.click(await screen.findByRole("button", { name: "Show Connections tools" }));
    const name = "List connections (connections_list)";
    await waitFor(() => expect(screen.getByRole("switch", { name })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("switch", { name }));
    await waitFor(() => expect(screen.getByRole("switch", { name })).toBeChecked());
  });

  it("filters tools by what they do", async () => {
    renderAgents({ bridgeOverrides: { getMcpStatus: async () => OFF } });
    await screen.findByText("Off");
    await openTab("Agent tools");
    const filter = await screen.findByRole("group", { name: "Show tools that" });
    fireEvent.click(within(filter).getByRole("button", { name: /^Change/ }));
    expect(screen.getByText("Create a column")).toBeInTheDocument();
    expect(screen.queryByText("List connections")).not.toBeInTheDocument();
    fireEvent.click(within(filter).getByRole("button", { name: /^Destructive/ }));
    expect(screen.getByText("No matching tools")).toBeInTheDocument();
  });

  it("shows declined calls and errors in the activity and filters to errors", async () => {
    renderAgents({
      bridgeOverrides: {
        getMcpStatus: async () => ({
          ...OFF,
          recent: [
            { time: "2026-11-12T10:00:00.000Z", client: "claude-code", tool: "connections_list", connection: null, effect: "read", approval: "not-needed", outcome: "ok", summary: "connections_list" },
            { time: "2026-11-12T10:01:00.000Z", client: "claude-code", tool: "schema_create_column", connection: "A · Dev", effect: "change", approval: "denied", outcome: "error", code: "Denied", summary: "schema_create_column account.new_x" },
            { time: "2026-11-12T10:02:00.000Z", client: "claude-code", tool: "schema_create_column", connection: "A · Dev", effect: "change", approval: "allowed", outcome: "error", code: "InvalidRequest", summary: "schema_create_column account.new_y" },
          ],
        }),
      },
    });
    await screen.findByText("Off");
    await openTab("Agent activity");
    expect(await screen.findByText("Declined")).toBeInTheDocument();
    expect(screen.getByText("InvalidRequest")).toBeInTheDocument();
    expect(screen.getByText("You approved")).toBeInTheDocument();
    expect(screen.getByText("List connections")).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("group", { name: "Show calls" })).getByRole("button", { name: /^Errors/ }));
    expect(screen.queryByText("List connections")).not.toBeInTheDocument();
    expect(screen.getAllByText("Create a column")).toHaveLength(2);
  });

  it("links from MCP server to the tools and activity tabs", async () => {
    renderAgents({ bridgeOverrides: { getMcpStatus: async () => OFF } });
    expect(await screen.findByText("1 of 2, in 2 groups")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Manage tools" }));
    expect(await screen.findByRole("heading", { name: "Agent tools" })).toBeInTheDocument();
    await openTab("MCP server");
    fireEvent.click(await screen.findByRole("button", { name: "View activity" }));
    expect(await screen.findByRole("heading", { name: "Agent activity" })).toBeInTheDocument();
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

  it("groups the sections and filters them by what you search for", async () => {
    renderShell();
    fireEvent.click(screen.getByText("open settings"));
    const nav = await screen.findByRole("navigation", { name: "Settings sections" });
    expect(within(nav).getAllByRole("group").map((group) => group.getAttribute("aria-label"))).toEqual([
      "General",
      "AI agents",
      "Application",
    ]);

    // A word from inside a section finds it and opens it.
    fireEvent.change(screen.getByLabelText("Search settings"), { target: { value: "crash" } });
    expect(within(nav).getAllByRole("button").map((button) => button.textContent)).toEqual(["Privacy"]);
    expect(screen.getByRole("heading", { name: "Privacy" })).toBeInTheDocument();

    // Words match from their start: "port" is the MCP port, not crash "reports".
    fireEvent.change(screen.getByLabelText("Search settings"), { target: { value: "port" } });
    expect(within(nav).getAllByRole("button").map((button) => button.textContent)).toEqual(["MCP server"]);
    fireEvent.change(screen.getByLabelText("Search settings"), { target: { value: "crash" } });

    fireEvent.change(screen.getByLabelText("Search settings"), { target: { value: "no such setting" } });
    expect(within(nav).queryAllByRole("button")).toHaveLength(0);
    expect(within(nav).getByText(/No settings match/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Privacy" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(within(nav).getAllByRole("button")).toHaveLength(8);
  });

  it("changes the theme through main", async () => {
    const setThemePreference = vi.fn(async (theme: "system" | "dark" | "light" | "dark-orange") => ({
      theme,
      usageStats: true,
      crashReports: true,
      version: "1.2.3",
      updatesEnabled: true,
    }));
    renderShell({ bridgeOverrides: { setThemePreference } });
    fireEvent.click(screen.getByText("open settings"));
    const dark = await screen.findByRole("radio", { name: /^Dark(?! Orange)/ });
    await waitFor(() => expect(dark).not.toBeDisabled());
    expect(screen.getByRole("radio", { name: /System/ })).toBeChecked();
    fireEvent.click(dark);
    await waitFor(() => expect(setThemePreference).toHaveBeenCalledWith("dark"));
    await waitFor(() => expect(screen.getByRole("radio", { name: /^Dark(?! Orange)/ })).toBeChecked());

    fireEvent.click(screen.getByRole("radio", { name: /Dark Orange/ }));
    await waitFor(() => expect(setThemePreference).toHaveBeenCalledWith("dark-orange"));
    await waitFor(() => expect(screen.getByRole("radio", { name: /Dark Orange/ })).toBeChecked());
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
