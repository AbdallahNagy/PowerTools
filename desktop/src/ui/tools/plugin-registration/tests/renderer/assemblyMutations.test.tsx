import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";

import { ConnectionsProvider } from "../../../../shared/connections";
import { renderWithProviders } from "../../../../../../test/support/render";
import PluginRegistration from "../../PluginRegistration";
import { httpServer } from "../../../../../../test/support/httpServer";

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
      http.post("http://localhost/api/plugin-registration/assemblies/analyze", () => HttpResponse.json(inspection)),
      http.post("http://localhost/api/plugin-registration/assemblies/register/preflight", () => HttpResponse.json({
        draft: { fileName: "Contoso.dll", operation: "register", assemblyId: null, requestedIsolationMode: 2, requestedSourceType: 0, expectedAssemblyVersionNumber: null, expectedHandlerVersionNumbers: {}, inspection: { ...inspection, sha256: "preflight-hash" } },
        plan: { token: "token", blockers: [], warnings: [], confirmation: { level: "explicit", message: "Confirm", requiresAcknowledgement: false } },
        impact: { previousIdentity: null, currentIdentity: inspection.identity, previousSha256: null, currentSha256: "preflight-hash", previousSize: null, currentSize: 3, previousIsolationMode: null, currentIsolationMode: 2, previousSourceType: null, currentSourceType: 0, addedPlugins: [], unchangedPlugins: [], changedPlugins: [], removedPlugins: [], addedWorkflowActivities: [], changedWorkflowActivities: [], removedWorkflowActivities: [], ownedStepsAndImages: [], dependencies: [], workflowContractDifferences: [], warnings: [], blockers: [] },
      })),
    );
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
    fireEvent.change(await screen.findByLabelText("Assembly DLL"), { target: { files: [new File(["dll"], "Contoso.dll", { type: "application/octet-stream" })] } });
    await screen.findByText("Contoso 1.0.0.0");
    fireEvent.click(screen.getByRole("button", { name: "Preview impact" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("uploaded DLL changed after analysis");
    expect(screen.queryByRole("dialog", { name: "Assembly impact preview" })).not.toBeInTheDocument();
  });
});
