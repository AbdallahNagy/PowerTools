import { File as NodeFile } from "node:buffer";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";

import { ToastProvider } from "../../../../shared/ui";
import { AssemblyDialog } from "../../components/dialogs/AssemblyDialog";
import { catalogFixture } from "../catalogFixture";
import { httpServer } from "../../../../../../test/support/httpServer";
import { renderWithProviders } from "../../../../../../test/support/render";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const connection = {
  name: "Dev Org",
  envUrl: "https://dev.example.test",
  crmType: "online" as const,
};

const inspection = {
  fileName: "Contoso.Plugins.dll",
  size: 12,
  sha256: "abcdef1234567890",
  identity: {
    name: "Contoso.Plugins",
    version: "1.0.1.0",
    culture: "neutral",
    publicKeyToken: "abcdef",
  },
  targetFramework: ".NETFramework,Version=v4.6.2",
  runtimeVersion: "v4.0.30319",
  diagnostics: [],
  plugins: [{ typeName: "Contoso.Plugins.AccountPlugin" }],
  workflowActivities: [],
};

describe("AssemblyDialog", () => {
  it("posts the selected assembly file and isolation mode", async () => {
    let posted: { hasAssembly?: boolean; isolationMode?: string } = {};
    httpServer.use(
      http.get("http://localhost/api/plugin-registration/capabilities", () =>
        HttpResponse.json({
          isOnline: true,
          isolationModes: [2],
          sourceTypes: [0],
        }),
      ),
      http.post("http://localhost/api/plugin-registration/assemblies/analyze", async () =>
        HttpResponse.json(inspection),
      ),
      http.post(
        "http://localhost/api/plugin-registration/assemblies",
        async ({ request }) => {
          const form = await request.formData();
          posted = {
            hasAssembly: form.has("assembly"),
            isolationMode: String(form.get("isolationMode")),
          };
          return HttpResponse.json({ id: catalogFixture.assemblies[0]?.id });
        },
      ),
    );

    renderWithProviders(
      <ToastProvider>
        <AssemblyDialog open connectionName={connection.name} onClose={() => undefined} />
      </ToastProvider>,
      {
        bridgeOverrides: {
          getConnection: async () => ({
            ...connection,
            token: "dev-token",
            expiresOn: "2099-01-01T00:00:00.000Z",
          }),
        },
      },
    );

    const file = new NodeFile(["dll-bytes"], "Contoso.Plugins.dll", {
      type: "application/octet-stream",
    });
    fireEvent.change(await screen.findByLabelText("Assembly"), {
      target: { files: [file] },
    });

    expect(await screen.findByText("Contoso.Plugins.AccountPlugin")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    await waitFor(() => expect(posted.hasAssembly).toBe(true));
    expect(posted.isolationMode).toBe("2");
  });

  it("shows a loader while analyzing and registering an assembly", async () => {
    const analyze = deferred();
    const register = deferred();
    httpServer.use(
      http.get("http://localhost/api/plugin-registration/capabilities", () =>
        HttpResponse.json({
          isOnline: true,
          isolationModes: [2],
          sourceTypes: [0],
        }),
      ),
      http.post("http://localhost/api/plugin-registration/assemblies/analyze", async () => {
        await analyze.promise;
        return HttpResponse.json(inspection);
      }),
      http.post("http://localhost/api/plugin-registration/assemblies", async () => {
        await register.promise;
        return HttpResponse.json({ id: catalogFixture.assemblies[0]?.id });
      }),
    );

    renderWithProviders(
      <ToastProvider>
        <AssemblyDialog open connectionName={connection.name} onClose={() => undefined} />
      </ToastProvider>,
      {
        bridgeOverrides: {
          getConnection: async () => ({
            ...connection,
            token: "dev-token",
            expiresOn: "2099-01-01T00:00:00.000Z",
          }),
        },
      },
    );

    const file = new NodeFile(["dll-bytes"], "Contoso.Plugins.dll", {
      type: "application/octet-stream",
    });
    fireEvent.change(await screen.findByLabelText("Assembly"), {
      target: { files: [file] },
    });

    expect(await screen.findByRole("status", { name: "Analyzing assembly…" })).toBeInTheDocument();
    analyze.resolve();
    expect(await screen.findByText("Contoso.Plugins.AccountPlugin")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Analyzing assembly…" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Register" }));
    expect(await screen.findByRole("status", { name: "Registering assembly…" })).toBeInTheDocument();
    register.resolve();

    const toast = await screen.findByText("Assembly registered.");
    expect(toast.closest("[data-toast-type]")).toHaveAttribute("data-toast-type", "success");
    expect(screen.queryByRole("status", { name: "Registering assembly…" })).not.toBeInTheDocument();
  });

  it("shows Isolation None and Source Disk disabled for online orgs", async () => {
    httpServer.use(
      http.get("http://localhost/api/plugin-registration/capabilities", () =>
        HttpResponse.json({
          isOnline: true,
          isolationModes: [2],
          sourceTypes: [0],
        }),
      ),
    );

    renderWithProviders(
      <ToastProvider>
        <AssemblyDialog open connectionName={connection.name} onClose={() => undefined} />
      </ToastProvider>,
      {
        bridgeOverrides: {
          getConnection: async () => ({
            ...connection,
            token: "dev-token",
            expiresOn: "2099-01-01T00:00:00.000Z",
          }),
        },
      },
    );

    await waitFor(() => expect(screen.getByRole("radio", { name: "Sandbox" })).toBeEnabled());
    expect(screen.getByRole("radio", { name: "None" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Database" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "Disk" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Sandbox" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Database" })).toBeChecked();
  });

  it("enables Isolation None and Source Disk for on-prem orgs", async () => {
    httpServer.use(
      http.get("http://localhost/api/plugin-registration/capabilities", () =>
        HttpResponse.json({
          isOnline: false,
          isolationModes: [1, 2],
          sourceTypes: [0, 1],
        }),
      ),
    );

    renderWithProviders(
      <ToastProvider>
        <AssemblyDialog open connectionName={connection.name} onClose={() => undefined} />
      </ToastProvider>,
      {
        bridgeOverrides: {
          getConnection: async () => ({
            ...connection,
            token: "dev-token",
            expiresOn: "2099-01-01T00:00:00.000Z",
          }),
        },
      },
    );

    await waitFor(() => expect(screen.getByRole("radio", { name: "None" })).toBeEnabled());
    expect(screen.getByRole("radio", { name: "Sandbox" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "Database" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "Disk" })).toBeEnabled();
  });

  it("freezes isolation and source when updating an assembly", async () => {
    httpServer.use(
      http.get("http://localhost/api/plugin-registration/capabilities", () =>
        HttpResponse.json({
          isOnline: false,
          isolationModes: [1, 2],
          sourceTypes: [0, 1],
        }),
      ),
    );

    renderWithProviders(
      <ToastProvider>
        <AssemblyDialog
          open
          connectionName={connection.name}
          assembly={catalogFixture.assemblies[0]}
          onClose={() => undefined}
        />
      </ToastProvider>,
      {
        bridgeOverrides: {
          getConnection: async () => ({
            ...connection,
            token: "dev-token",
            expiresOn: "2099-01-01T00:00:00.000Z",
          }),
        },
      },
    );

    await waitFor(() => expect(screen.getByRole("radio", { name: "Sandbox" })).toBeChecked());
    expect(screen.getByRole("radio", { name: "Sandbox" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "None" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Database" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Database" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Disk" })).toBeDisabled();
  });
});
