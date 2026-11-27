import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../../../../../test/support/render";
import { SettingsContext, type SettingsContextValue } from "../../../../shell/settings/SettingsContext";
import { TabProviderContext, type TabContextValue } from "../../../../shell/tabs/TabProviderContext";
import { PUBLIC_TOOLS } from "../../../publicCatalog";
import WelcomeTab from "../../index";
import { welcomeTool } from "../../tool";

function withTabs(openTool: TabContextValue["openTool"], children: ReactNode) {
  const value = { openTool } as unknown as TabContextValue;
  return <TabProviderContext.Provider value={value}>{children}</TabProviderContext.Provider>;
}

function withSettings(openSettings: SettingsContextValue["openSettings"], children: ReactNode) {
  const value: SettingsContextValue = {
    open: false,
    section: "appearance",
    openSettings,
    setSection: () => undefined,
    closeSettings: () => undefined,
  };
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

describe("Welcome tool", () => {
  it("owns the singleton Welcome manifest", () => {
    expect(welcomeTool).toMatchObject({
      id: "welcome",
      title: "Welcome",
      icon: "",
      showInActivityBar: false,
      allowMultipleInstances: false,
      component: WelcomeTab,
    });
  });

  it("opens the Dyno repository through the desktop bridge", () => {
    const openedUrls: string[] = [];
    renderWithProviders(<WelcomeTab />, {
      bridgeOverrides: {
        openExternalUrl: async (url) => {
          openedUrls.push(url);
        },
      },
    });

    fireEvent.click(screen.getByRole("link", { name: "View on GitHub" }));

    expect(openedUrls).toEqual(["https://github.com/AbdallahNagy/Dyno"]);
  });

  it("opens the tool request form with the app version", async () => {
    const openedUrls: string[] = [];
    renderWithProviders(<WelcomeTab />, {
      bridgeOverrides: {
        getAppVersion: async () => "1.2.0",
        openExternalUrl: async (url) => {
          openedUrls.push(url);
        },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Request a tool" }));

    await waitFor(() => expect(openedUrls).toHaveLength(1));
    const url = new URL(openedUrls[0]);
    expect(url.searchParams.get("template")).toBe("tool-request.yml");
    expect(url.searchParams.get("source")).toBe("desktop 1.2.0");
  });

  it("lists every public tool from the catalog as a button that opens it", () => {
    const openTool = vi.fn();
    renderWithProviders(withTabs(openTool, <WelcomeTab />));

    for (const tool of PUBLIC_TOOLS) {
      expect(screen.getByText(tool.description)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: `Open ${tool.title}` }));
    }

    expect(openTool.mock.calls.map(([id]) => id)).toEqual(PUBLIC_TOOLS.map((tool) => tool.id));
  });

  it("turns the MCP server on from the welcome page", async () => {
    const setMcpEnabled = vi.fn();
    renderWithProviders(<WelcomeTab />, {
      bridgeOverrides: {
        setMcpEnabled: async (enabled) => {
          setMcpEnabled(enabled);
          return {
            enabled,
            running: enabled,
            port: 51234,
            discoveryPath: "",
            error: null,
            connectorCommand: "connector.exe",
            connector: { command: "connector.exe", args: [] },
            recent: [],
            groups: [],
            tools: [],
          };
        },
      },
    });

    fireEvent.click(await screen.findByRole("button", { name: "Turn on" }));

    expect(await screen.findByText("The MCP server is running")).toBeInTheDocument();
    expect(setMcpEnabled).toHaveBeenCalledWith(true);
  });

  it("opens Settings at Agents (MCP)", () => {
    const openSettings = vi.fn();
    renderWithProviders(withSettings(openSettings, <WelcomeTab />));

    fireEvent.click(screen.getByRole("button", { name: "Set up AI agents" }));

    expect(openSettings).toHaveBeenCalledWith("agents");
  });

  it("shows this computer's Claude Code command", async () => {
    renderWithProviders(<WelcomeTab />, {
      bridgeOverrides: {
        getMcpStatus: async () => ({
          enabled: false,
          running: false,
          port: null,
          discoveryPath: "",
          error: null,
          connectorCommand: '"C:\\dyno\\connector.exe"',
          connector: { command: "C:\\dyno\\connector.exe", args: [] },
          recent: [],
          groups: [],
          tools: [],
        }),
      },
    });

    expect(
      await screen.findByText('claude mcp add --scope user dyno -- "C:\\dyno\\connector.exe"'),
    ).toBeInTheDocument();
  });
});
