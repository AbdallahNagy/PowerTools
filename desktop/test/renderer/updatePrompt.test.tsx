import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import StatusBar from "../../src/ui/shell/layout/StatusBar";
import TitleBar from "../../src/ui/shell/layout/TitleBar";
import { UpdateDialog } from "../../src/ui/shell/layout/UpdateDialog";
import { UpdateProvider } from "../../src/ui/shell/layout/UpdateProvider";
import { releaseNotesToBlocks } from "../../src/ui/shell/layout/updateStatus";
import { StatusBarProvider } from "../../src/ui/shared/status";
import { renderWithProviders } from "../support/render";

function renderShell(overrides: Parameters<typeof renderWithProviders>[1] = {}) {
  return renderWithProviders(
    <StatusBarProvider>
      <UpdateProvider>
        <TitleBar sidebarVisible onToggleSidebar={() => undefined} />
        <StatusBar />
        <UpdateDialog />
      </UpdateProvider>
    </StatusBarProvider>,
    overrides,
  );
}

describe("update prompt", () => {
  it("opens on start with release notes, and Later leaves a visible way back", async () => {
    const downloadUpdate = vi.fn(async () => undefined);
    renderShell({
      bridgeOverrides: {
        getUpdateStatus: async () => ({
          state: "available",
          version: "0.2.0",
          releaseNotes: "<h2>Highlights</h2><ul><li>Faster metadata load</li><li>New tool</li></ul>",
        }),
        downloadUpdate,
      },
    });

    const dialog = await screen.findByRole("dialog", { name: "Power Tools v0.2.0 is available" });
    const notes = within(dialog).getByTestId("update-release-notes");
    expect(within(notes).getByText("Highlights")).toBeInTheDocument();
    expect(within(notes).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Faster metadata load",
      "New tool",
    ]);

    fireEvent.click(within(dialog).getByRole("button", { name: "Later" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const titleBarButton = within(screen.getByTestId("title-bar")).getByRole("button", {
      name: "Power Tools v0.2.0 is available. Click to see what's new and update.",
    });
    expect(titleBarButton).toHaveTextContent("Update to v0.2.0");

    fireEvent.click(titleBarButton);
    const reopened = await screen.findByRole("dialog", { name: "Power Tools v0.2.0 is available" });
    fireEvent.click(within(reopened).getByRole("button", { name: "Update now" }));
    expect(downloadUpdate).toHaveBeenCalledTimes(1);
  });

  it("offers restart once the update is downloaded", async () => {
    const installUpdate = vi.fn(async () => undefined);
    const { bridge } = renderShell({ bridgeOverrides: { installUpdate } });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => {
      bridge.emitUpdateStatusChanged({ state: "downloaded", version: "0.2.0" });
    });

    const dialog = await screen.findByRole("dialog", { name: "Power Tools v0.2.0 is ready to install" });
    expect(within(dialog).getByText("No release notes were provided for this version.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Restart and update" }));
    expect(installUpdate).toHaveBeenCalledTimes(1);
  });

  it("shows no update controls when there is nothing to update", async () => {
    renderShell();
    await screen.findByTestId("title-bar");
    expect(screen.queryByRole("button", { name: /update/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("release notes", () => {
  it("keeps text only and drops scripts and markup", () => {
    expect(
      releaseNotesToBlocks(
        '<p onclick="x()">Intro <b>bold</b></p><script>alert(1)</script><ul><li>One<ul><li>Nested</li></ul></li></ul>Tail',
      ),
    ).toEqual([
      { kind: "paragraph", text: "Intro bold" },
      { kind: "item", text: "One" },
      { kind: "item", text: "Nested" },
      { kind: "paragraph", text: "Tail" },
    ]);
    expect(releaseNotesToBlocks(undefined)).toEqual([]);
  });
});
