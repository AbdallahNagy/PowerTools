import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { ConnectionsProvider } from "../../src/ui/shared/connections";
import ConnectionDetailsWindow from "../../src/ui/shell/connection-windows/ConnectionDetailsWindow";
import ConnectionManagerWindow from "../../src/ui/shell/connection-windows/ConnectionManagerWindow";
import ConnectionFooter from "../../src/ui/shell/layout/ConnectionFooter";
import Tab from "../../src/ui/shell/tabs/TabHeader";
import { useConnectionCommands } from "../../src/ui/shell/layout/useConnectionCommands";
import { describedConnection, legacyConnection } from "../support/desktopBridge";
import { renderWithProviders } from "../support/render";

// The resizable panes in Manage connections measure themselves.
class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => vi.stubGlobal("ResizeObserver", TestResizeObserver));
afterAll(() => vi.unstubAllGlobals());

const connections = [
  describedConnection("p", "Contoso", "Production", "https://contoso.crm.dynamics.com"),
  describedConnection("d", "Contoso", "Dev", "https://contoso-dev.crm.dynamics.com"),
  legacyConnection("old", "https://fabrikam.crm.dynamics.com"),
];

describe("connection footer", () => {
  it("groups connections by organization and sends old ones to Manage connections", async () => {
    const openConnectionManager = vi.fn(async () => undefined);
    renderWithProviders(
      <ConnectionsProvider>
        <ConnectionFooter />
      </ConnectionsProvider>,
      {
        bridgeOverrides: {
          listConnections: async () => connections,
          getActiveConnectionId: async () => "p",
          openConnectionManager,
        },
      },
    );

    const button = await screen.findByRole("button", { name: "Connection: Contoso · Production" });
    expect(within(button).getByText("prod")).toBeInTheDocument();
    fireEvent.click(button);

    const contoso = screen.getByRole("group", { name: "Contoso" });
    expect(within(contoso).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Dev", "✓Productionprod"]);
    const other = screen.getByRole("group", { name: "Other" });
    expect(within(other).getByRole("menuitem", { name: "old" })).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Delete Contoso · Dev" })).toHaveClass("invisible", "group-hover:visible");
    expect(screen.getByRole("button", { name: "Edit Contoso · Dev" })).toHaveClass("invisible", "group-hover:visible");

    fireEvent.click(screen.getByRole("button", { name: "Update these to group them" }));
    expect(openConnectionManager).toHaveBeenCalledWith("old", undefined);
  });
});

describe("describe this connection", () => {
  it("fills in the next free environment and saves organization and environment", async () => {
    const saveConnectionDetails = vi.fn(async () => ({ success: true, id: "new" }));
    renderWithProviders(<ConnectionDetailsWindow />, {
      bridgeOverrides: {
        getPendingConnection: async () => ({ envUrl: "https://contoso-dev2.crm.dynamics.com", crmType: "online" as const }),
        listConnections: async () => connections,
        saveConnectionDetails,
      },
    });

    fireEvent.click(await screen.findByRole("button", { name: "Use “contoso-dev2” from the address" }));
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "Contoso" } });
    fireEvent.click(await screen.findByRole("button", { name: "dev 2" }));
    expect(screen.getByLabelText("Environment")).toHaveValue("dev 2");
    expect(screen.getByText("Contoso · dev 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(saveConnectionDetails).toHaveBeenCalledWith({ organization: "Contoso", environment: "dev 2", browser: null }),
    );
  });

  it("explains a clash instead of saving it", async () => {
    const saveConnectionDetails = vi.fn(async () => ({ success: true }));
    renderWithProviders(<ConnectionDetailsWindow />, {
      bridgeOverrides: {
        getPendingConnection: async () => ({ envUrl: "https://x.crm.dynamics.com", crmType: "online" as const }),
        listConnections: async () => connections,
        saveConnectionDetails,
      },
    });

    await screen.findByText("https://x.crm.dynamics.com");
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "contoso" } });
    fireEvent.change(screen.getByLabelText("Environment"), { target: { value: "dev" } });
    expect(await screen.findByText('Contoso already has "Dev". Try "dev 2".')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(saveConnectionDetails).not.toHaveBeenCalled();
  });
});

