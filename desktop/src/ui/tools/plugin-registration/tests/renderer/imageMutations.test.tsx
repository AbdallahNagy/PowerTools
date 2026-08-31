import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { ConnectionsProvider } from "../../../../shared/connections";
import { renderWithProviders } from "../../../../../../test/support/render";
import { httpServer } from "../../../../../../test/support/httpServer";
import PluginRegistration from "../../PluginRegistration";

const apiPostMock = vi.hoisted(() => vi.fn());
vi.mock("../../../../shared/api/client", async (original) => ({ ...await original<typeof import("../../../../shared/api/client")>(), apiPost: apiPostMock }));
const resize = window.ResizeObserver;
let catalogReads = 0;
beforeAll(() => { window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; });
afterAll(() => { if (resize) window.ResizeObserver = resize; else Reflect.deleteProperty(window, "ResizeObserver"); });
beforeEach(() => {
  apiPostMock.mockReset();
  catalogReads = 0;
  httpServer.use(http.get("http://localhost/api/plugin-registration/catalog", () => {
    catalogReads++;
    return HttpResponse.json(catalog);
  }));
  apiPostMock.mockResolvedValue({ draft: {}, before: null, after: { name: "PostImage", imageType: 1, alias: "PostImage", messagePropertyName: "Target", attributes: ["name"] }, plan: { token: "signed", blockers: [], warnings: [], changes: [{ field: "attributes", before: null, after: "name" }], confirmation: { message: "Confirm" } } });
});

it("opens from the step menu, limits image types, requires explicit columns, and shows a complete preview", async () => {
  renderWithProviders(<ConnectionsProvider><PluginRegistration /></ConnectionsProvider>, { bridgeOverrides: {
    listConnections: async () => [{ name: "Development", envUrl: "https://development.test", crmType: "online" }],
    getActiveConnectionName: async () => "Development",
    getConnection: async (name) => ({ name, envUrl: "https://development.test", crmType: "online", token: "token", expiresOn: "2099-01-01T00:00:00Z" }),
  } });
  fireEvent.click(await screen.findByRole("treeitem", { name: "Contoso" }));
  fireEvent.click(screen.getByRole("treeitem", { name: "(Plugin) Account Plugin" }));
  fireEvent.contextMenu(screen.getByRole("treeitem", { name: "(Step) Create account" }));
  await userEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Register image" }));
  const dialog = await screen.findByRole("dialog", { name: "Register image" });
  expect(within(dialog).queryByRole("option", { name: "Pre image" })).not.toBeInTheDocument();
  expect(within(dialog).getByRole("option", { name: "Post image" })).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Preview changes" })).toBeDisabled();
  await userEvent.type(within(dialog).getByLabelText("Image alias"), "PostImage");
  await userEvent.type(within(dialog).getByLabelText("Selected columns"), "name");
  await userEvent.click(within(dialog).getByRole("button", { name: "Preview changes" }));
  expect(await screen.findByRole("dialog", { name: "Image impact preview" })).toHaveTextContent("Attributes: New → name");
});

