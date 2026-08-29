import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConnectionsProvider } from "../../../../shared/connections";
import { renderWithProviders } from "../../../../../../test/support/render";
import PluginRegistration from "../../PluginRegistration";

describe("Assembly mutations", () => {
  it("starts registration with a DLL file selection", async () => {
    renderWithProviders(
      <ConnectionsProvider>
        <PluginRegistration />
      </ConnectionsProvider>,
      {
        bridgeOverrides: {
          listConnections: async () => [],
          getActiveConnectionName: async () => null,
        },
      },
    );

    fireEvent.click(screen.getByRole("button", { name: "Register assembly" }));

    expect(await screen.findByLabelText("Assembly DLL")).toHaveAttribute("type", "file");
  });
});
