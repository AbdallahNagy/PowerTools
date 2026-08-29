import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ConnectionsProvider } from "../../../../shared/connections";
import { renderWithProviders } from "../../../../../../test/support/render";
import PluginRegistration from "../../PluginRegistration";

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
});
