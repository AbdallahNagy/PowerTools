import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LoadedCommunityTool } from "../../src/ui/platform/desktopBridge";
import { CommunityToolsProvider } from "../../src/ui/shell/community-tools/CommunityToolsProvider";
import { useCommunityTools, useToolRegistry } from "../../src/ui/shell/community-tools/useToolRegistry";
import { communityTool } from "../support/communityTools";
import { renderWithProviders } from "../support/render";

function Probe() {
  const { activityBarTools } = useToolRegistry();
  const { openManager } = useCommunityTools();
  return (
    <>
      <button onClick={openManager}>open manager</button>
      <output aria-label="community ids">
        {activityBarTools
          .filter((tool) => tool.source === "local")
          .map((tool) => tool.id)
          .join("|")}
      </output>
    </>
  );
}

function renderManager(initial: LoadedCommunityTool[], overrides: Parameters<typeof renderWithProviders>[1] = {}) {
  let tools = initial;
  const calls = {
    grant: vi.fn(async (id: string) => {
      tools = tools.map((tool) => (tool.id === id ? { ...tool, consentGranted: true } : tool));
    }),
    remove: vi.fn(async (id: string) => {
      tools = tools.filter((tool) => tool.id !== id);
    }),
    add: vi.fn(async (): Promise<LoadedCommunityTool | null> => null),
    list: vi.fn(async () => tools),
  };
  const view = renderWithProviders(
    <CommunityToolsProvider>
      <Probe />
    </CommunityToolsProvider>,
    {
      ...overrides,
      bridgeOverrides: {
        listCommunityTools: calls.list,
        grantCommunityToolConsent: calls.grant,
        removeCommunityTool: calls.remove,
        addCommunityToolFromFolder: calls.add,
        ...overrides.bridgeOverrides,
      },
    },
  );
  fireEvent.click(screen.getByText("open manager"));
  return { ...view, calls, setTools: (next: LoadedCommunityTool[]) => (tools = next) };
}

const missing = communityTool("acme.gone", { status: "missing", errors: ["The folder no longer exists."] }, "Gone tool");
const unreviewed = communityTool("acme.new", { consentGranted: false }, "New tool");

