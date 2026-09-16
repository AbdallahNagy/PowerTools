import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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
    expect(within(dialog).getByLabelText("Message filter")).toHaveValue("filter-account");
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

  it("keeps same-table message filters separately selectable by their Dataverse identities", async () => {
    httpServer.use(http.get("http://localhost/api/plugin-registration/step-options", () => HttpResponse.json({
      messages: [{ id: "message-update", name: "Update" }],
      filters: [
        { id: "filter-account-primary", messageId: "message-update", primaryTable: "account", secondaryTable: null, primaryIdAttribute: "accountid" },
        { id: "filter-account-related", messageId: "message-update", primaryTable: "account", secondaryTable: "contact", primaryIdAttribute: "accountid" },
      ],
      enabledUsers: [],
    })));
    renderPage();
    await openPlugin();
    fireEvent.contextMenu(screen.getByRole("treeitem", { name: "(Plugin) Account Plugin" }));
    await userEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Register step" }));

    const dialog = await screen.findByRole("dialog", { name: "Register step" });
    const filter = within(dialog).getByLabelText("Message filter");
    await userEvent.selectOptions(filter, "filter-account-related");
    await userEvent.click(within(dialog).getByRole("button", { name: "Preview changes" }));

    expect(apiPostMock).toHaveBeenCalledWith("/api/plugin-registration/steps/create/preflight",
      expect.objectContaining({ sdkMessageFilterId: "filter-account-related", secondaryTable: "contact" }), expect.anything());
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

  it("initializes update from safe fresh details and refreshes only after verified execute", async () => {
    let catalogReads = 0;
    httpServer.use(
      http.get("http://localhost/api/plugin-registration/catalog", () => { catalogReads++; return HttpResponse.json(catalog); }),
      http.get("http://localhost/api/plugin-registration/steps/step-1/edit-details", () => HttpResponse.json({
        stepId: "step-1", pluginTypeId: "plugin-1", sdkMessageId: "message-update", sdkMessageFilterId: "filter-account",
        primaryTable: "account", secondaryTable: null, stage: 40, mode: 0, rank: 3,
        filteringAttributes: ["name"], impersonatingUserId: "user-1", unsecureConfiguration: "public-config",
        secureConfigExists: true, expectedVersions: { "plugin-1": 4, "step-1": 7 },
      })),
    );
    apiPostMock.mockImplementation((url: string) => url.endsWith("/preflight") ? Promise.resolve({
      draft: {}, before: { message: "Update", primaryTable: "account", stage: 40, mode: 0, rank: 3, filteringAttributes: ["name"], impersonatingUserId: "user-1", unsecureConfiguration: "public-config", secureConfigExists: true, isEnabled: true },
      after: { message: "Update", primaryTable: "account", stage: 40, mode: 0, rank: 3, filteringAttributes: ["name"], impersonatingUserId: "user-1", unsecureConfiguration: "public-config", secureConfigExists: true, isEnabled: true },
      plan: { token: "signed", blockers: [], warnings: [], changes: [{ field: "rank", before: "3", after: "3" }, { field: "secureConfigurationAction", before: null, after: "keep" }], confirmation: { message: "Confirm" } },
    }) : Promise.resolve({ outcome: "succeededAndVerified", succeededAndVerified: true, step: catalog.assemblies[0].handlers[0].steps[0] }));
    renderPage();
    await openStep();
    fireEvent.doubleClick(screen.getByRole("treeitem", { name: "(Step) Update account" }));
    const dialog = await screen.findByRole("dialog", { name: "Update step" });
    expect(await within(dialog).findByLabelText("Filtering attributes")).toHaveValue("name");
    expect(within(dialog).getByLabelText("Impersonating user")).toHaveValue("user-1");
    expect(within(dialog).getByLabelText("Unsecure configuration")).toHaveValue("public-config");
    expect(dialog).not.toHaveTextContent("stored-secret");
    await userEvent.click(within(dialog).getByRole("button", { name: "Preview changes" }));
    const preview = await screen.findByRole("dialog", { name: "Step impact preview" });
    expect(preview).toHaveTextContent("Rank: 3 → 3");
    expect(preview).toHaveTextContent("Secure configuration: Keep");
    await userEvent.click(within(preview).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(catalogReads).toBeGreaterThanOrEqual(2));
  });

  it("blocks update preview until safe edit details load and shows a sanitized load failure", async () => {
    let rejectDetails!: (reason: unknown) => void;
    httpServer.use(http.get("http://localhost/api/plugin-registration/steps/step-1/edit-details", () =>
      new Promise((_resolve, reject) => { rejectDetails = reject; })));
    renderPage();
    await openStep();
    fireEvent.doubleClick(screen.getByRole("treeitem", { name: "(Step) Update account" }));
    const dialog = await screen.findByRole("dialog", { name: "Update step" });
    expect(within(dialog).getByLabelText("Message")).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Preview changes" })).toBeDisabled();
    rejectDetails(new Error("stored-secret backend detail"));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Unable to load step details");
    expect(dialog).not.toHaveTextContent("stored-secret backend detail");
  });

  it("explains a step-choice failure and retries it without reopening the update dialog", async () => {
    let choiceReads = 0;
    httpServer.use(http.get("http://localhost/api/plugin-registration/step-options", () => {
      choiceReads++;
      return choiceReads === 1
        ? HttpResponse.json({ detail: "secret choice failure" }, { status: 500 })
        : HttpResponse.json({
          messages: [{ id: "message-update", name: "Update" }],
          filters: [{ id: "filter-account", messageId: "message-update", primaryTable: "account", secondaryTable: null, primaryIdAttribute: "accountid" }],
          enabledUsers: [],
        });
    }));
    renderPage();
    await openStep();
    fireEvent.doubleClick(screen.getByRole("treeitem", { name: "(Step) Update account" }));

    const dialog = await screen.findByRole("dialog", { name: "Update step" });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Unable to load step choices");
    expect(dialog).not.toHaveTextContent("secret choice failure");
    await userEvent.click(within(dialog).getByRole("button", { name: "Retry step choices" }));

    expect(await within(dialog).findByLabelText("Message")).toHaveValue("message-update");
    expect(choiceReads).toBe(2);
  });

  it("explains a step-details failure and retries it without exposing backend error text", async () => {
    let detailReads = 0;
    httpServer.use(http.get("http://localhost/api/plugin-registration/steps/step-1/edit-details", () => {
      detailReads++;
      return detailReads === 1
        ? HttpResponse.json({ detail: "stored-secret backend detail" }, { status: 500 })
        : HttpResponse.json({
          stepId: "step-1", pluginTypeId: "plugin-1", sdkMessageId: "message-update", sdkMessageFilterId: "filter-account",
          primaryTable: "account", secondaryTable: null, stage: 40, mode: 0, rank: 1, filteringAttributes: ["name"],
          impersonatingUserId: null, unsecureConfiguration: null, secureConfigExists: true,
          expectedVersions: { "plugin-1": 4, "step-1": 7 },
        });
    }));
    renderPage();
    await openStep();
    fireEvent.doubleClick(screen.getByRole("treeitem", { name: "(Step) Update account" }));

    const dialog = await screen.findByRole("dialog", { name: "Update step" });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Unable to load step details");
    expect(dialog).not.toHaveTextContent("stored-secret backend detail");
    await userEvent.click(within(dialog).getByRole("button", { name: "Retry step details" }));

    expect(await within(dialog).findByLabelText("Filtering attributes")).toHaveValue("name");
    expect(detailReads).toBe(2);
  });

  it("discards a late step-details response after the update dialog closes", async () => {
    let resolveDetails!: (response: HttpResponse) => void;
    httpServer.use(http.get("http://localhost/api/plugin-registration/steps/step-1/edit-details", () =>
      new Promise<HttpResponse>((resolve) => { resolveDetails = resolve; })));
    renderPage();
    await openStep();
    fireEvent.doubleClick(screen.getByRole("treeitem", { name: "(Step) Update account" }));

    const dialog = await screen.findByRole("dialog", { name: "Update step" });
    expect(within(dialog).getByText("Loading current step details…")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    resolveDetails(HttpResponse.json({
      stepId: "step-1", pluginTypeId: "plugin-1", sdkMessageId: "message-update", sdkMessageFilterId: "filter-account",
      primaryTable: "account", secondaryTable: null, stage: 40, mode: 0, rank: 1, filteringAttributes: ["name"],
      impersonatingUserId: null, unsecureConfiguration: null, secureConfigExists: true,
      expectedVersions: { "plugin-1": 4, "step-1": 7 },
    }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Update step" })).not.toBeInTheDocument());
  });

  it("keeps a managed step inspectable while explaining why its update controls are disabled", async () => {
    const managedCatalog = structuredClone(catalog);
    managedCatalog.assemblies[0].handlers[0].steps[0].isManaged = true;
    managedCatalog.assemblies[0].handlers[0].steps[0].isCustomizable = false;
    httpServer.use(http.get("http://localhost/api/plugin-registration/catalog", () => HttpResponse.json(managedCatalog)));
    renderPage();
    await openStep();
    fireEvent.doubleClick(screen.getByRole("treeitem", { name: "(Step) Update account" }));

    const dialog = await screen.findByRole("dialog", { name: "Update step" });
    expect(await within(dialog).findByText("This step is managed or not customizable, so it can be inspected but not updated.")).toBeInTheDocument();
    expect(await within(dialog).findByLabelText("Filtering attributes")).toHaveValue("");
    expect(within(dialog).getByLabelText("Message")).toHaveValue("message-update");
    expect(within(dialog).getByLabelText("Filtering attributes")).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Preview changes" })).toBeDisabled();
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
    http.get("http://localhost/api/plugin-registration/steps/:stepId/edit-details", () => HttpResponse.json({
      stepId: "step-1", pluginTypeId: "plugin-1", sdkMessageId: "message-update", sdkMessageFilterId: "filter-account",
      primaryTable: "account", secondaryTable: null, stage: 40, mode: 0, rank: 1, filteringAttributes: [],
      impersonatingUserId: null, unsecureConfiguration: null, secureConfigExists: true,
      expectedVersions: { "plugin-1": 4, "step-1": 7 },
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
