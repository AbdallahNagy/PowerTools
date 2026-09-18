import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";

import { ToastProvider } from "../../../../shared/ui";
import { ImageDialog } from "../../components/dialogs/ImageDialog";
import { catalogFixture } from "../catalogFixture";
import { httpServer } from "../../../../../../test/support/httpServer";
import { renderWithProviders } from "../../../../../../test/support/render";

const connection = {
  name: "Dev Org",
  envUrl: "https://dev.example.test",
  crmType: "online" as const,
};

describe("ImageDialog", () => {
  it("posts an image draft for the parent step", async () => {
    let posted: unknown;
    httpServer.use(
      http.get("http://localhost/api/metadata/entities/account/attributes", () =>
        HttpResponse.json([
          {
            logicalName: "name",
            displayName: "Account Name",
            attributeType: "String",
            isPrimaryId: false,
          },
        ]),
      ),
      http.post("http://localhost/api/plugin-registration/images", async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json({ id: "image-1" });
      }),
    );

    renderWithProviders(
      <ToastProvider>
        <ImageDialog
          open
          connectionName={connection.name}
          step={catalogFixture.steps[0]!}
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

    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "PreImage" },
    });
    fireEvent.click(await screen.findByText("Account Name"));
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    await waitFor(() => expect(posted).toBeDefined());
    expect(posted).toMatchObject({
      stepId: catalogFixture.steps[0]?.id,
      name: "PreImage",
      entityAlias: "Target",
      imageType: 0,
      attributes: ["name"],
    });
    expect(screen.getByLabelText("Message property")).toHaveValue("Target");
  });
});
