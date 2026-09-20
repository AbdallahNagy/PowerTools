import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";

import { ToastProvider } from "../../../../shared/ui";
import { StepDialog } from "../../components/dialogs/StepDialog";
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

const messageId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const typeId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function renderDialog() {
  return renderWithProviders(
    <ToastProvider>
      <StepDialog
        open
        connectionName={connection.name}
        pluginTypeId={typeId}
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

function stepOptions() {
  return HttpResponse.json({
    messages: [{ id: messageId, name: "Update" }],
    filters: [
      {
        id: "filter-none",
        messageId,
        primaryEntity: "none",
        secondaryEntity: "none",
        availability: 2,
      },
      {
        id: "filter-account",
        messageId,
        primaryEntity: "account",
        secondaryEntity: "none",
        availability: 0,
      },
    ],
    users: [],
  });
}

describe("StepDialog", () => {
  it("posts a step draft for the selected message", async () => {
    let posted: unknown;
    httpServer.use(
      http.get("http://localhost/api/plugin-registration/step-options", () => stepOptions()),
      http.get("http://localhost/api/metadata/entities/account/attributes", () =>
        HttpResponse.json([
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
        ]),
      ),
      http.post("http://localhost/api/plugin-registration/steps", async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json({ id: "step-1" });
      }),
    );

    renderDialog();
    await screen.findByLabelText("Name");
    const primary = await waitFor(() => {
      const field = screen.getByLabelText("Primary entity");
      expect(field).toBeEnabled();
      return field;
    });
    expect(screen.getByLabelText("Secondary entity")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "AccountPlugin: Update of account" },
    });
    expect(within(primary).queryByRole("option", { name: "none" })).not.toBeInTheDocument();
    expect(within(primary).getByRole("option", { name: "account" })).toBeInTheDocument();
    fireEvent.change(primary, { target: { value: "account" } });
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
      name: "AccountPlugin: Update of account",
      pluginTypeId: typeId,
      messageId,
      filterId: "filter-account",
      stage: 40,
      mode: 0,
      filteringAttributes: ["name"],
      secureConfigurationAction: "keep",
    });
  });

  it("disables async auto-delete while the step is synchronous", async () => {
    httpServer.use(
      http.get("http://localhost/api/plugin-registration/step-options", () => stepOptions()),
    );

    renderDialog();
    await screen.findByLabelText("Name");
    await waitFor(() => expect(screen.getByLabelText("Primary entity")).toBeEnabled());
    expect(screen.getByRole("checkbox", { name: "Delete completed async jobs" })).toBeDisabled();
    expect(screen.getByLabelText("Primary entity")).toBeEnabled();
    expect(screen.getByLabelText("Secondary entity")).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Pre-operation" }));
    expect(screen.getByRole("radio", { name: "Asynchronous" })).toBeDisabled();
  });

  it("shows a field problem from a 400 response", async () => {
    httpServer.use(
      http.get("http://localhost/api/plugin-registration/step-options", () =>
        HttpResponse.json({
          messages: [{ id: messageId, name: "Update" }],
          filters: [],
          users: [],
        }),
      ),
      http.post("http://localhost/api/plugin-registration/steps", () =>
        HttpResponse.json(
          {
            code: "validation_failed",
            message: "The registration request is invalid.",
            problems: [{ field: "name", code: "required", message: "Step name is required." }],
          },
          { status: 400 },
        ),
      ),
    );

    renderDialog();
    await screen.findByLabelText("Name");
    fireEvent.click(screen.getByRole("button", { name: "Register" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Step name is required.");
    const errorToast = screen.getByText("The registration request is invalid.").closest("[data-toast-type]");
    expect(errorToast).toHaveAttribute("data-toast-type", "error");
  });

  it("shows a loader while registering a step and a primary success toast when finished", async () => {
    const gate = deferred();
    httpServer.use(
      http.get("http://localhost/api/plugin-registration/step-options", () => stepOptions()),
      http.post("http://localhost/api/plugin-registration/steps", async () => {
        await gate.promise;
        return HttpResponse.json({ id: "step-1" });
      }),
    );

    renderDialog();
    await screen.findByLabelText("Name");
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    expect(await screen.findByRole("status", { name: "Registering step…" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Register" })).toBeDisabled();
    gate.resolve();

    const toast = await screen.findByText("Step registered.");
    expect(toast.closest("[data-toast-type]")).toHaveAttribute("data-toast-type", "success");
    expect(toast.closest("[data-toast-type]")).toHaveClass("bg-[var(--color-primary)]");
    expect(screen.queryByRole("status", { name: "Registering step…" })).not.toBeInTheDocument();
  });

  it("disables both entities when the message only has a none filter", async () => {
    const associateId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    httpServer.use(
      http.get("http://localhost/api/plugin-registration/step-options", () =>
        HttpResponse.json({
          messages: [
            { id: messageId, name: "Update" },
            { id: associateId, name: "Associate" },
          ],
          filters: [
            {
              id: "filter-none",
              messageId,
              primaryEntity: "none",
              secondaryEntity: "none",
              availability: 2,
            },
            {
              id: "filter-account",
              messageId,
              primaryEntity: "account",
              secondaryEntity: "none",
              availability: 0,
            },
            {
              id: "filter-associate-none",
              messageId: associateId,
              primaryEntity: "none",
              secondaryEntity: "none",
              availability: 2,
            },
          ],
          users: [],
        }),
      ),
    );

    renderDialog();
    await screen.findByLabelText("Name");
    await waitFor(() => expect(screen.getByLabelText("Primary entity")).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: associateId } });
    expect(screen.getByLabelText("Primary entity")).toBeDisabled();
    expect(screen.getByLabelText("Secondary entity")).toBeDisabled();
  });

  it("enables secondary entity only after a paired primary is selected", async () => {
    const setRelatedId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01";
    httpServer.use(
      http.get("http://localhost/api/plugin-registration/step-options", () =>
        HttpResponse.json({
          messages: [{ id: setRelatedId, name: "SetRelated" }],
          filters: [
            {
              id: "filter-invoice-contact",
              messageId: setRelatedId,
              primaryEntity: "invoice",
              secondaryEntity: "contact",
              availability: 0,
            },
            {
              id: "filter-lead-account",
              messageId: setRelatedId,
              primaryEntity: "lead",
              secondaryEntity: "account",
              availability: 0,
            },
          ],
          users: [],
        }),
      ),
    );

    renderDialog();
    await screen.findByLabelText("Name");
    expect(screen.getByLabelText("Primary entity")).toBeDisabled();
    expect(screen.getByLabelText("Secondary entity")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: setRelatedId } });
    const primary = screen.getByLabelText("Primary entity");
    expect(primary).toBeEnabled();
    expect(screen.getByLabelText("Secondary entity")).toBeDisabled();
    fireEvent.change(primary, { target: { value: "invoice" } });
    const secondary = screen.getByLabelText("Secondary entity");
    expect(secondary).toBeEnabled();
    expect(within(secondary).getByRole("option", { name: "contact" })).toBeInTheDocument();
  });
});

describe("catalog fixture step", () => {
  it("has a stable id used by other tests", () => {
    expect(catalogFixture.steps[0]?.pluginTypeId).toBe(typeId);
  });
});