describe("manage connections", () => {
  it("edits the selected connection and its browser profile", async () => {
    const updateConnection = vi.fn(async () => ({ success: true }));
    renderWithProviders(<ConnectionManagerWindow />, {
      bridgeOverrides: {
        listConnections: async () => connections,
        takeConnectionManagerRequest: async () => ({ selectId: "old", action: null }),
        listBrowsers: async () => [
          {
            id: "edge" as const,
            name: "Microsoft Edge",
            profiles: [
              { id: "Default", name: "Personal" },
              { id: "Profile 1", name: "Work" },
            ],
          },
        ],
        updateConnection,
      },
    });

    expect(await screen.findByText("Was named", { exact: false })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "Fabrikam" } });
    fireEvent.click(screen.getByRole("button", { name: "qc" }));
    fireEvent.change(screen.getByLabelText("Open links in"), { target: { value: "edge" } });
    fireEvent.change(await screen.findByLabelText("Profile"), { target: { value: "Profile 1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateConnection).toHaveBeenCalledWith("old", {
        organization: "Fabrikam",
        environment: "qc",
        browser: { id: "edge", profile: "Profile 1" },
      }),
    );
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });

  it("previews an import and imports the chosen connections", async () => {
    const commitConnectionImport = vi.fn(async () => ({ success: true, imported: 1 }));
    renderWithProviders(<ConnectionManagerWindow />, {
      bridgeOverrides: {
        listConnections: async () => connections,
        previewConnectionImport: async () => ({
          source: "xrmtoolbox" as const,
          fileName: "connections.xml",
          items: [
            { key: "1", organization: "Contoso", environment: "UAT", legacyName: null, envUrl: "https://uat.test", crmType: "online" as const, status: "new" as const },
            { key: "2", organization: null, environment: null, legacyName: "Cert app", envUrl: "https://cert.test", crmType: "online" as const, status: "unsupported" as const, reason: "Certificate sign-in is not supported." },
          ],
        }),
        commitConnectionImport,
      },
    });

    fireEvent.click(await screen.findByRole("button", { name: "Import" }));
    const dialog = await screen.findByRole("dialog", { name: "Import from XrmToolBox" });
    expect(within(dialog).getByRole("checkbox", { name: "Cert app" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Import 1" }));

    await waitFor(() => expect(commitConnectionImport).toHaveBeenCalledWith(["1"]));
    expect(await screen.findByText("Imported 1 connection.")).toBeInTheDocument();
  });
});

function CommandsProbe() {
  const sections = useConnectionCommands();
  return (
    <ul>
      {sections.flatMap((section) => section.commands).map((command) => (
        <li key={command.id}>
          <button type="button" onClick={command.onRun}>{command.title}</button>
        </li>
      ))}
    </ul>
  );
}

describe("connection commands", () => {
  it("switches the active connection and opens Manage connections for the current one", async () => {
    const setActiveConnection = vi.fn(async () => ({ success: true }));
    const openConnectionManager = vi.fn(async () => undefined);
    const openUrlForConnection = vi.fn(async () => ({ fallback: false }));
    renderWithProviders(
      <ConnectionsProvider>
        <CommandsProbe />
      </ConnectionsProvider>,
      {
        bridgeOverrides: {
          listConnections: async () => connections,
          getActiveConnectionId: async () => "p",
          setActiveConnection,
          openConnectionManager,
          openUrlForConnection,
        },
      },
    );

    expect(await screen.findByRole("button", { name: "Edit Contoso · Production" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Switch to Contoso · Production" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Switch to Contoso · Dev" }));
    expect(setActiveConnection).toHaveBeenCalledWith("d");

    fireEvent.click(screen.getByRole("button", { name: "Edit Contoso · Production" }));
    expect(openConnectionManager).toHaveBeenCalledWith("p", undefined);

    fireEvent.click(screen.getByRole("button", { name: "Open Contoso · Production in browser" }));
    expect(openUrlForConnection).toHaveBeenCalledWith("p", "https://contoso.crm.dynamics.com");

    fireEvent.click(screen.getByRole("button", { name: "Import connections" }));
    expect(openConnectionManager).toHaveBeenLastCalledWith(null, "import");
  });
});

describe("tab header", () => {
  it("turns red and says so when the tab works against production", () => {
    renderWithProviders(
      <>
        <Tab title="FetchXML Builder" connectionLabel="Contoso · prod" production active />
        <Tab title="Plugin Registration" connectionLabel="Contoso · dev" />
      </>,
    );

    const prod = screen.getByLabelText("FetchXML Builder, Contoso · prod (production)");
    expect(prod).toHaveAttribute("data-production", "true");
    expect(prod).toHaveClass("border-danger", "bg-danger-soft");
    expect(screen.getByLabelText("Plugin Registration, Contoso · dev")).not.toHaveAttribute("data-production");
  });
});
