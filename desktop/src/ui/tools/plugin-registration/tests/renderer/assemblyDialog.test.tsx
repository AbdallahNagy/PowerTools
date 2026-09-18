import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";

import { ToastProvider } from "../../../../shared/ui";
import { AssemblyDialog } from "../../components/dialogs/AssemblyDialog";
import { catalogFixture } from "../catalogFixture";
import { httpServer } from "../../../../../../test/support/httpServer";
import { renderWithProviders } from "../../../../../../test/support/render";

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
    let posted: { assembly?: string; isolationMode?: string } = {};
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
          const file = form.get("assembly");
          posted = {
            assembly: file instanceof File ? file.name : String(file),
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

    const file = new File(["dll-bytes"], "Contoso.Plugins.dll", {
      type: "application/octet-stream",
    });
    fireEvent.change(await screen.findByLabelText("Assembly"), {
      target: { files: [file] },
    });

    expect(await screen.findByText("Contoso.Plugins.AccountPlugin")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    await waitFor(() => expect(posted.assembly).toBe("Contoso.Plugins.dll"));
    expect(posted.isolationMode).toBe("2");
  });
});
