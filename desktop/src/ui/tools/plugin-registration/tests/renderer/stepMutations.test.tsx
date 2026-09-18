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
  it("loads the step form once, searches messages and entities, and posts secure configuration", async () => {
    renderPage();
    await openPlugin();
    fireEvent.contextMenu(screen.getByRole("treeitem", { name: "(Plugin) Account Plugin" }));
    await userEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Register New Step" }));

    const dialog = await screen.findByRole("dialog", { name: "Register step" });
    expect(await within(dialog).findByLabelText("Message")).toHaveTextContent("Update");
    await waitFor(() => expect(within(dialog).getByLabelText("Entity")).toHaveTextContent(/^Account$/));
    expect(within(dialog).getByLabelText("Entity")).not.toHaveTextContent(/none/i);
    expect(within(dialog).getByLabelText("Secure configuration")).toHaveValue("");
    expect(dialog).toHaveTextContent("Update steps should select filtering attributes");

    await userEvent.click(within(dialog).getByLabelText("Filtering attributes"));
    const attributesDialog = await screen.findByRole("dialog", { name: "Select filtering attributes" });
    await userEvent.click(await within(attributesDialog).findByText("Account Name"));
    expect(within(attributesDialog).getByRole("checkbox", { name: "name" })).toBeChecked();
    await userEvent.click(within(attributesDialog).getByText("Account"));
    expect(within(attributesDialog).getByRole("checkbox", { name: "accountid" })).not.toBeChecked();
    expect(attributesDialog).toHaveTextContent("record ID never changes");
    expect(dialog).not.toHaveTextContent("record ID never changes");
    await userEvent.click(within(attributesDialog).getByRole("button", { name: "Done" }));
    await userEvent.type(within(dialog).getByLabelText("Secure configuration"), "new-secret");
    await userEvent.click(within(dialog).getByRole("button", { name: "Register" }));
    expect(apiPostMock).toHaveBeenCalledWith("/api/plugin-registration/steps/create/preflight",
      expect.objectContaining({ replacementSecureConfiguration: "new-secret" }), expect.anything());
  });

  it("keeps same-table entities separately selectable by their Dataverse identities", async () => {
    httpServer.use(http.get("http://localhost/api/plugin-registration/step-options", () => HttpResponse.json({
      messages: [{ id: "message-update", name: "Update" }],
      filters: [
        { id: "filter-account-primary", messageId: "message-update", primaryTable: "account", secondaryTable: "none", primaryIdAttribute: "accountid" },
        { id: "filter-account-related", messageId: "message-update", primaryTable: "account", secondaryTable: "contact", primaryIdAttribute: "accountid" },
      ],
      enabledUsers: [],
    })));
    renderPage();
    await openPlugin();
    fireEvent.contextMenu(screen.getByRole("treeitem", { name: "(Plugin) Account Plugin" }));
    await userEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Register New Step" }));

    const dialog = await screen.findByRole("dialog", { name: "Register step" });
    await waitFor(() => expect(within(dialog).getByLabelText("Entity")).toHaveTextContent(/^Account$/));
    expect(within(dialog).getByLabelText("Entity")).not.toHaveTextContent(/none/i);
    await userEvent.click(within(dialog).getByLabelText("Entity"));
    const entityDialog = await screen.findByRole("dialog", { name: "Select entity" });
    expect(within(entityDialog).getByText("Name")).toBeInTheDocument();
    expect(within(entityDialog).getByText("Logical name")).toBeInTheDocument();
    expect(await within(entityDialog).findByRole("option", { name: /^Account account$/i })).toBeInTheDocument();
    expect(await within(entityDialog).findByRole("option", { name: /account · contact/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /none/i })).not.toBeInTheDocument();
    await userEvent.click(within(entityDialog).getByRole("option", { name: /account · contact/i }));
    expect(screen.queryByRole("dialog", { name: "Select entity" })).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Register" }));

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

  it("initializes update from safe fresh details, shows retrieved secure configuration, and saves without a preview dialog", async () => {
    let catalogReads = 0;
    httpServer.use(
      http.get("http://localhost/api/plugin-registration/catalog", () => { catalogReads++; return HttpResponse.json(catalog); }),
      http.get("http://localhost/api/plugin-registration/steps/step-1/edit-details", () => HttpResponse.json({
        stepId: "step-1", pluginTypeId: "plugin-1", sdkMessageId: "message-update", sdkMessageFilterId: "filter-account",
        primaryTable: "account", secondaryTable: null, stage: 40, mode: 0, rank: 3,
        filteringAttributes: ["name"], impersonatingUserId: "user-1", unsecureConfiguration: "public-config",
        secureConfiguration: "stored-secret", description: "Account update",
        secureConfigExists: true, expectedVersions: { "plugin-1": 4, "step-1": 7 },
      })),
    );
    apiPostMock.mockImplementation((url: string) => url.includes("/preflight") ? Promise.resolve({
      draft: {}, before: { message: "Update", primaryTable: "account", stage: 40, mode: 0, rank: 3, filteringAttributes: ["name"], impersonatingUserId: "user-1", unsecureConfiguration: "public-config", secureConfigExists: true, isEnabled: true },
      after: { message: "Update", primaryTable: "account", stage: 40, mode: 0, rank: 3, filteringAttributes: ["name"], impersonatingUserId: "user-1", unsecureConfiguration: "public-config", secureConfigExists: true, isEnabled: true },
      plan: { token: "signed", blockers: [], warnings: [], changes: [], confirmation: { message: "Confirm" } },
    }) : Promise.resolve({ outcome: "succeededAndVerified", succeededAndVerified: true, step: catalog.assemblies[0].handlers[0].steps[0] }));
    renderPage();
    await openStep();
    fireEvent.doubleClick(screen.getByRole("treeitem", { name: "(Step) Update account" }));
    const dialog = await screen.findByRole("dialog", { name: "Update step" });
    expect(await within(dialog).findByLabelText("Filtering attributes")).toHaveTextContent("1 selected");
    expect(within(dialog).getByLabelText("Run in user's context")).toHaveTextContent("Service User");
    expect(within(dialog).getByLabelText("Unsecure configuration")).toHaveValue("public-config");
    expect(within(dialog).getByLabelText("Secure configuration")).toHaveValue("stored-secret");
    expect(within(dialog).getByLabelText("Description")).toHaveValue("Account update");
    await userEvent.click(within(dialog).getByRole("button", { name: "Update" }));
    expect(screen.queryByRole("dialog", { name: "Step impact preview" })).not.toBeInTheDocument();
    await waitFor(() => expect(catalogReads).toBeGreaterThanOrEqual(2));
  });

  it("shows one loading state until step details finish, then a sanitized load failure", async () => {
    let rejectDetails!: (reason: unknown) => void;
    httpServer.use(http.get("http://localhost/api/plugin-registration/steps/step-1/edit-details", () =>
      new Promise((_resolve, reject) => { rejectDetails = reject; })));
    renderPage();
    await openStep();
    fireEvent.doubleClick(screen.getByRole("treeitem", { name: "(Step) Update account" }));
    const dialog = await screen.findByRole("dialog", { name: "Update step" });
    expect(within(dialog).getByText("Loading step details…")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Message")).not.toBeInTheDocument();
    rejectDetails(new Error("stored-secret backend detail"));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Unable to load step details");
    expect(dialog).not.toHaveTextContent("stored-secret backend detail");
  });

  it("retries a failed step form load without reopening the dialog", async () => {
    let choiceReads = 0;
    httpServer.use(http.get("http://localhost/api/plugin-registration/step-options", () => {
      choiceReads++;
      return choiceReads === 1
        ? HttpResponse.json({ detail: "secret choice failure" }, { status: 500 })
        : HttpResponse.json({
          messages: [{ id: "message-update", name: "Update" }],
          filters: [{ id: "filter-account", messageId: "message-update", primaryTable: "account", secondaryTable: null, primaryIdAttribute: "accountid", availableAttributes: ["accountid", "name"] }],
          enabledUsers: [],
        });
    }));
    renderPage();
    await openStep();
    fireEvent.doubleClick(screen.getByRole("treeitem", { name: "(Step) Update account" }));

    const dialog = await screen.findByRole("dialog", { name: "Update step" });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Unable to load step details");
    expect(dialog).not.toHaveTextContent("secret choice failure");
    await userEvent.click(within(dialog).getByRole("button", { name: "Retry" }));

    expect(await within(dialog).findByLabelText("Message")).toHaveTextContent("Update");
    expect(choiceReads).toBe(2);
  });

  it("discards a late step-details response after the update dialog closes", async () => {
    let releaseDetails!: () => void;
    httpServer.use(http.get("http://localhost/api/plugin-registration/steps/step-1/edit-details", async () => {
      await new Promise<void>((resolve) => { releaseDetails = resolve; });
      return HttpResponse.json({
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
    expect(within(dialog).getByText("Loading step details…")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    releaseDetails();

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
    expect(within(dialog).getByLabelText("Message")).toHaveTextContent("Update");
    expect(within(dialog).getByLabelText("Message")).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Update" })).toBeDisabled();
  });

  it("loads selected-entity metadata once and keeps a missing current entity selectable as unavailable", async () => {
    let metadataReads = 0;
    httpServer.use(
      http.get("http://localhost/api/plugin-registration/step-options", () => HttpResponse.json({
        messages: [{ id: "message-update", name: "Update" }],
        filters: [
          { id: "filter-account-related", messageId: "message-update", primaryTable: "account", secondaryTable: "contact", primaryIdAttribute: "accountid" },
        ],
        enabledUsers: [],
      })),
      http.get("http://localhost/api/plugin-registration/steps/step-1/edit-details", () => HttpResponse.json({
        stepId: "step-1", pluginTypeId: "plugin-1", sdkMessageId: "message-update", sdkMessageFilterId: "filter-retired",
        primaryTable: "account", secondaryTable: "lead", stage: 40, mode: 0, rank: 1, filteringAttributes: ["name"],
        impersonatingUserId: "user-retired", unsecureConfiguration: null, secureConfigExists: true,
        expectedVersions: { "plugin-1": 4, "step-1": 7 },
      })),
      http.get("http://localhost/api/plugin-registration/step-filters/:filterId/metadata", ({ params }) => {
        metadataReads += 1;
        return HttpResponse.json({ filterId: params.filterId, primaryIdAttribute: "accountid", availableAttributes: ["accountid", "name"] });
      }),
    );
    renderPage();
    await openStep();
    fireEvent.doubleClick(screen.getByRole("treeitem", { name: "(Step) Update account" }));
    const dialog = await screen.findByRole("dialog", { name: "Update step" });
    const entity = await within(dialog).findByLabelText("Entity");
    expect(entity).toHaveTextContent("unavailable");
    expect(within(dialog).getByLabelText("Run in user's context")).toHaveTextContent("unavailable");
    expect(within(dialog).getByLabelText("Filtering attributes")).toHaveTextContent("1 selected");
    await waitFor(() => expect(metadataReads).toBeGreaterThanOrEqual(1));
    const readsAfterLoad = metadataReads;
    await userEvent.click(entity);
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Select entity" }))
      .getByRole("option", { name: /account · contact/i }));
    expect(within(dialog).getByLabelText("Filtering attributes")).toHaveTextContent("None selected");
    await waitFor(() => expect(metadataReads).toBeGreaterThan(readsAfterLoad));
  });

  it("warns before saving when every filtering attribute is selected", async () => {
    httpServer.use(http.get("http://localhost/api/plugin-registration/step-filters/:filterId/metadata", () =>
      HttpResponse.json({ filterId: "filter-account", primaryIdAttribute: "accountid", availableAttributes: ["accountid", "name", "telephone1"] })));
    renderPage();
    await openStep();
    fireEvent.doubleClick(screen.getByRole("treeitem", { name: "(Step) Update account" }));
    const dialog = await screen.findByRole("dialog", { name: "Update step" });
    await userEvent.click(await within(dialog).findByLabelText("Filtering attributes"));
    const attributesDialog = await screen.findByRole("dialog", { name: "Select filtering attributes" });
    await userEvent.click(await within(attributesDialog).findByRole("checkbox", { name: "name" }));
    await userEvent.click(within(attributesDialog).getByRole("checkbox", { name: "telephone1" }));
    await userEvent.click(within(attributesDialog).getByRole("button", { name: "Done" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Update" }));
    expect(await screen.findByRole("dialog", { name: "All attributes selected" })).toHaveTextContent("highly discouraged");
    await userEvent.click(screen.getByRole("button", { name: "Change selection" }));
    expect(screen.queryByRole("dialog", { name: "All attributes selected" })).not.toBeInTheDocument();
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it("clears stored secure configuration when the field is emptied", async () => {
    httpServer.use(http.get("http://localhost/api/plugin-registration/steps/step-1/edit-details", () => HttpResponse.json({
      stepId: "step-1", pluginTypeId: "plugin-1", sdkMessageId: "message-update", sdkMessageFilterId: "filter-account",
      primaryTable: "account", secondaryTable: null, stage: 40, mode: 0, rank: 1, filteringAttributes: ["name"],
      impersonatingUserId: null, unsecureConfiguration: null, secureConfiguration: "stored-secret",
      secureConfigExists: true, expectedVersions: { "plugin-1": 4, "step-1": 7 },
    })));
    renderPage();
    await openStep();
    fireEvent.doubleClick(screen.getByRole("treeitem", { name: "(Step) Update account" }));
    const dialog = await screen.findByRole("dialog", { name: "Update step" });
    const secure = await within(dialog).findByLabelText("Secure configuration");
    expect(secure).toHaveValue("stored-secret");
    await userEvent.clear(secure);
    await userEvent.click(within(dialog).getByRole("button", { name: "Update" }));
    expect(apiPostMock).toHaveBeenCalledWith("/api/plugin-registration/steps/step-1/update/preflight",
      expect.objectContaining({ secureConfigurationAction: "clear", replacementSecureConfiguration: null }), expect.anything());
  });

  it("closes other step selections on open, click-away, and single-select", async () => {
    renderPage();
    await openPlugin();
    fireEvent.contextMenu(screen.getByRole("treeitem", { name: "(Plugin) Account Plugin" }));
    await userEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Register New Step" }));
    const dialog = await screen.findByRole("dialog", { name: "Register step" });
    await userEvent.click(await within(dialog).findByLabelText("Message"));
    expect(screen.getByRole("listbox", { name: "Message" })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByLabelText("Run in user's context"));
    expect(screen.queryByRole("listbox", { name: "Message" })).not.toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "Run in user's context" })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByLabelText("Description"));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByLabelText("Message"));
    await userEvent.click(within(dialog).getByLabelText("Entity"));
    expect(screen.queryByRole("listbox", { name: "Message" })).not.toBeInTheDocument();
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Select entity" })).getByRole("button", { name: "Cancel" }));
    await userEvent.click(within(dialog).getByLabelText("Run in user's context"));
    await userEvent.click(screen.getByRole("option", { name: "Service User" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Run in user's context")).toHaveTextContent("Service User");
  });

  it("shows a loader while entity display names are fetching", async () => {
    let releaseEntities!: () => void;
    httpServer.use(http.get("http://localhost/api/metadata/entities", async () => {
      await new Promise<void>((resolve) => { releaseEntities = resolve; });
      return HttpResponse.json([
        { logicalName: "account", displayName: "Account", primaryIdAttribute: "accountid", primaryNameAttribute: "name", isCustom: false },
      ]);
    }));
    renderPage();
    await openPlugin();
    fireEvent.contextMenu(screen.getByRole("treeitem", { name: "(Plugin) Account Plugin" }));
    await userEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Register New Step" }));
    const dialog = await screen.findByRole("dialog", { name: "Register step" });
    await within(dialog).findByLabelText("Message");
    await userEvent.click(within(dialog).getByLabelText("Entity"));
    const entityDialog = await screen.findByRole("dialog", { name: "Select entity" });
    expect(within(entityDialog).getByText("Loading entity names…")).toBeInTheDocument();
    expect(await within(entityDialog).findByRole("option", { name: /account account/i })).toBeInTheDocument();
    releaseEntities();
    expect(await within(entityDialog).findByRole("option", { name: /Account account/i })).toBeInTheDocument();
  });

  it("defaults a new step to Update and lists every entity for that message", async () => {
    httpServer.use(http.get("http://localhost/api/plugin-registration/step-options", () => HttpResponse.json({
      messages: [
        { id: "message-additem", name: "AddItem" },
        { id: "message-update", name: "Update" },
      ],
      filters: [
        { id: "filter-quotedetail", messageId: "message-additem", primaryTable: "quotedetail", secondaryTable: "none", primaryIdAttribute: "quotedetailid" },
        { id: "filter-account", messageId: "message-update", primaryTable: "account", secondaryTable: "none", primaryIdAttribute: "accountid" },
        { id: "filter-contact", messageId: "message-update", primaryTable: "contact", secondaryTable: null, primaryIdAttribute: "contactid" },
        { id: "filter-none", messageId: "message-update", primaryTable: "none", secondaryTable: "none", primaryIdAttribute: "noneid" },
      ],
      enabledUsers: [],
    })));
    renderPage();
    await openPlugin();
    fireEvent.contextMenu(screen.getByRole("treeitem", { name: "(Plugin) Account Plugin" }));
    await userEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Register New Step" }));
    const dialog = await screen.findByRole("dialog", { name: "Register step" });
    expect(await within(dialog).findByLabelText("Message")).toHaveTextContent("Update");
    await userEvent.click(within(dialog).getByLabelText("Entity"));
    const entityDialog = await screen.findByRole("dialog", { name: "Select entity" });
    expect(await within(entityDialog).findByRole("option", { name: /^Account account$/i })).toBeInTheDocument();
    expect(within(entityDialog).getByRole("option", { name: /^Contact contact$/i })).toBeInTheDocument();
    expect(within(entityDialog).queryByRole("option", { name: /^None none$/i })).not.toBeInTheDocument();
    expect(within(entityDialog).queryByRole("option", { name: /quotedetail/i })).not.toBeInTheDocument();
    expect(within(entityDialog).getAllByRole("option")).toHaveLength(2);
  });

  it("keeps filled step form data when the modal overlay is clicked", async () => {
    renderPage();
    await openPlugin();
    fireEvent.contextMenu(screen.getByRole("treeitem", { name: "(Plugin) Account Plugin" }));
    await userEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Register New Step" }));
    const dialog = await screen.findByRole("dialog", { name: "Register step" });
    const description = await within(dialog).findByLabelText("Description");
    await userEvent.type(description, "keep this");
    fireEvent.mouseDown(screen.getByTestId("modal-backdrop"));
    expect(screen.getByRole("dialog", { name: "Register step" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Description")).toHaveValue("keep this");
    await userEvent.click(within(dialog).getByLabelText("Entity"));
    expect(await screen.findByRole("dialog", { name: "Select entity" })).toBeInTheDocument();
    const backdrops = screen.getAllByTestId("modal-backdrop");
    fireEvent.mouseDown(backdrops[backdrops.length - 1]!);
    expect(screen.getByRole("dialog", { name: "Select entity" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Register step" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Description")).toHaveValue("keep this");
  });

  it("opens entity and attribute picker modals with names, types, and select-all", async () => {
    httpServer.use(http.get("http://localhost/api/plugin-registration/step-filters/:filterId/metadata", () =>
      HttpResponse.json({
        filterId: "filter-account",
        primaryIdAttribute: "accountid",
        availableAttributes: ["accountid", "name", "telephone1"],
        displayName: "Account",
        logicalName: "account",
        attributes: [
          { logicalName: "accountid", displayName: "Account", attributeType: "Uniqueidentifier", isPrimaryId: true },
          { logicalName: "name", displayName: "Account Name", attributeType: "String", isPrimaryId: false },
          { logicalName: "telephone1", displayName: "Main Phone", attributeType: "String", isPrimaryId: false },
        ],
      })));
    renderPage();
    await openPlugin();
    fireEvent.contextMenu(screen.getByRole("treeitem", { name: "(Plugin) Account Plugin" }));
    await userEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Register New Step" }));
    const dialog = await screen.findByRole("dialog", { name: "Register step" });
    expect(await within(dialog).findByLabelText("Execution order")).toHaveValue(1);
    expect(within(dialog).queryByLabelText("Rank")).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByLabelText("Entity"));
    const entityDialog = await screen.findByRole("dialog", { name: "Select entity" });
    expect(await within(entityDialog).findByRole("option", { name: /Account account/i })).toBeInTheDocument();
    expect(within(entityDialog).getByText("Account")).toBeInTheDocument();
    expect(within(entityDialog).getByText("account")).toBeInTheDocument();
    await userEvent.click(within(entityDialog).getByRole("button", { name: "Cancel" }));

    await userEvent.click(within(dialog).getByLabelText("Filtering attributes"));
    const attributesDialog = await screen.findByRole("dialog", { name: "Select filtering attributes" });
    expect(within(attributesDialog).getByText("Account Name")).toBeInTheDocument();
    expect(within(attributesDialog).getByText("Main Phone")).toBeInTheDocument();
    expect(within(attributesDialog).getAllByText("String").length).toBeGreaterThan(0);
    await userEvent.click(within(attributesDialog).getByText("Main Phone"));
    expect(within(attributesDialog).getByRole("checkbox", { name: "telephone1" })).toBeChecked();
    await userEvent.click(within(attributesDialog).getByText("telephone1"));
    expect(within(attributesDialog).getByRole("checkbox", { name: "telephone1" })).not.toBeChecked();
    await userEvent.click(within(attributesDialog).getByRole("button", { name: "Select all" }));
    expect(within(attributesDialog).getByRole("checkbox", { name: "name" })).toBeChecked();
    expect(within(attributesDialog).getByRole("checkbox", { name: "telephone1" })).toBeChecked();
    expect(within(attributesDialog).getByRole("checkbox", { name: "accountid" })).not.toBeChecked();
    expect(attributesDialog).toHaveTextContent("record ID never changes");
    await userEvent.click(within(attributesDialog).getByRole("button", { name: "Select none" }));
    expect(within(attributesDialog).getByRole("checkbox", { name: "name" })).not.toBeChecked();
    await userEvent.click(within(attributesDialog).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog", { name: "Select filtering attributes" })).not.toBeInTheDocument();
  });

  it("explains an existing Update primary-key filter and lets the user clear it from the row", async () => {
    httpServer.use(http.get("http://localhost/api/plugin-registration/steps/:stepId/edit-details", () => HttpResponse.json({
      stepId: "step-1", pluginTypeId: "plugin-1", sdkMessageId: "message-update", sdkMessageFilterId: "filter-account",
      primaryTable: "account", secondaryTable: null, stage: 40, mode: 0, rank: 1, filteringAttributes: ["accountid"],
      impersonatingUserId: null, unsecureConfiguration: null, secureConfigExists: false,
      expectedVersions: { "plugin-1": 4, "step-1": 7 },
    })));
    renderPage();
    await openStep();
    fireEvent.doubleClick(screen.getByRole("treeitem", { name: "(Step) Update account" }));
    const dialog = await screen.findByRole("dialog", { name: "Update step" });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("record ID never changes");
    expect(within(dialog).getByRole("button", { name: "Update" })).toBeDisabled();
    await userEvent.click(within(dialog).getByLabelText("Filtering attributes"));
    const attributesDialog = await screen.findByRole("dialog", { name: "Select filtering attributes" });
    expect(within(attributesDialog).getByRole("checkbox", { name: "accountid" })).toBeChecked();
    await userEvent.click(within(attributesDialog).getByText("Account"));
    expect(within(attributesDialog).getByRole("checkbox", { name: "accountid" })).not.toBeChecked();
    await userEvent.click(within(attributesDialog).getByRole("button", { name: "Done" }));
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("discards a pending step dialog after the connection changes", async () => {
    renderPage();
    await openStep();
    fireEvent.doubleClick(screen.getByRole("treeitem", { name: "(Step) Update account" }));
    expect(await screen.findByRole("dialog", { name: "Update step" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Connection"), { target: { value: "Production" } });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Update step" })).not.toBeInTheDocument());
  });
});

function useResponses() {
  httpServer.use(
    http.get("http://localhost/api/plugin-registration/catalog", () => HttpResponse.json(catalog)),
    http.get("http://localhost/api/plugin-registration/step-options", () => HttpResponse.json({
      messages: [{ id: "message-update", name: "Update" }],
      filters: [{ id: "filter-account", messageId: "message-update", primaryTable: "account", secondaryTable: null, primaryIdAttribute: "accountid", availableAttributes: ["accountid", "name"] }],
      enabledUsers: [{ id: "user-1", name: "Service User" }],
    })),
    http.get("http://localhost/api/plugin-registration/steps/:stepId/edit-details", () => HttpResponse.json({
      stepId: "step-1", pluginTypeId: "plugin-1", sdkMessageId: "message-update", sdkMessageFilterId: "filter-account",
      primaryTable: "account", secondaryTable: null, stage: 40, mode: 0, rank: 1, filteringAttributes: [],
      impersonatingUserId: null, unsecureConfiguration: null, secureConfigExists: true,
      expectedVersions: { "plugin-1": 4, "step-1": 7 },
    })),
  );
  apiPostMock.mockImplementation((url: string) => String(url).includes("/preflight")
    ? Promise.resolve({
      draft: {}, plan: { token: "signed", blockers: [], warnings: [{ code: "filter", message: "Update steps should select filtering attributes" }], confirmation: { level: "explicit", message: "Confirm" } },
      after: { message: "Update", primaryTable: "account", stage: 40, mode: 0, rank: 1, filteringAttributes: [], secureConfigExists: true },
    })
    : Promise.resolve({ outcome: "succeededAndVerified", succeededAndVerified: true, step: catalog.assemblies[0].handlers[0].steps[0] }));
}

function renderPage() {
  return renderWithProviders(<ConnectionsProvider><PluginRegistration /></ConnectionsProvider>, { bridgeOverrides: {
    listConnections: async () => [
      { name: "Development", envUrl: "https://development.test", crmType: "online" },
      { name: "Production", envUrl: "https://production.test", crmType: "online" },
    ],
    getActiveConnectionName: async () => "Development",
    getConnection: async (name) => ({ name, envUrl: `https://${name.toLowerCase()}.test`, crmType: "online", token: "token", expiresOn: "2099-01-01T00:00:00Z" }),
  } });
}
async function openPlugin() {
  const assembly = await screen.findByRole("treeitem", { name: "Contoso" });
  fireEvent.click(assembly);
  fireEvent.click(screen.getByRole("treeitem", { name: "(Plugin) Account Plugin" }));
}
async function openStep() { await openPlugin(); fireEvent.click(screen.getByRole("treeitem", { name: "(Step) Update account" })); }

const catalog = { assemblies: [{ id: "assembly-1", name: "Contoso", version: "1.0.0.0", culture: "neutral", publicKeyToken: "token", sourceType: 0, isolationMode: 2, isManaged: false, isCustomizable: true, versionNumber: 1, description: null, solutionDisplayName: null, handlers: [{ id: "plugin-1", kind: 0, typeName: "Contoso.AccountPlugin", name: "Account Plugin", friendlyName: null, description: null, workflowActivityGroupName: null, isManaged: false, isCustomizable: true, versionNumber: 4, workflowArguments: [], dependencies: [], assemblyId: "assembly-1", solutionDisplayName: null, steps: [{ id: "step-1", pluginHandlerId: "plugin-1", name: "Update account", description: null, messageLabel: "Update", primaryTableLabel: "account", secondaryTableLabel: null, stageLabel: "PostOperation", modeLabel: "Synchronous", stage: 40, mode: 0, rank: 1, isEnabled: true, isManaged: false, isCustomizable: true, versionNumber: 7, secureConfigExists: true, images: [], solutionDisplayName: null }] }] }] };
