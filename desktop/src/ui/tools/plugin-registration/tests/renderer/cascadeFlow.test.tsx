import { StrictMode } from "react";
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
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(screen.queryByRole("dialog", { name: "Unregister assembly" })).not.toBeInTheDocument();
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

it("reports a completed cascade from a StrictMode-mounted operation", async () => {
  apiPostMock.mockResolvedValueOnce(preflight([])).mockResolvedValueOnce({
    outcome: "succeededAndVerified",
    succeededAndVerified: true,
  });
  renderPage(true);
  const assembly = await screen.findByRole("treeitem", { name: "Contoso" });
  fireEvent.contextMenu(assembly);
  await userEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Unregister assembly" }));
  await userEvent.click(screen.getByRole("button", { name: "Preview unregister" }));
  const dialog = await screen.findByRole("dialog", { name: "Unregister assembly" });
  await userEvent.click(within(dialog).getByLabelText("Acknowledge assembly unregister"));
  await userEvent.type(within(dialog).getByLabelText("Type Contoso to confirm"), "Contoso");
  await userEvent.click(within(dialog).getByRole("button", { name: "Delete assembly, 1 handler, 0 steps, and 0 images" }));

  expect(await screen.findByRole("status")).toHaveTextContent("succeeded and was verified");
});

it("discards a cascade preview when the dialog target changes", async () => {
  apiPostMock.mockResolvedValueOnce(preflight([]));
  renderPage();

  const assembly = await screen.findByRole("treeitem", { name: "Contoso" });
  fireEvent.contextMenu(assembly);
  await userEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Unregister assembly" }));
  await userEvent.click(screen.getByRole("button", { name: "Preview unregister" }));
  await screen.findByRole("dialog", { name: "Unregister assembly" });
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

  await userEvent.click(assembly);
  const plugin = screen.getByRole("treeitem", { name: "(Plugin) Plugin" });
  fireEvent.contextMenu(plugin);
  await userEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Unregister plug-in" }));

  expect(screen.getByRole("button", { name: "Preview unregister" })).toBeInTheDocument();
  expect(apiPostMock).toHaveBeenCalledTimes(1);
});

it("ignores a pending cascade preview failure after the connection changes", async () => {
  let rejectPreflight!: (reason: unknown) => void;
  apiPostMock.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectPreflight = reject; }));
  renderPage();

  const assembly = await screen.findByRole("treeitem", { name: "Contoso" });
  fireEvent.contextMenu(assembly);
  await userEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Unregister assembly" }));
  await userEvent.click(screen.getByRole("button", { name: "Preview unregister" }));
  await vi.waitFor(() => expect(apiPostMock).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByLabelText("Connection"), { target: { value: "Production" } });
  rejectPreflight(new Error("Old environment failed"));
  await new Promise((resolve) => setTimeout(resolve, 20));
  await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();

  const productionAssembly = await screen.findByRole("treeitem", { name: "Contoso" });
  fireEvent.contextMenu(productionAssembly);
  await userEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Unregister assembly" }));
  expect(screen.getByRole("button", { name: "Preview unregister" })).toBeInTheDocument();
});

it("ignores a completed cascade execute after the connection changes", async () => {
  let resolveExecute!: (value: { outcome: string; succeededAndVerified: boolean }) => void;
  apiPostMock.mockResolvedValueOnce(preflight([])).mockImplementationOnce(() => new Promise((resolve) => { resolveExecute = resolve; }));
  renderPage();

  const assembly = await screen.findByRole("treeitem", { name: "Contoso" });
  fireEvent.contextMenu(assembly);
  await userEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Unregister assembly" }));
  await userEvent.click(screen.getByRole("button", { name: "Preview unregister" }));
  const dialog = await screen.findByRole("dialog", { name: "Unregister assembly" });
  await userEvent.click(within(dialog).getByLabelText("Acknowledge assembly unregister"));
  await userEvent.type(within(dialog).getByLabelText("Type Contoso to confirm"), "Contoso");
  await userEvent.click(within(dialog).getByRole("button", { name: "Delete assembly, 1 handler, 0 steps, and 0 images" }));
  await vi.waitFor(() => expect(apiPostMock).toHaveBeenCalledTimes(2));

  fireEvent.change(screen.getByLabelText("Connection"), { target: { value: "Production" } });
  resolveExecute({ outcome: "succeededAndVerified", succeededAndVerified: true });
  await new Promise((resolve) => setTimeout(resolve, 20));

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

function renderPage(strictMode = false) {
  const page = <ConnectionsProvider><PluginRegistration /></ConnectionsProvider>;
  return renderWithProviders(strictMode ? <StrictMode>{page}</StrictMode> : page, { bridgeOverrides: {
    listConnections: async () => [
      { name: "Development", envUrl: "https://development.test", crmType: "online" },
      { name: "Production", envUrl: "https://production.test", crmType: "online" },
    ],
    getActiveConnectionName: async () => "Development",
    getConnection: async name => ({ name, envUrl: `https://${name.toLowerCase()}.test`, crmType: "online", token: "token", expiresOn: "2099-01-01T00:00:00Z" })
  } });
}

function preflight(blockers: { code: string; message: string }[]) {
  return { draft: {}, plan: { token: "signed", blockers }, impact: {
    assembly: { name: "Contoso" }, handlers: [{ typeName: "Contoso.Plugin", kind: "plugin" }], steps: [], images: [], externalDependencies: [], enabledStepCount: 0
  } };
}

const catalog = { assemblies: [{ id: "assembly-1", name: "Contoso", version: "1", culture: null, publicKeyToken: "token", sourceType: 0, isolationMode: 2, isManaged: false, isCustomizable: true, versionNumber: 1, description: null, solutionDisplayName: null, handlers: [{ id: "plugin-1", kind: 0, typeName: "Contoso.Plugin", name: "Plugin", friendlyName: null, description: null, workflowActivityGroupName: null, isManaged: false, isCustomizable: true, versionNumber: 2, workflowArguments: [], dependencies: [], assemblyId: "assembly-1", solutionDisplayName: null, steps: [] }] }] };
