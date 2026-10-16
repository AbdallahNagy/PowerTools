import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WhatsNewDialog } from "../../src/ui/shell/layout/WhatsNewDialog";
import { renderWithProviders } from "../support/render";

describe("what's new panel", () => {
  it("shows the installed version's notes and a one-time star prompt", async () => {
    const openExternalUrl = vi.fn(async () => undefined);
    const dismissWhatsNew = vi.fn(async () => undefined);
    renderWithProviders(<WhatsNewDialog />, {
      bridgeOverrides: {
        getWhatsNew: async () => ({
          version: "1.1.0",
          releaseNotes: "<h3>Added</h3><ul><li>Solution Layers Explorer</li></ul>",
          showStarPrompt: true,
        }),
        openExternalUrl,
        dismissWhatsNew,
      },
    });

    const dialog = await screen.findByRole("dialog", { name: "Power Tools updated to v1.1.0" });
    const notes = within(dialog).getByTestId("whats-new-release-notes");
    expect(within(notes).getByText("Added")).toBeInTheDocument();
    expect(within(notes).getByRole("listitem")).toHaveTextContent("Solution Layers Explorer");

    fireEvent.click(within(dialog).getByRole("button", { name: "Star on GitHub" }));
    expect(openExternalUrl).toHaveBeenCalledWith("https://github.com/AbdallahNagy/PowerTools");

    fireEvent.click(within(dialog).getByRole("button", { name: "Got it" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(dismissWhatsNew).toHaveBeenCalledTimes(1);
  });

  it("links to GitHub when the notes are missing and leaves out the star prompt", async () => {
    const openExternalUrl = vi.fn(async () => undefined);
    renderWithProviders(<WhatsNewDialog />, {
      bridgeOverrides: {
        getWhatsNew: async () => ({ version: "1.1.0", showStarPrompt: false }),
        openExternalUrl,
      },
    });

    const dialog = await screen.findByRole("dialog", { name: "Power Tools updated to v1.1.0" });
    expect(within(dialog).getByText("The release notes for this version are on GitHub.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Star on GitHub" })).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "View on GitHub" }));
    expect(openExternalUrl).toHaveBeenCalledWith("https://github.com/AbdallahNagy/PowerTools/releases/tag/v1.1.0");
  });

  it("stays closed when the app was not updated", async () => {
    const getWhatsNew = vi.fn(async () => null);
    renderWithProviders(<WhatsNewDialog />, { bridgeOverrides: { getWhatsNew } });

    await vi.waitFor(() => expect(getWhatsNew).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