it("requires the exact image name before unregister execution", async () => {
  renderWithProviders(<ConnectionsProvider><PluginRegistration /></ConnectionsProvider>, { bridgeOverrides: {
    listConnections: async () => [{ name: "Development", envUrl: "https://development.test", crmType: "online" }],
    getActiveConnectionName: async () => "Development",
    getConnection: async (name) => ({ name, envUrl: "https://development.test", crmType: "online", token: "token", expiresOn: "2099-01-01T00:00:00Z" }),
  } });
  fireEvent.click(await screen.findByRole("treeitem", { name: "Contoso" }));
  fireEvent.click(screen.getByRole("treeitem", { name: "(Plugin) Account Plugin" }));
  fireEvent.click(screen.getByRole("treeitem", { name: "(Step) Create account" }));
  fireEvent.contextMenu(screen.getByRole("treeitem", { name: "(Image) PostImage" }));
  await userEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Unregister image" }));
  const dialog = await screen.findByRole("dialog", { name: "Unregister image" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Preview unregister" }));
  const preview = await screen.findByRole("dialog", { name: "Image impact preview" });
  expect(preview).toHaveTextContent("Development · PostImage");
  expect(preview).toHaveTextContent("Confirm");
  const button = within(preview).getByRole("button", { name: "Confirm" });
  expect(button).toBeDisabled();
  await userEvent.type(within(dialog).getByLabelText("Type PostImage to confirm"), "PostImage");
  expect(button).toBeEnabled();
});

it("initializes an existing image alias from its name when entityAlias is absent", async () => {
  renderWithProviders(<ConnectionsProvider><PluginRegistration /></ConnectionsProvider>, { bridgeOverrides: {
    listConnections: async () => [{ name: "Development", envUrl: "https://development.test", crmType: "online" }], getActiveConnectionName: async () => "Development",
    getConnection: async (name) => ({ name, envUrl: "https://development.test", crmType: "online", token: "token", expiresOn: "2099-01-01T00:00:00Z" }),
  } });
  fireEvent.click(await screen.findByRole("treeitem", { name: "Contoso" })); fireEvent.click(screen.getByRole("treeitem", { name: "(Plugin) Account Plugin" }));
  fireEvent.click(screen.getByRole("treeitem", { name: "(Step) Create account" })); fireEvent.doubleClick(screen.getByRole("treeitem", { name: "(Image) PostImage" }));
  expect(await screen.findByLabelText("Image alias")).toHaveValue("PostImage");
});

it("executes only after a verified result and refreshes the selected connection catalog", async () => {
  apiPostMock.mockResolvedValueOnce({ draft: {}, before: null, after: { name: "PostImage", imageType: 1, alias: "PostImage", messagePropertyName: "Target", attributes: ["name"] }, plan: { token: "signed", blockers: [], warnings: [], changes: [], confirmation: { message: "Confirm" } } })
    .mockResolvedValueOnce({ outcome: "succeededAndVerified", succeededAndVerified: true, image: { ...catalog.assemblies[0].handlers[0].steps[0].images[0], entityAlias: "PostImage" } });
  renderWithProviders(<ConnectionsProvider><PluginRegistration /></ConnectionsProvider>, { bridgeOverrides: {
    listConnections: async () => [{ name: "Development", envUrl: "https://development.test", crmType: "online" }], getActiveConnectionName: async () => "Development",
    getConnection: async (name) => ({ name, envUrl: "https://development.test", crmType: "online", token: "token", expiresOn: "2099-01-01T00:00:00Z" }),
  } });
  fireEvent.click(await screen.findByRole("treeitem", { name: "Contoso" })); fireEvent.click(screen.getByRole("treeitem", { name: "(Plugin) Account Plugin" }));
  fireEvent.click(screen.getByRole("treeitem", { name: "(Step) Create account" })); fireEvent.contextMenu(screen.getByRole("treeitem", { name: "(Image) PostImage" }));
  await userEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Update image" }));
  const dialog = await screen.findByRole("dialog", { name: "Update image" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Preview changes" }));
  await userEvent.click(await screen.findByRole("button", { name: "Confirm" }));

  await vi.waitFor(() => expect(apiPostMock).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(catalogReads).toBeGreaterThanOrEqual(2));
  expect(screen.queryByRole("dialog", { name: "Update image" })).not.toBeInTheDocument();
});

const catalog = { assemblies: [{ id: "assembly-1", name: "Contoso", version: "1", culture: null, publicKeyToken: "token", sourceType: 0, isolationMode: 2, isManaged: false, isCustomizable: true, versionNumber: 1, description: null, solutionDisplayName: null, handlers: [{ id: "plugin-1", kind: 0, typeName: "Contoso.Plugin", name: "Account Plugin", friendlyName: null, description: null, workflowActivityGroupName: null, isManaged: false, isCustomizable: true, versionNumber: 2, workflowArguments: [], dependencies: [], assemblyId: "assembly-1", solutionDisplayName: null, steps: [{ id: "step-1", pluginHandlerId: "plugin-1", name: "Create account", description: null, messageLabel: "Create", primaryTableLabel: "account", secondaryTableLabel: null, stageLabel: "PostOperation", modeLabel: "Synchronous", stage: 40, mode: 0, rank: 1, isEnabled: true, isManaged: false, isCustomizable: true, versionNumber: 3, secureConfigExists: false, images: [{ id: "image-1", pluginStepId: "step-1", name: "PostImage", description: null, imageTypeLabel: "Post Image", entityAlias: null, attributes: ["name"], isManaged: false, isCustomizable: true, versionNumber: 4, solutionDisplayName: null }], solutionDisplayName: null }] }] }] };
