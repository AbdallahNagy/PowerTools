import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LoadedCommunityTool } from "../../src/ui/platform/desktopBridge";
import { StatusBarProvider, useStatusItems } from "../../src/ui/shared/status";
import { ShellShortcutDispatchContext } from "../../src/ui/shell/keyboard/useShellShortcuts";
import { CommunityToolFrame } from "../../src/ui/shell/community-tools/CommunityToolFrame";
import { FORWARDED_SHORTCUTS } from "../../src/ui/shell/community-tools/themeSnapshot";
import { TabProviderContext, type TabContextValue } from "../../src/ui/shell/tabs/TabProviderContext";
import { ToolRuntimeContext } from "../../src/ui/shell/tool-runtime/ToolRuntimeContext";
import type { DesktopBridgeOverrides } from "../support/desktopBridge";
import { renderWithProviders } from "../support/render";

const tool: LoadedCommunityTool = {
  id: "acme.demo",
  folder: "C:\\tools\\demo",
  status: "ready",
  errors: [],
  iconDataUrl: null,
  consentGranted: true,
  manifest: {
    manifestVersion: 1,
    id: "acme.demo",
    name: "Demo tool",
    description: "A demo",
    version: "1.0.0",
    publisher: { name: "Acme" },
    icon: "icon.svg",
    entry: "dist/index.html",
    minHostVersion: "0.0.0",
    permissions: [],
    messages: [],
    network: [],
    allowMultipleInstances: true,
  },
};

function StatusProbe() {
  const items = useStatusItems();
  return <output aria-label="status items">{items.map((item) => String(item.content)).join("|")}</output>;
}

function renderFrame(
  dispatch: ((keys: { key: string; code?: string; ctrlKey: boolean; shiftKey: boolean }) => void) | null = null,
  activeTabId: string | null = null,
  options: { tool?: LoadedCommunityTool; bridgeOverrides?: DesktopBridgeOverrides } = {},
) {
  const shown = options.tool ?? tool;
  // `showFrame` lets a test remove the frame while the status probe stays mounted.
  const tree = (showFrame: boolean) => {
    const frame = showFrame ? (
      <ToolRuntimeContext.Provider value={{ toolId: shown.id, instanceId: "tab-1", connectionId: null }}>
        <CommunityToolFrame tool={shown} />
      </ToolRuntimeContext.Provider>
    ) : null;
    return (
      <StatusBarProvider>
        <ShellShortcutDispatchContext.Provider value={dispatch}>
          {activeTabId === null || frame === null ? (
            frame
          ) : (
            <TabProviderContext.Provider value={{ activeTabId } as TabContextValue}>{frame}</TabProviderContext.Provider>
          )}
          <StatusProbe />
        </ShellShortcutDispatchContext.Provider>
      </StatusBarProvider>
    );
  };
  const view = renderWithProviders(tree(true), { bridgeOverrides: options.bridgeOverrides });
  return { ...view, removeFrame: () => view.rerender(tree(false)) };
}

/** Fires the frame's load and captures the port the host transfers to it. */
function loadFrame(): { port: MessagePort; postMessage: ReturnType<typeof vi.fn> } {
  const iframe = screen.getByTitle("Demo tool") as HTMLIFrameElement;
  const postMessage = vi.fn();
  Object.defineProperty(iframe, "contentWindow", { configurable: true, value: { postMessage } });
  fireEvent.load(iframe);
  expect(postMessage).toHaveBeenCalledTimes(1);
  const transfer = postMessage.mock.calls[0][2] as MessagePort[];
  return { port: transfer[0], postMessage };
}

function nextMessage(port: MessagePort): Promise<unknown> {
  return new Promise((resolve) => {
    port.onmessage = (event) => resolve(event.data);
  });
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("style");
});

