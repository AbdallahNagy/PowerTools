import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { ConnectionsProvider } from "../../../../shared/connections";
import { renderWithProviders } from "../../../../../../test/support/render";
import PluginRegistration from "../../PluginRegistration";
import { httpServer } from "../../../../../../test/support/httpServer";

const apiPostMock = vi.hoisted(() => vi.fn());

vi.mock("../../../../shared/api/client", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../../shared/api/client")>(),
  apiPost: apiPostMock,
}));

const originalResizeObserver = window.ResizeObserver;

beforeAll(() => {
  class TestResizeObserver implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = TestResizeObserver;
});

afterAll(() => {
  if (originalResizeObserver) window.ResizeObserver = originalResizeObserver;
  else Reflect.deleteProperty(window, "ResizeObserver");
});

beforeEach(() => {
  apiPostMock.mockReset();
});

describe("Assembly mutations", () => {
  it("starts registration with a DLL file selection", async () => {
    renderWithProviders(
      <ConnectionsProvider>
        <PluginRegistration />
      </ConnectionsProvider>,
      {
        bridgeOverrides: {
          listConnections: async () => [
            {
              name: "Development",
              envUrl: "https://development.example.test",
              crmType: "online",
            },
          ],
          getActiveConnectionName: async () => "Development",
          getConnection: async (name) => ({
            name,
            envUrl: "https://development.example.test",
            crmType: "online",
            token: "development-token",
            expiresOn: "2099-01-01T00:00:00.000Z",
          }),
        },
      },
    );

    const register = screen.getByRole("button", { name: "Register assembly" });
    await waitFor(() => expect(register).toBeEnabled());
    fireEvent.click(register);

    expect(await screen.findByLabelText("Assembly DLL")).toHaveAttribute("type", "file");
  });

  it("blocks confirmation when preflight reinspection reports a different SHA-256", async () => {
    const inspection = {
      fileName: "Contoso.dll", size: 3, sha256: "analysis-hash",
      identity: { name: "Contoso", version: "1.0.0.0", culture: "neutral", publicKeyToken: "token" },
      plugins: [], workflowActivities: [],
    };
    httpServer.use(
      http.get("http://localhost/api/plugin-registration/catalog", () =>
        HttpResponse.json({ assemblies: [] }),
      ),
    );
    apiPostMock.mockImplementation((url: string) => {
      if (url.endsWith("/analyze")) return Promise.resolve(inspection);
      if (url.endsWith("/register/preflight")) return Promise.resolve({
        draft: { fileName: "Contoso.dll", operation: "register", assemblyId: null, requestedIsolationMode: 2, requestedSourceType: 0, expectedAssemblyVersionNumber: null, expectedHandlerVersionNumbers: {}, inspection: { ...inspection, sha256: "preflight-hash" } },
        plan: { token: "token", blockers: [], warnings: [], confirmation: { level: "explicit", message: "Confirm", requiresAcknowledgement: false } },
        impact: { previousIdentity: null, currentIdentity: inspection.identity, previousSha256: null, currentSha256: "preflight-hash", previousSize: null, currentSize: 3, previousIsolationMode: null, currentIsolationMode: 2, previousSourceType: null, currentSourceType: 0, addedPlugins: [], unchangedPlugins: [], changedPlugins: [], removedPlugins: [], addedWorkflowActivities: [], changedWorkflowActivities: [], removedWorkflowActivities: [], ownedStepsAndImages: [], dependencies: [], workflowContractDifferences: [], warnings: [], blockers: [] },
      });
      return Promise.reject(new Error(`Unexpected mutation request: ${url}`));
    });
    renderWithProviders(<ConnectionsProvider><PluginRegistration /></ConnectionsProvider>, {
      bridgeOverrides: {
        listConnections: async () => [{ name: "Development", envUrl: "https://development.example.test", crmType: "online" }],
        getActiveConnectionName: async () => "Development",
        getConnection: async (name) => ({ name, envUrl: "https://development.example.test", crmType: "online", token: "development-token", expiresOn: "2099-01-01T00:00:00.000Z" }),
      },
    });
    const register = screen.getByRole("button", { name: "Register assembly" });
    await waitFor(() => expect(register).toBeEnabled());
    fireEvent.click(register);
    const user = userEvent.setup();
    await user.upload(await screen.findByLabelText("Assembly DLL"), new File(["dll"], "Contoso.dll", { type: "application/octet-stream" }));
    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith(
      "/api/plugin-registration/assemblies/analyze",
      expect.any(FormData),
      expect.objectContaining({ meta: { connectionName: "Development" } }),
    ));
    await screen.findByText("Contoso 1.0.0.0");
    fireEvent.click(screen.getByRole("button", { name: "Preview impact" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("uploaded DLL changed after analysis");
    expect(screen.queryByRole("dialog", { name: "Assembly impact preview" })).not.toBeInTheDocument();
  });

  it("shows the complete impact, keeps blockers from executing, and supports Cancel", async () => {
    const inspection = inspectionFixture();
    httpServer.use(
      http.get("http://localhost/api/plugin-registration/catalog", () =>
        HttpResponse.json({ assemblies: [] }),
      ),
    );
    apiPostMock.mockImplementation((url: string) => {
      if (url.endsWith("/analyze")) return Promise.resolve(inspection);
      if (url.endsWith("/register/preflight")) return Promise.resolve(preflightFixture(inspection, true));
      return Promise.reject(new Error(`Unexpected mutation request: ${url}`));
    });
    renderPage();
    const user = userEvent.setup();
    const file = new File(["dll"], "Contoso.dll", { type: "application/octet-stream" });

    await openAndAnalyze(user, file);
    await user.click(screen.getByRole("button", { name: "Preview impact" }));

    const preview = await screen.findByRole("dialog", { name: "Assembly impact preview" });
    expect(preview).toHaveTextContent("Contoso, 1.0.0.0, neutral, old-token");
    expect(preview).toHaveTextContent("Contoso, 2.0.0.0, neutral, new-token");
    expect(preview).toHaveTextContent("old-sha");
    expect(preview).toHaveTextContent("analysis-hash");
    expect(preview).toHaveTextContent("10 bytes");
    expect(preview).toHaveTextContent("3 bytes");
    expect(preview).toHaveTextContent("Added: Contoso.AddedPlugin");
    expect(preview).toHaveTextContent("Unchanged: Contoso.StablePlugin");
    expect(preview).toHaveTextContent("Changed: Contoso.ChangedPlugin");
    expect(preview).toHaveTextContent("Removed: Contoso.RemovedPlugin");
    expect(preview).toHaveTextContent("Contoso.Workflow.Required Account: added-required (breaking)");
    expect(preview).toHaveTextContent("Contoso.RemovedPlugin: step 'Update account', image 'PreImage'");
    expect(preview).toHaveTextContent("Custom API: Submit Account");
    expect(preview).toHaveTextContent("Review the assembly version change.");
    expect(preview).toHaveTextContent("A referenced workflow activity has a breaking contract.");
    expect(within(preview).getByRole("button", { name: "Confirm" })).toBeDisabled();

    await user.click(within(preview).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Assembly impact preview" })).not.toBeInTheDocument();
    expect(apiPostMock.mock.calls.filter(([url]) => String(url).endsWith("/execute"))).toHaveLength(0);
  });

  it("confirms with the same hash-bound DLL once and refreshes the verified catalog", async () => {
    const inspection = inspectionFixture();
    const verifiedAssembly = assemblyFixture();
    let catalogReads = 0;
    httpServer.use(
      http.get("http://localhost/api/plugin-registration/catalog", () => {
        catalogReads++;
        return HttpResponse.json({ assemblies: [] });
      }),
    );
    apiPostMock.mockImplementation((url: string) => {
      if (url.endsWith("/analyze")) return Promise.resolve(inspection);
      if (url.endsWith("/register/preflight")) return Promise.resolve(preflightFixture(inspection, false));
      if (url.endsWith("/register/execute")) return Promise.resolve({
        outcome: "succeededAndVerified",
        succeededAndVerified: true,
        assembly: verifiedAssembly,
      });
      return Promise.reject(new Error(`Unexpected mutation request: ${url}`));
    });
    const { queryClient } = renderPage();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const user = userEvent.setup();
    const file = new File(["dll"], "Contoso.dll", { type: "application/octet-stream" });

    await openAndAnalyze(user, file);
    await user.click(screen.getByRole("button", { name: "Preview impact" }));
    await user.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Register assembly" })).not.toBeInTheDocument());
    const executeCalls = apiPostMock.mock.calls.filter(([url]) => String(url).endsWith("/register/execute"));
    expect(executeCalls).toHaveLength(1);
    const executeForm = executeCalls[0][1] as FormData;
    expect(executeForm.get("assembly")).toBe(file);
    expect(executeForm.get("planToken")).toBe("signed-plan");
    expect(JSON.parse(String(executeForm.get("draft")))).toMatchObject({
      fileName: "Contoso.dll",
      operation: "register",
      inspection: { sha256: "analysis-hash" },
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["plugin-registration", "catalog", "Development"],
    });
    await waitFor(() => expect(catalogReads).toBeGreaterThanOrEqual(2));
  });

  it("does not retry a failed assembly analysis", async () => {
    httpServer.use(
      http.get("http://localhost/api/plugin-registration/catalog", () =>
        HttpResponse.json({ assemblies: [] }),
      ),
    );
    apiPostMock.mockRejectedValue(new Error("analysis failed"));
    renderPage();
    const user = userEvent.setup();

    await user.click(await enabledRegisterButton());
    await user.upload(
      await screen.findByLabelText("Assembly DLL"),
      new File(["dll"], "Contoso.dll", { type: "application/octet-stream" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("could not be analyzed");
    expect(apiPostMock).toHaveBeenCalledTimes(1);
  });
});

function inspectionFixture() {
  return {
    fileName: "Contoso.dll",
    size: 3,
    sha256: "analysis-hash",
    identity: { name: "Contoso", version: "2.0.0.0", culture: "neutral", publicKeyToken: "new-token" },
    plugins: [{ typeName: "Contoso.AddedPlugin" }],
    workflowActivities: [],
  };
}

function preflightFixture(inspection: ReturnType<typeof inspectionFixture>, blocked: boolean) {
  const blockers = blocked
    ? [{ code: "assembly_workflow_contract_breaking", message: "A referenced workflow activity has a breaking contract." }]
    : [];
  return {
    draft: {
      fileName: "Contoso.dll", operation: "register", assemblyId: null,
      requestedIsolationMode: 2, requestedSourceType: 0,
      expectedAssemblyVersionNumber: null, expectedHandlerVersionNumbers: {}, inspection,
    },
    plan: {
      token: "signed-plan", blockers,
      warnings: [{ code: "version", message: "Review the assembly version change." }],
      confirmation: { level: "explicit", message: "Confirm this assembly mutation.", requiresAcknowledgement: false },
    },
    impact: {
      previousIdentity: { name: "Contoso", version: "1.0.0.0", culture: "neutral", publicKeyToken: "old-token" },
      currentIdentity: inspection.identity,
      previousSha256: "old-sha", currentSha256: inspection.sha256,
      previousSize: 10, currentSize: inspection.size,
      previousIsolationMode: 2, currentIsolationMode: 2,
      previousSourceType: 0, currentSourceType: 0,
      addedPlugins: ["Contoso.AddedPlugin"],
      unchangedPlugins: ["Contoso.StablePlugin"],
      changedPlugins: ["Contoso.ChangedPlugin"],
      removedPlugins: ["Contoso.RemovedPlugin"],
      addedWorkflowActivities: [], changedWorkflowActivities: ["Contoso.Workflow"], removedWorkflowActivities: [],
      ownedStepsAndImages: ["Contoso.RemovedPlugin: step 'Update account', image 'PreImage'"],
      dependencies: ["Custom API: Submit Account"],
      workflowContractDifferences: [{
        typeName: "Contoso.Workflow", argumentName: "Required Account", change: "added-required",
        isBreaking: true, isReferenced: true,
      }],
      warnings: [{ code: "version", message: "Review the assembly version change." }],
      blockers,
    },
  };
}

function assemblyFixture() {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Contoso", version: "2.0.0.0", culture: "neutral", publicKeyToken: "new-token",
    sourceType: 0, isolationMode: 2, isManaged: false, isCustomizable: true, versionNumber: 2,
    handlers: [], description: null, solutionDisplayName: null,
  };
}

function renderPage() {
  return renderWithProviders(<ConnectionsProvider><PluginRegistration /></ConnectionsProvider>, {
    bridgeOverrides: {
      listConnections: async () => [{ name: "Development", envUrl: "https://development.example.test", crmType: "online" }],
      getActiveConnectionName: async () => "Development",
      getConnection: async (name) => ({ name, envUrl: "https://development.example.test", crmType: "online", token: "development-token", expiresOn: "2099-01-01T00:00:00.000Z" }),
    },
  });
}

async function enabledRegisterButton() {
  const register = screen.getByRole("button", { name: "Register assembly" });
  await waitFor(() => expect(register).toBeEnabled());
  return register;
}

async function openAndAnalyze(user: ReturnType<typeof userEvent.setup>, file: File) {
  await user.click(await enabledRegisterButton());
  await user.upload(await screen.findByLabelText("Assembly DLL"), file);
  await screen.findByText("Contoso 2.0.0.0");
}
