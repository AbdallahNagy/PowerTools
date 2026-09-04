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

const resizeObserver = window.ResizeObserver;
beforeAll(() => { window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; });
afterAll(() => { if (resizeObserver) window.ResizeObserver = resizeObserver; else Reflect.deleteProperty(window, "ResizeObserver"); });

beforeEach(() => {
  httpServer.use(
    http.get("http://localhost/api/plugin-registration/catalog", () => HttpResponse.json(catalog)),
    http.get("http://localhost/api/plugin-registration/workflow-activities/workflow-1/details", () => HttpResponse.json(workflowDetails)),
  );
  apiPostMock.mockReset();
  apiPostMock.mockResolvedValue({ draft: {}, before: catalog.assemblies[0].handlers[0], after: { ...catalog.assemblies[0].handlers[0], name: "Updated activity" }, plan: { token: "signed", blockers: [], warnings: [], changes: [{ field: "name", before: "Validate Account", after: "Updated activity" }], confirmation: { message: "Confirm workflow activity registration metadata" } } });
});

it("shows workflow contract and dependent processes read-only, then updates only registration metadata", async () => {
  renderWithProviders(<ConnectionsProvider><PluginRegistration /></ConnectionsProvider>, { bridgeOverrides: {
    listConnections: async () => [{ name: "Development", envUrl: "https://development.test", crmType: "online" }],
    getActiveConnectionName: async () => "Development",
    getConnection: async name => ({ name, envUrl: "https://development.test", crmType: "online", token: "token", expiresOn: "2099-01-01" }),
  } });
  fireEvent.click(await screen.findByRole("treeitem", { name: "Contoso" }));
  const activity = screen.getByRole("treeitem", { name: "(Workflow Activity) Validate Account" });
  fireEvent.click(activity);
  const details = screen.getByRole("region", { name: "Registration details" });
  expect(await within(details).findByText("Properties")).toBeInTheDocument();
  expect(details).toHaveTextContent("Argument Contract");
  expect(details).toHaveTextContent("Input · Account · EntityReference · Required");
  expect(details).toHaveTextContent("Dependent Workflows/Actions");
  expect(details).toHaveTextContent("Account approval · Workflow · Active");
  expect(within(details).queryByRole("button")).not.toBeInTheDocument();

  fireEvent.contextMenu(activity);
  await userEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Update workflow activity" }));
  const dialog = await screen.findByRole("dialog", { name: "Update workflow activity" });
  expect(within(dialog).getByLabelText("Name")).toHaveValue("Validate Account");
  expect(within(dialog).queryByLabelText(/workflow definition/i)).not.toBeInTheDocument();
  await userEvent.clear(within(dialog).getByLabelText("Name"));
  await userEvent.type(within(dialog).getByLabelText("Name"), "Updated activity");
  await userEvent.click(within(dialog).getByRole("button", { name: "Preview changes" }));
  const preview = await screen.findByRole("dialog", { name: "Workflow activity impact preview" });
  expect(preview).toHaveTextContent("Development · Contoso.Workflow.ValidateAccount");
  await userEvent.click(within(preview).getByRole("button", { name: "Confirm" }));
  expect(apiPostMock).toHaveBeenCalledWith("/api/plugin-registration/workflow-activities/workflow-1/update/preflight", expect.objectContaining({ name: "Updated activity" }), expect.anything());
  expect(apiPostMock).toHaveBeenCalledWith("/api/plugin-registration/workflow-activities/workflow-1/update/execute", expect.anything(), expect.anything());
});

const workflowDetails = { id: "workflow-1", kind: 1, typeName: "Contoso.Workflow.ValidateAccount", name: "Validate Account", friendlyName: "Validate", description: "Validates accounts", workflowActivityGroupName: "Account", isManaged: false, isCustomizable: true, versionNumber: 3, steps: [], workflowArguments: [{ name: "account", displayName: "Account", typeName: "EntityReference", direction: 0, isRequired: true, position: 0 }], dependencies: [{ componentId: "process-1", name: "Account approval", componentTypeLabel: "Workflow", solutionDisplayName: null, isManaged: false, isCustomizable: true, versionNumber: 2, stateLabel: "Active" }], assemblyId: "assembly-1", solutionDisplayName: null };
const catalog = { assemblies: [{ id: "assembly-1", name: "Contoso", version: "1", culture: null, publicKeyToken: null, sourceType: 0, isolationMode: 2, isManaged: false, isCustomizable: true, versionNumber: 1, description: null, solutionDisplayName: null, handlers: [{ ...workflowDetails, workflowArguments: [], dependencies: [] }] }] };
