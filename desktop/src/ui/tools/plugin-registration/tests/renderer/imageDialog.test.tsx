import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";

import { ToastProvider } from "../../../../shared/ui";
import { ImageDialog } from "../../components/dialogs/ImageDialog";
import type { StepDto } from "../../model/contracts";
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

const attributes = [
  {
    logicalName: "accountid",
    displayName: "Account",
    attributeType: "Uniqueidentifier",
    isPrimaryId: true,
  },
  {
    logicalName: "name",
    displayName: "Account Name",
    attributeType: "String",
    isPrimaryId: false,
  },
  {
    logicalName: "revenue",
    displayName: "Revenue",
    attributeType: "Money",
    isPrimaryId: false,
  },
];

function renderDialog(step: StepDto = catalogFixture.steps[0]!) {
  return renderWithProviders(
    <ToastProvider>
      <ImageDialog
        open
        connectionName={connection.name}
        step={step}
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
}

function mockAttributes() {
  httpServer.use(
    http.get("http://localhost/api/metadata/entities/account/attributes", () =>
      HttpResponse.json(attributes),
    ),
  );
}

describe("ImageDialog", () => {
  it("posts an image draft for the parent step", async () => {
    let posted: unknown;
    mockAttributes();
    httpServer.use(
      http.post("http://localhost/api/plugin-registration/images", async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json({ id: "image-1" });
      }),
    );

    renderDialog();
    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "PreImage" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "None selected" }));
    fireEvent.change(screen.getByPlaceholderText("Search attributes…"), {
      target: { value: "Account" },
    });
    expect(screen.queryByText("Revenue")).not.toBeInTheDocument();
    fireEvent.click(await screen.findByText("Account Name"));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    await waitFor(() => expect(posted).toBeDefined());
    expect(posted).toMatchObject({
      stepId: catalogFixture.steps[0]?.id,
      name: "PreImage",
      entityAlias: "Target",
      imageType: 0,
      attributes: ["name"],
    });
    expect(screen.queryByLabelText("Message property")).not.toBeInTheDocument();
  });

  it("posts both when pre and post are checked", async () => {
    let posted: unknown;
    mockAttributes();
    httpServer.use(
      http.post("http://localhost/api/plugin-registration/images", async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json({ id: "image-1" });
      }),
    );

    renderDialog();
    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "BothImage" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Post-image" }));
    fireEvent.click(screen.getByRole("button", { name: "None selected" }));
    fireEvent.click(await screen.findByText("Account Name"));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    await waitFor(() => expect(posted).toBeDefined());
    expect(posted).toMatchObject({
      name: "BothImage",
      imageType: 2,
      attributes: ["name"],
    });
  });

  it("disables post-image for delete steps", async () => {
    mockAttributes();
    renderDialog({
      ...catalogFixture.steps[0]!,
      messageName: "Delete",
      name: "AccountPlugin: Delete of account",
    });

    expect(await screen.findByRole("checkbox", { name: "Pre-image" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Post-image" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Post-image" })).not.toBeChecked();
  });

  it("shows a loader while registering an image", async () => {
    const gate = deferred();
    mockAttributes();
    httpServer.use(
      http.post("http://localhost/api/plugin-registration/images", async () => {
        await gate.promise;
        return HttpResponse.json({ id: "image-1" });
      }),
    );

    renderDialog();
    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "PreImage" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    expect(await screen.findByRole("status", { name: "Registering image…" })).toBeInTheDocument();
    gate.resolve();

    const toast = await screen.findByText("Image registered.");
    expect(toast.closest("[data-toast-type]")).toHaveAttribute("data-toast-type", "success");
    expect(screen.queryByRole("status", { name: "Registering image…" })).not.toBeInTheDocument();
  });
});
