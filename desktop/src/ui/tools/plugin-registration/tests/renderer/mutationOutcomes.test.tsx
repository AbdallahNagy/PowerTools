import { AxiosError, AxiosHeaders } from "axios";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectionsProvider } from "../../../../shared/connections";
import { httpServer } from "../../../../../../test/support/httpServer";
import { renderWithProviders } from "../../../../../../test/support/render";
import PluginRegistration from "../../PluginRegistration";
import { MutationOutcomeBanner } from "../../components/MutationOutcomeBanner";

const apiPost = vi.hoisted(() => vi.fn());
vi.mock("../../../../shared/api/client", async (original) => ({
  ...await original<typeof import("../../../../shared/api/client")>(),
  apiPost,
}));

const originalResizeObserver = window.ResizeObserver;
beforeAll(() => { window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; });
afterAll(() => { if (originalResizeObserver) window.ResizeObserver = originalResizeObserver; else Reflect.deleteProperty(window, "ResizeObserver"); });
beforeEach(() => apiPost.mockReset());

describe("mutation outcome presentation", () => {
  it("distinguishes verified and reconciled success", () => {
    const view = renderWithProviders(<MutationOutcomeBanner outcome={{ outcome: "succeededAndVerified", targetId: null, problem: null }} />);
    expect(screen.getByRole("status")).toHaveTextContent("succeeded and was verified");

    view.rerender(<MutationOutcomeBanner outcome={{ outcome: "reconciledAfterCommunicationFailure", targetId: null, problem: null }} />);
    expect(screen.getByRole("status")).toHaveTextContent("verified after a communication failure");
  });

  it("offers an explicit retry only for a read-only failure", async () => {
    const retry = vi.fn();
    renderWithProviders(<MutationOutcomeBanner outcome={{ outcome: "rejectedBeforeCompletion", targetId: null, problem: {
      category: "communication", code: "catalog_unavailable", message: "The preview could not be loaded.",
      environment: "Development", component: "Contoso", correlationId: null, suggestedAction: "Try the preview again.",
    } }} retryRead={retry} />);

    expect(screen.getByRole("alert")).toHaveTextContent("The preview could not be loaded.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("closes an uncertain mutation, refreshes once, blocks repeat, and reselects the affected component", async () => {
    let reads = 0;
    let releaseRefresh: (() => void) | undefined;
    httpServer.use(http.get("http://localhost/api/plugin-registration/catalog", async () => {
      reads += 1;
      if (reads === 2) await new Promise<void>((resolve) => { releaseRefresh = resolve; });
      return HttpResponse.json(catalog);
    }));
    apiPost.mockResolvedValueOnce(cascadePreflight).mockResolvedValueOnce({
      outcome: "outcomeUncertain",
      targetId: "assembly-1",
      succeededAndVerified: false,
      problem: null,
    });
    renderPage();

    const assembly = await screen.findByRole("treeitem", { name: "Contoso" });
    fireEvent.contextMenu(assembly);
    await userEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Unregister assembly" }));
    await userEvent.click(screen.getByRole("button", { name: "Preview unregister" }));
    const dialog = await screen.findByRole("dialog", { name: "Unregister assembly" });
    await userEvent.click(within(dialog).getByLabelText("Acknowledge assembly unregister"));
    await userEvent.type(within(dialog).getByLabelText("Type Contoso to confirm"), "Contoso");
    await userEvent.click(within(dialog).getByRole("button", { name: /Delete assembly/ }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Unregister assembly" })).not.toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("Refresh and inspect before trying again");
    expect(screen.getByRole("button", { name: "Register assembly" })).toBeDisabled();
    expect(reads).toBe(2);

    releaseRefresh?.();
    await waitFor(() => expect(screen.getByRole("button", { name: "Register assembly" })).toBeEnabled());
    expect(screen.getByRole("treeitem", { name: "Contoso" })).toHaveAttribute("aria-selected", "true");
    expect(reads).toBe(2);
  });

  it("refreshes and closes when execution rejects a stale plan", async () => {
    let reads = 0;
    httpServer.use(http.get("http://localhost/api/plugin-registration/catalog", () => {
      reads += 1;
      return HttpResponse.json(catalog);
    }));
    apiPost.mockResolvedValueOnce(cascadePreflight).mockRejectedValueOnce(structuredError("concurrency", "stale_plan", "The preview is stale.", "Refresh and create a new preview."));
    renderPage();

    const assembly = await screen.findByRole("treeitem", { name: "Contoso" });
    fireEvent.contextMenu(assembly);
    await userEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Unregister assembly" }));
    await userEvent.click(screen.getByRole("button", { name: "Preview unregister" }));
    const dialog = await screen.findByRole("dialog", { name: "Unregister assembly" });
    await userEvent.click(within(dialog).getByLabelText("Acknowledge assembly unregister"));
    await userEvent.type(within(dialog).getByLabelText("Type Contoso to confirm"), "Contoso");
    await userEvent.click(within(dialog).getByRole("button", { name: /Delete assembly/ }));

    await waitFor(() => expect(reads).toBe(2));
    expect(screen.queryByRole("dialog", { name: "Unregister assembly" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("The preview is stale.");
  });
});

function renderPage() {
  return renderWithProviders(<ConnectionsProvider><PluginRegistration /></ConnectionsProvider>, { bridgeOverrides: {
    listConnections: async () => [{ name: "Development", envUrl: "https://development.test", crmType: "online" }],
    getActiveConnectionName: async () => "Development",
    getConnection: async (name) => ({ name, envUrl: "https://development.test", crmType: "online", token: "token", expiresOn: "2099-01-01T00:00:00Z" }),
  } });
}

function structuredError(category: string, code: string, message: string, suggestedAction: string) {
  return new AxiosError("raw response", "ERR_BAD_RESPONSE", undefined, undefined, {
    data: { category, code, message, environment: "Development", component: "Contoso", correlationId: null, suggestedAction },
    status: 409, statusText: "Conflict", headers: {}, config: { headers: new AxiosHeaders() },
  });
}

const cascadePreflight = { draft: {}, plan: { token: "signed", blockers: [] }, impact: {
  assembly: { name: "Contoso" }, handlers: [{ typeName: "Contoso.Plugin", kind: "plugin" }], steps: [], images: [], externalDependencies: [], enabledStepCount: 0,
} };

const catalog = { assemblies: [{ id: "assembly-1", name: "Contoso", version: "1", culture: null, publicKeyToken: "token",
  sourceType: 0, isolationMode: 2, isManaged: false, isCustomizable: true, versionNumber: 1, description: null,
  solutionDisplayName: null, handlers: [{ id: "plugin-1", kind: 0, typeName: "Contoso.Plugin", name: "Plugin", friendlyName: null,
    description: null, workflowActivityGroupName: null, isManaged: false, isCustomizable: true, versionNumber: 2,
    workflowArguments: [], dependencies: [], assemblyId: "assembly-1", solutionDisplayName: null, steps: [] }] }] };
