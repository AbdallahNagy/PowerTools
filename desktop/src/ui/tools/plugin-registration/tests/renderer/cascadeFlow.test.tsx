import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { ConnectionsProvider } from "../../../../shared/connections";
import { renderWithProviders } from "../../../../../../test/support/render";
import { httpServer } from "../../../../../../test/support/httpServer";
import PluginRegistration from "../../PluginRegistration";

const apiPostMock = vi.hoisted(() => vi.fn());
vi.mock("../../../../shared/api/client", async original => ({ ...await original<typeof import("../../../../shared/api/client")>(), apiPost: apiPostMock }));

const resize = window.ResizeObserver;
let deleted = false;
let catalogReads = 0;
beforeAll(() => { window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; });
afterAll(() => { if (resize) window.ResizeObserver = resize; else Reflect.deleteProperty(window, "ResizeObserver"); });
beforeEach(() => {
  deleted = false;
  catalogReads = 0;
  apiPostMock.mockReset();
  httpServer.use(http.get("http://localhost/api/plugin-registration/catalog", () => {
    catalogReads++;
    return HttpResponse.json(deleted ? { assemblies: [] } : catalog);
  }));
});

it("opens cascade unregister from the assembly menu and explains an unsupported transaction", async () => {
  apiPostMock.mockResolvedValueOnce(preflight([{ code: "transactional_cascade_unsupported", message: "Transactional cascade unregister is unavailable in this environment." }]));
  renderPage();
  const assembly = await screen.findByRole("treeitem", { name: "Contoso" });
  fireEvent.contextMenu(assembly);
  await userEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Unregister assembly" }));
  await userEvent.click(screen.getByRole("button", { name: "Preview unregister" }));

  const dialog = await screen.findByRole("dialog", { name: "Unregister assembly" });
  expect(within(dialog).getByRole("alert")).toHaveTextContent("unavailable in this environment");
  expect(within(dialog).getByRole("button", { name: "Delete assembly, 1 handler, 0 steps, and 0 images" })).toBeDisabled();
  expect(apiPostMock).toHaveBeenCalledTimes(1);
});

it("executes a verified cascade once and refreshes the catalog so its tree is removed", async () => {
  apiPostMock.mockResolvedValueOnce(preflight([])).mockImplementationOnce(async () => {
    deleted = true;
    return { outcome: "succeededAndVerified", succeededAndVerified: true };
  });
  renderPage();
  const assembly = await screen.findByRole("treeitem", { name: "Contoso" });
  fireEvent.contextMenu(assembly);
  await userEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Unregister assembly" }));
  await userEvent.click(screen.getByRole("button", { name: "Preview unregister" }));
  const dialog = await screen.findByRole("dialog", { name: "Unregister assembly" });
  expect(within(dialog).getByText("Assembly: Contoso")).toBeInTheDocument();
  await userEvent.click(within(dialog).getByLabelText("Acknowledge assembly unregister"));
  await userEvent.type(within(dialog).getByLabelText("Type Contoso to confirm"), "Contoso");
  await userEvent.click(within(dialog).getByRole("button", { name: "Delete assembly, 1 handler, 0 steps, and 0 images" }));

  await vi.waitFor(() => expect(apiPostMock).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(catalogReads).toBeGreaterThanOrEqual(2));
  expect(screen.queryByRole("treeitem", { name: "Contoso" })).not.toBeInTheDocument();
  expect(apiPostMock.mock.calls.map(call => call[0])).toEqual([
    "/api/plugin-registration/cascade-unregister/preflight",
    "/api/plugin-registration/cascade-unregister/execute"
  ]);
});

function renderPage() {
  return renderWithProviders(<ConnectionsProvider><PluginRegistration /></ConnectionsProvider>, { bridgeOverrides: {
    listConnections: async () => [{ name: "Development", envUrl: "https://development.test", crmType: "online" }],
    getActiveConnectionName: async () => "Development",
    getConnection: async name => ({ name, envUrl: "https://development.test", crmType: "online", token: "token", expiresOn: "2099-01-01T00:00:00Z" })
  } });
}

function preflight(blockers: { code: string; message: string }[]) {
  return { draft: {}, plan: { token: "signed", blockers }, impact: {
    assembly: { name: "Contoso" }, handlers: [{ typeName: "Contoso.Plugin", kind: "plugin" }], steps: [], images: [], externalDependencies: [], enabledStepCount: 0
  } };
}

const catalog = { assemblies: [{ id: "assembly-1", name: "Contoso", version: "1", culture: null, publicKeyToken: "token", sourceType: 0, isolationMode: 2, isManaged: false, isCustomizable: true, versionNumber: 1, description: null, solutionDisplayName: null, handlers: [{ id: "plugin-1", kind: 0, typeName: "Contoso.Plugin", name: "Plugin", friendlyName: null, description: null, workflowActivityGroupName: null, isManaged: false, isCustomizable: true, versionNumber: 2, workflowArguments: [], dependencies: [], assemblyId: "assembly-1", solutionDisplayName: null, steps: [] }] }] };
