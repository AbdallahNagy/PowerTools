import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { ConnectionsProvider } from "../../../../shared/connections";
import { renderWithProviders } from "../../../../../../test/support/render";
import { httpServer } from "../../../../../../test/support/httpServer";
import PluginRegistration from "../../PluginRegistration";

const apiPostMock = vi.hoisted(() => vi.fn());
vi.mock("../../../../shared/api/client", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../../shared/api/client")>(), apiPost: apiPostMock,
}));

const originalResizeObserver = window.ResizeObserver;
beforeAll(() => { window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; });
afterAll(() => { if (originalResizeObserver) window.ResizeObserver = originalResizeObserver; else Reflect.deleteProperty(window, "ResizeObserver"); });
beforeEach(() => { apiPostMock.mockReset(); useResponses(); });

describe("Step mutations", () => {
  it("uses connection options, warns on unfiltered Update, rejects its primary key, and never displays stored secure config", async () => {
    renderPage();
    await openPlugin();
    fireEvent.contextMenu(screen.getByRole("treeitem", { name: "(Plugin) Account Plugin" }));
    await userEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Register step" }));

    const dialog = await screen.findByRole("dialog", { name: "Register step" });
    expect(within(dialog).getByLabelText("Message")).toHaveValue("message-update");
    expect(within(dialog).getByLabelText("Primary table")).toHaveValue("account");
    expect(dialog).toHaveTextContent("Stored secure configuration is not displayed");
    expect(dialog).not.toHaveTextContent("stored-secret");
    expect(dialog).toHaveTextContent("Update steps should select filtering attributes");

    await userEvent.type(within(dialog).getByLabelText("Filtering attributes"), "accountid");
    expect(dialog).toHaveTextContent("primary key cannot be used");
    expect(within(dialog).getByRole("button", { name: "Preview changes" })).toBeDisabled();
    await userEvent.clear(within(dialog).getByLabelText("Filtering attributes"));
    await userEvent.type(within(dialog).getByLabelText("Replacement secure configuration"), "new-secret");
    await userEvent.click(within(dialog).getByRole("button", { name: "Preview changes" }));
    expect(apiPostMock).toHaveBeenCalledWith("/api/plugin-registration/steps/create/preflight",
      expect.objectContaining({ replacementSecureConfiguration: "new-secret" }), expect.anything());
    expect(await screen.findByRole("dialog", { name: "Step impact preview" })).toHaveTextContent("Update account");
  });

  it("requires exact name for delete and identifies environment, message, table, and stage for disable", async () => {
    renderPage();
    await openStep();
    fireEvent.contextMenu(screen.getByRole("treeitem", { name: "(Step) Update account" }));
    await userEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Unregister step" }));
    const confirmation = await screen.findByRole("dialog", { name: "Unregister step" });
    expect(within(confirmation).getByRole("button", { name: "Unregister step" })).toBeDisabled();
    await userEvent.type(within(confirmation).getByLabelText("Type Update account to confirm"), "Update account");
    expect(within(confirmation).getByRole("button", { name: "Unregister step" })).toBeEnabled();

    await userEvent.click(within(confirmation).getByRole("button", { name: "Cancel" }));
    fireEvent.contextMenu(screen.getByRole("treeitem", { name: "(Step) Update account" }));
    await userEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Disable step" }));
    const stateDialog = await screen.findByRole("dialog", { name: "Disable step" });
    expect(stateDialog).toHaveTextContent("Development");
    expect(stateDialog).toHaveTextContent("Update · account · PostOperation");
  });
});

function useResponses() {
  httpServer.use(
    http.get("http://localhost/api/plugin-registration/catalog", () => HttpResponse.json(catalog)),
    http.get("http://localhost/api/plugin-registration/step-options", () => HttpResponse.json({
      messages: [{ id: "message-update", name: "Update" }],
      filters: [{ id: "filter-account", messageId: "message-update", primaryTable: "account", secondaryTable: null, primaryIdAttribute: "accountid" }],
      enabledUsers: [{ id: "user-1", name: "Service User" }],
    })),
  );
  apiPostMock.mockResolvedValue({
    draft: {}, plan: { token: "signed", blockers: [], warnings: [{ code: "filter", message: "Update steps should select filtering attributes" }], confirmation: { level: "explicit", message: "Confirm" } },
    after: { message: "Update", primaryTable: "account", stage: 40, mode: 0, rank: 1, filteringAttributes: [], secureConfigExists: true },
  });
}

function renderPage() {
  return renderWithProviders(<ConnectionsProvider><PluginRegistration /></ConnectionsProvider>, { bridgeOverrides: {
    listConnections: async () => [{ name: "Development", envUrl: "https://development.test", crmType: "online" }],
    getActiveConnectionName: async () => "Development",
    getConnection: async (name) => ({ name, envUrl: "https://development.test", crmType: "online", token: "token", expiresOn: "2099-01-01T00:00:00Z" }),
  } });
}
async function openPlugin() {
  const assembly = await screen.findByRole("treeitem", { name: "Contoso" });
  fireEvent.click(assembly);
  fireEvent.click(screen.getByRole("treeitem", { name: "(Plugin) Account Plugin" }));
}
async function openStep() { await openPlugin(); fireEvent.click(screen.getByRole("treeitem", { name: "(Step) Update account" })); }

const catalog = { assemblies: [{ id: "assembly-1", name: "Contoso", version: "1.0.0.0", culture: "neutral", publicKeyToken: "token", sourceType: 0, isolationMode: 2, isManaged: false, isCustomizable: true, versionNumber: 1, description: null, solutionDisplayName: null, handlers: [{ id: "plugin-1", kind: 0, typeName: "Contoso.AccountPlugin", name: "Account Plugin", friendlyName: null, description: null, workflowActivityGroupName: null, isManaged: false, isCustomizable: true, versionNumber: 4, workflowArguments: [], dependencies: [], assemblyId: "assembly-1", solutionDisplayName: null, steps: [{ id: "step-1", pluginHandlerId: "plugin-1", name: "Update account", description: null, messageLabel: "Update", primaryTableLabel: "account", secondaryTableLabel: null, stageLabel: "PostOperation", modeLabel: "Synchronous", stage: 40, mode: 0, rank: 1, isEnabled: true, isManaged: false, isCustomizable: true, versionNumber: 7, secureConfigExists: true, images: [], solutionDisplayName: null }] }] }] };