describe("CommunityToolFrame", () => {
  it("renders a sandboxed frame on the tool's own origin", () => {
    renderFrame();
    const iframe = screen.getByTitle("Demo tool");
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe.getAttribute("src")).toBe("pt-tool://acme.demo/dist/index.html");
  });

  it("answers hello with ready, the theme and the forwarded shortcuts", async () => {
    document.documentElement.dataset.theme = "light";
    document.documentElement.style.setProperty("--color-canvas", "#f6f7f9");
    renderFrame();
    const { port, postMessage } = loadFrame();
    expect(postMessage.mock.calls[0][0]).toEqual({ type: "pt-tool:connect" });
    expect(postMessage.mock.calls[0][1]).toBe("*");

    const reply = nextMessage(port);
    port.postMessage({ type: "hello", protocolVersion: 1 });
    expect(await reply).toEqual({
      type: "ready",
      protocolVersion: 1,
      theme: { name: "light", tokens: { "--color-canvas": "#f6f7f9" } },
      connection: null,
      shortcuts: FORWARDED_SHORTCUTS,
    });
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining("acme.demo"));
    port.close();
  });

  it("shows the error state for an unsupported protocol version", async () => {
    renderFrame();
    const { port } = loadFrame();
    port.postMessage({ type: "hello", protocolVersion: 99 });
    expect(await screen.findByText("This tool did not start")).toBeInTheDocument();
    expect(screen.queryByTitle("Demo tool")).not.toBeInTheDocument();
    port.close();
  });

  it("shows the error state after 10 seconds without hello and reloads a fresh frame", () => {
    vi.useFakeTimers();
    renderFrame();
    const first = screen.getByTitle("Demo tool");

    act(() => {
      vi.advanceTimersByTime(9_999);
    });
    expect(screen.queryByText("This tool did not start")).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText("This tool did not start")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    const second = screen.getByTitle("Demo tool");
    expect(second).not.toBe(first);
    expect(screen.queryByText("This tool did not start")).not.toBeInTheDocument();
  });

  it("posts a theme event when data-theme changes", async () => {
    renderFrame();
    const { port } = loadFrame();
    const ready = nextMessage(port);
    port.postMessage({ type: "hello", protocolVersion: 1 });
    await ready;

    const event = nextMessage(port);
    document.documentElement.dataset.theme = "light";
    expect(await event).toMatchObject({ type: "event", event: "theme", theme: { name: "light" } });
    port.close();
  });

  it("shows status text as plain text, truncated, and clears it when the frame goes away", async () => {
    const { removeFrame, unmount } = renderFrame();
    const { port } = loadFrame();
    const ready = nextMessage(port);
    port.postMessage({ type: "hello", protocolVersion: 1 });
    await ready;

    port.postMessage({ id: 1, method: "shell.setStatus", args: { text: `<b>busy</b>${"x".repeat(300)}` } });
    const probe = screen.getByRole("status", { name: "status items" });
    await waitFor(() => expect(probe.textContent).toContain("<b>busy</b>"));
    expect(probe.textContent).toHaveLength(200);
    expect(probe.querySelector("b")).toBeNull();
    port.close();
    removeFrame();
    await waitFor(() => expect(screen.getByRole("status", { name: "status items" }).textContent).toBe(""));
    unmount();
  });

  it("logs the bundle size next to the handshake time", async () => {
    const getCommunityToolBundleSize = vi.fn(async () => ({ bytes: 2048 * 3, files: 7 }));
    renderFrame(null, null, { bridgeOverrides: { getCommunityToolBundleSize } });
    const { port } = loadFrame();
    const ready = nextMessage(port);
    port.postMessage({ type: "hello", protocolVersion: 1 });
    await ready;

    await waitFor(() =>
      expect(console.info).toHaveBeenCalledWith(expect.stringMatching(/acme\.demo handshake after \d+ ms, bundle 6 KB in 7 files/)),
    );
    expect(getCommunityToolBundleSize).toHaveBeenCalledWith("acme.demo");
    port.close();
  });

  it("still logs the handshake when the bundle size cannot be read", async () => {
    const getCommunityToolBundleSize = vi.fn(async () => {
      throw new Error("gone");
    });
    renderFrame(null, null, { bridgeOverrides: { getCommunityToolBundleSize } });
    const { port } = loadFrame();
    const ready = nextMessage(port);
    port.postMessage({ type: "hello", protocolVersion: 1 });
    await ready;

    await waitFor(() => expect(console.info).toHaveBeenCalledWith(expect.stringMatching(/acme\.demo handshake after \d+ ms$/)));
    port.close();
  });

  it("offers Reload when the tool has no readable manifest", async () => {
    renderFrame(null, null, { tool: { ...tool, manifest: null } });

    expect(screen.getByText("This tool did not start")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  it("resolves a confirmation with the user's choice and with false on unmount", async () => {
    const { unmount } = renderFrame();
    const { port } = loadFrame();
    const ready = nextMessage(port);
    port.postMessage({ type: "hello", protocolVersion: 1 });
    await ready;

    let reply = nextMessage(port);
    port.postMessage({ id: 2, method: "shell.confirm", args: { title: "Sure?", message: "Delete it" } });
    expect(await screen.findByText("Delete it")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await reply).toEqual({ id: 2, ok: true, result: true });

    reply = nextMessage(port);
    port.postMessage({ id: 3, method: "shell.confirm", args: { title: "Sure?", message: "Again" } });
    expect(await screen.findByText("Again")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(await reply).toEqual({ id: 3, ok: true, result: false });
    unmount();
    port.close();
  });

  it("forwards a shell shortcut from the frame to the shell dispatcher", async () => {
    const dispatch = vi.fn();
    renderFrame(dispatch);
    const { port } = loadFrame();
    const ready = nextMessage(port);
    port.postMessage({ type: "hello", protocolVersion: 1 });
    await ready;

    const reply = nextMessage(port);
    const keys = { key: "w", code: "KeyW", ctrlKey: true, shiftKey: false };
    port.postMessage({ id: 4, method: "shell.shortcut", args: keys });
    await reply;
    expect(dispatch).toHaveBeenCalledWith(keys);
    port.close();
  });

  it("ignores a shell shortcut while its tab is not the active tab, and answers confirm with Cancelled", async () => {
    const dispatch = vi.fn();
    renderFrame(dispatch, "tab-2");
    const { port } = loadFrame();
    const ready = nextMessage(port);
    port.postMessage({ type: "hello", protocolVersion: 1 });
    await ready;

    let reply = nextMessage(port);
    port.postMessage({ id: 4, method: "shell.shortcut", args: { key: "w", code: "KeyW", ctrlKey: true, shiftKey: false } });
    expect(await reply).toEqual({ id: 4, ok: true });
    expect(dispatch).not.toHaveBeenCalled();

    reply = nextMessage(port);
    port.postMessage({ id: 5, method: "shell.confirm", args: { title: "T", message: "Hidden" } });
    expect(await reply).toEqual({
      id: 5,
      ok: false,
      error: { code: "Cancelled", message: "This tool is not in the active tab." },
    });
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
    port.close();
  });

  it("forwards a shell shortcut when its own tab is the active tab", async () => {
    const dispatch = vi.fn();
    renderFrame(dispatch, "tab-1");
    const { port } = loadFrame();
    const ready = nextMessage(port);
    port.postMessage({ type: "hello", protocolVersion: 1 });
    await ready;

    const reply = nextMessage(port);
    const keys = { key: "w", code: "KeyW", ctrlKey: true, shiftKey: false };
    port.postMessage({ id: 4, method: "shell.shortcut", args: keys });
    await reply;
    expect(dispatch).toHaveBeenCalledWith(keys);
    port.close();
  });

  it("hands over the port only on the first load; a second load disposes the tool and shows the error state", async () => {
    renderFrame();
    const { port, postMessage } = loadFrame();
    const ready = nextMessage(port);
    port.postMessage({ type: "hello", protocolVersion: 1 });
    await ready;

    const iframe = screen.getByTitle("Demo tool");
    fireEvent.load(iframe);
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("This tool did not start")).toBeInTheDocument();

    // The broker is gone: a request on the old port gets no reply.
    const replies: unknown[] = [];
    port.onmessage = (event) => replies.push(event.data);
    port.postMessage({ id: 9, method: "shell.setStatus", args: { text: "late" } });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(replies).toEqual([]);
    expect(screen.getByRole("status", { name: "status items" }).textContent).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    const fresh = loadFrame();
    expect(fresh.postMessage).toHaveBeenCalledTimes(1);
    fresh.port.close();
    port.close();
  });

  it("closes the port on unmount", async () => {
    const { unmount } = renderFrame();
    const { port } = loadFrame();
    const ready = nextMessage(port);
    port.postMessage({ type: "hello", protocolVersion: 1 });
    await ready;

    const closed = new Promise<void>((resolve) => port.addEventListener("close", () => resolve()));
    unmount();
    await closed;
  });
});
