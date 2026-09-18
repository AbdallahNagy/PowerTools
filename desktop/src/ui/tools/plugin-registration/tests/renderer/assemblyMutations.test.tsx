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
  it("presents an explicit DLL upload control when registering an assembly", async () => {
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

    expect(await screen.findByText("Upload assembly DLL")).toBeVisible();
    expect(screen.getByText("Choose DLL file")).toBeVisible();
    expect(screen.getByLabelText("Assembly DLL")).toHaveAttribute("type", "file");
    expect(screen.getByLabelText("Sandbox")).toBeDisabled();
    expect(screen.getByLabelText("None")).toBeDisabled();
    expect(screen.getByLabelText("Database")).toBeDisabled();
    expect(screen.getByLabelText("Disk")).toBeDisabled();
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
    expect(await screen.findByRole("alert")).toHaveTextContent("uploaded DLL changed after analysis");
    expect(screen.queryByRole("tree", { name: "Added and removed registrations" })).not.toBeInTheDocument();
  });

  it("shows a safe compatibility diagnostic and blocks preview for an incompatible DLL", async () => {
    const inspection = {
      ...inspectionFixture(),
      targetFramework: ".NETFramework,Version=v4.8",
      runtimeVersion: "v4.0.30319",
      diagnostics: [{
        code: "target_framework_unsupported",
        message: "Metadata value that must not be rendered",
        severity: 1 as const,
      }],
    };
    httpServer.use(http.get("http://localhost/api/plugin-registration/catalog", () =>
      HttpResponse.json({ assemblies: [] })));
    apiPostMock.mockImplementation((url: string) =>
      url.endsWith("/analyze") ? Promise.resolve(inspection) : Promise.reject(new Error(`Unexpected mutation request: ${url}`)));
    renderPage();
    const user = userEvent.setup();

    await openAndAnalyze(user, new File(["dll"], "Contoso.dll", { type: "application/octet-stream" }));

    expect(screen.getByRole("alert")).toHaveTextContent("target framework is not supported");
    expect(screen.queryByText("Metadata value that must not be rendered")).not.toBeInTheDocument();
    expect(screen.getByText("Select a compatible DLL and analyze it again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Register" })).toBeDisabled();
    expect(apiPostMock).toHaveBeenCalledTimes(1);
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

    const tree = await screen.findByRole("tree", { name: "Added and removed registrations" });
    expect(tree).toHaveTextContent("(Plugin) Contoso.AddedPlugin");
    expect(tree).toHaveTextContent("(Plugin) Contoso.RemovedPlugin");
    expect(tree).toHaveTextContent("(Step) Update account");
    expect(tree).not.toHaveTextContent("old-sha");
    expect(tree).not.toHaveTextContent("analysis-hash");
    expect(tree).not.toHaveTextContent("Custom API");
    expect(tree).not.toHaveTextContent("Contoso.StablePlugin");
    expect(screen.getByRole("button", { name: "Register" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Register assembly" })).not.toBeInTheDocument();
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
    renderPage();
    const user = userEvent.setup();
    const file = new File(["dll"], "Contoso.dll", { type: "application/octet-stream" });

    await openAndAnalyze(user, file);
    await waitFor(() => expect(screen.getByRole("button", { name: "Register" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Register" }));

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

    const dialog = await screen.findByRole("dialog", { name: "Register assembly" });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("could not be analyzed");
    expect(apiPostMock).toHaveBeenCalledTimes(1);
  });

  it("enables isolation and location when on-premises assembly options are available", async () => {
    httpServer.use(
      http.get("http://localhost/api/plugin-registration/catalog", () => HttpResponse.json({ assemblies: [] })),
      http.get("http://localhost/api/plugin-registration/capabilities", () => HttpResponse.json({
        transactionalCascadeUnregister: { supported: false, reason: "unproven" },
        onPremisesAssemblyOptions: true,
      })),
    );
    renderPage();
    await userEvent.click(await enabledRegisterButton());
    expect(await screen.findByLabelText("Sandbox")).toBeEnabled();
    expect(screen.getByLabelText("None")).toBeEnabled();
    expect(screen.getByLabelText("Database")).toBeEnabled();
    expect(screen.getByLabelText("Disk")).toBeEnabled();
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