describe("community tools dialog", () => {
  it("lists a missing tool as Folder not found, with its error and no review button", async () => {
    renderManager([missing]);

    const dialog = await screen.findByRole("dialog", { name: "Community tools" });
    expect(await within(dialog).findByText("Folder not found")).toBeInTheDocument();
    expect(within(dialog).getByText("The folder no longer exists.")).toBeInTheDocument();
    expect(within(dialog).queryByText("Review permissions")).not.toBeInTheDocument();
  });

  it("shows name, version, and publisher as text only", async () => {
    const hostile = communityTool("acme.evil", {}, "<img src=x onerror=alert(1)>");
    renderManager([hostile]);

    const dialog = await screen.findByRole("dialog", { name: "Community tools" });
    expect(await within(dialog).findByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(within(dialog).getByText("1.0.0")).toBeInTheDocument();
    expect(within(dialog).getByText("Acme")).toBeInTheDocument();
    expect(dialog.querySelector("img")).toBeNull();
  });

  it("Allow grants consent once and the tool then appears in the registry", async () => {
    const { calls } = renderManager([unreviewed]);

    fireEvent.click(await screen.findByText("Review permissions"));
    expect(screen.getByLabelText("community ids").textContent).toBe("");
    expect(
      await screen.findByText("This tool was loaded from a folder on this computer and has not been reviewed."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Allow" }));

    await waitFor(() => expect(screen.getByLabelText("community ids").textContent).toBe("acme.new"));
    expect(calls.grant).toHaveBeenCalledTimes(1);
    expect(calls.grant).toHaveBeenCalledWith("acme.new");
    expect(screen.queryByRole("button", { name: "Allow" })).not.toBeInTheDocument();
  });

  it("Cancel grants nothing and the tool stays out of the registry", async () => {
    const { calls } = renderManager([unreviewed]);

    fireEvent.click(await screen.findByText("Review permissions"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Allow" })).not.toBeInTheDocument());
    expect(calls.grant).not.toHaveBeenCalled();
    expect(screen.getByLabelText("community ids").textContent).toBe("");
  });

  it("lists permissions in words, messages by name, and network hosts", async () => {
    const tool = communityTool("acme.wide", { consentGranted: false }, "Wide tool");
    tool.manifest!.permissions = ["data:read", "data:write", "data:delete", "metadata:read", "metadata:write", "files"];
    tool.manifest!.messages = ["WhoAmI"];
    tool.manifest!.network = ["api.example.com"];
    renderManager([tool]);

    fireEvent.click(await screen.findByText("Review permissions"));

    for (const text of [
      "Read data",
      "Create and update data",
      "Delete data",
      "Read table definitions",
      "Change table definitions",
      "Open and save files",
      "WhoAmI",
      "api.example.com",
    ]) {
      expect(await screen.findByText(text)).toBeInTheDocument();
    }
  });

  it("shows a 200-character host, message, tool name, and publisher in full in the review modal", async () => {
    const host = `${"a".repeat(60)}.${"b".repeat(60)}.${"c".repeat(70)}.example.com`;
    const message = "Message_" + "M".repeat(150);
    const name = "Tool " + "N".repeat(150);
    const publisher = "Publisher " + "P".repeat(150);
    const tool = communityTool("acme.long", { consentGranted: false }, name);
    tool.manifest!.network = [host];
    tool.manifest!.messages = [message];
    tool.manifest!.publisher = { name: publisher };
    expect(host.length).toBeGreaterThanOrEqual(200);
    renderManager([tool]);

    fireEvent.click(await screen.findByText("Review permissions"));
    const review = await screen.findByRole("dialog", { name: "Review permissions" });

    for (const text of [host, message, name, publisher]) {
      const element = within(review).getByText(text);
      expect(element.textContent).toBe(text);
      expect(element.className).not.toContain("truncate");
      expect(element.className).toContain("break-all");
    }
  });

  it("keeps the review modal open and Cancel disabled while the grant is in flight", async () => {
    let finish: () => void = () => undefined;
    const grant = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    renderManager([unreviewed], { bridgeOverrides: { grantCommunityToolConsent: grant } });

    fireEvent.click(await screen.findByText("Review permissions"));
    const review = await screen.findByRole("dialog", { name: "Review permissions" });
    fireEvent.click(within(review).getByRole("button", { name: "Allow" }));
    await waitFor(() => expect(grant).toHaveBeenCalledTimes(1));

    expect(within(review).getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(within(review).getByRole("button", { name: "Allow" })).toBeDisabled();
    fireEvent.click(within(review).getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(review, { key: "Escape" });
    fireEvent.click(within(review).getByRole("button", { name: "Close" }));
    expect(screen.getByRole("dialog", { name: "Review permissions" })).toBeInTheDocument();

    finish();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Review permissions" })).not.toBeInTheDocument());
  });

  it("Remove calls removeCommunityTool and the row disappears", async () => {
    const { calls } = renderManager([communityTool("acme.demo")]);

    expect(await screen.findByText("Demo tool")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(screen.queryByText("Demo tool")).not.toBeInTheDocument());
    expect(calls.remove).toHaveBeenCalledWith("acme.demo");
    expect(screen.getByLabelText("community ids").textContent).toBe("");
  });

  it("Reload re-reads the list", async () => {
    const { calls, setTools } = renderManager([communityTool("acme.demo")]);
    await screen.findByText("Demo tool");
    const before = calls.list.mock.calls.length;

    setTools([communityTool("acme.demo", {}, "Renamed tool")]);
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));

    expect(await screen.findByText("Renamed tool")).toBeInTheDocument();
    expect(calls.list.mock.calls.length).toBeGreaterThan(before);
  });

  it("Load from folder does nothing when the picker is cancelled, and refreshes when a folder is chosen", async () => {
    const { calls, setTools } = renderManager([]);
    await screen.findByRole("dialog", { name: "Community tools" });
    const before = calls.list.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: /Load from folder…/ }));
    await waitFor(() => expect(calls.add).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    const added = communityTool("acme.added", { consentGranted: false }, "Added tool");
    calls.add.mockResolvedValueOnce(added);
    setTools([added]);
    fireEvent.click(screen.getByRole("button", { name: /Load from folder…/ }));

    expect(await screen.findByText("Added tool")).toBeInTheDocument();
    expect(calls.list.mock.calls.length).toBeGreaterThan(before);
  });

  it("shows a refused call's message without Electron's prefix", async () => {
    const { calls } = renderManager([]);
    await screen.findByRole("dialog", { name: "Community tools" });
    calls.add.mockRejectedValueOnce(
      new Error(
        "Error invoking remote method 'add-community-tool-from-folder': Error: A tool with id \"x.y\" is already loaded",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: /Load from folder…/ }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent('A tool with id "x.y" is already loaded');
    expect(alert).not.toHaveTextContent("Error invoking remote method");
  });

  it("shows the error when listing fails and offers no tools", async () => {
    renderManager([], {
      bridgeOverrides: {
        listCommunityTools: async () => {
          throw new Error("Error invoking remote method 'list-community-tools': Error: disk unreadable");
        },
      },
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("disk unreadable");
    expect(alert).not.toHaveTextContent("Error invoking remote method");
    expect(screen.getByLabelText("community ids").textContent).toBe("");
  });

  it("opens from the File menu event", async () => {
    const view = renderManager([]);
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Community tools" })).not.toBeInTheDocument());

    view.bridge.emitOpenCommunityTools();

    expect(await screen.findByRole("dialog", { name: "Community tools" })).toBeInTheDocument();
  });
});
