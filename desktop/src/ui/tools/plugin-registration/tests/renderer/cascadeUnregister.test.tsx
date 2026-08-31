import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../../../test/support/render";
import { CascadeConfirmationDialog } from "../../components/dialogs/CascadeConfirmationDialog";

it("requires an assembly acknowledgment and exact name before exposing count-bearing delete action", async () => {
  const confirm = vi.fn();
  renderWithProviders(<CascadeConfirmationDialog open connectionName="Development" targetKind="assembly"
    assemblyName="Contoso.Plugins" handlerClassName={null} impact={{ handlers: 2, steps: 3, images: 4, enabledSteps: 1, dependencies: [] }}
    blockers={[]} executing={false} onCancel={vi.fn()} onConfirm={confirm} />);

  const deleteButton = screen.getByRole("button", { name: "Delete assembly, 2 handlers, 3 steps, and 4 images" });
  expect(deleteButton).toBeDisabled();
  await userEvent.click(screen.getByLabelText("Acknowledge assembly unregister"));
  await userEvent.type(screen.getByLabelText("Type Contoso.Plugins to confirm"), "Contoso.Plugins");
  expect(deleteButton).toBeEnabled();
  await userEvent.click(deleteButton);
  expect(confirm).toHaveBeenCalledOnce();
});

it("keeps cascade unavailable when an external dependency blocks deletion", () => {
  renderWithProviders(<CascadeConfirmationDialog open connectionName="Development" targetKind="plugin"
    assemblyName={null} handlerClassName="Contoso.Plugins.Validate" impact={{ handlers: 1, steps: 1, images: 1, enabledSteps: 1, dependencies: ["Custom API: Other API"] }}
    blockers={[{ code: "external_dependency", message: "Custom API Other API is outside this registration hierarchy." }]} executing={false}
    onCancel={vi.fn()} onConfirm={vi.fn()} />);

  expect(screen.getByText("Custom API: Other API")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Delete plug-in, 1 handler, 1 step, and 1 image" })).toBeDisabled();
});

it("requires the full plug-in class name before confirming its cascade", async () => {
  const confirm = vi.fn();
  renderWithProviders(<CascadeConfirmationDialog open connectionName="Development" targetKind="plugin"
    assemblyName={null} handlerClassName="Contoso.Plugins.ValidateAccount" impact={{ handlers: 1, steps: 0, images: 0, enabledSteps: 0, dependencies: [] }}
    blockers={[]} executing={false} onCancel={vi.fn()} onConfirm={confirm} />);

  const deleteButton = screen.getByRole("button", { name: "Delete plug-in, 1 handler, 0 steps, and 0 images" });
  await userEvent.type(screen.getByLabelText("Type Contoso.Plugins.ValidateAccount to confirm"), "ValidateAccount");
  expect(deleteButton).toBeDisabled();
  await userEvent.clear(screen.getByLabelText("Type Contoso.Plugins.ValidateAccount to confirm"));
  await userEvent.type(screen.getByLabelText("Type Contoso.Plugins.ValidateAccount to confirm"), "Contoso.Plugins.ValidateAccount");
  await userEvent.click(deleteButton);
  expect(confirm).toHaveBeenCalledWith("Contoso.Plugins.ValidateAccount", false);
});

it("shows the complete affected registration list before destructive confirmation", () => {
  renderWithProviders(<CascadeConfirmationDialog open connectionName="Development" targetKind="plugin"
    assemblyName={null} handlerClassName="Contoso.Plugins.Validate" impact={{ handlers: 1, steps: 1, images: 1, enabledSteps: 1, dependencies: [],
      items: ["Plug-in: Contoso.Plugins.Validate", "Step: Validate account", "Image: Pre image"] }}
    blockers={[]} executing={false} onCancel={vi.fn()} onConfirm={vi.fn()} />);

  expect(screen.getByText("Plug-in: Contoso.Plugins.Validate")).toBeInTheDocument();
  expect(screen.getByText("Step: Validate account")).toBeInTheDocument();
  expect(screen.getByText("Image: Pre image")).toBeInTheDocument();
});
