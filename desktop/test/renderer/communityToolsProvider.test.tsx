import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CommunityToolsProvider } from "../../src/ui/shell/community-tools/CommunityToolsProvider";
import { StatusBarProvider } from "../../src/ui/shared/status";
import { ToastProvider } from "../../src/ui/shared/ui";
import { useCommunityTools, useToolRegistry } from "../../src/ui/shell/community-tools/useToolRegistry";
import CommandPalette from "../../src/ui/shell/layout/CommandPalette";
import TabBar from "../../src/ui/shell/tabs/TabBar";
import { TabProvider } from "../../src/ui/shell/tabs/TabContext";
import { useTabs } from "../../src/ui/shell/tabs/useTabs";
import { ACTIVITY_BAR_TOOLS, TOOL_REGISTRY } from "../../src/ui/tools/registry";
import { communityTool } from "../support/communityTools";
import { renderWithProviders } from "../support/render";

function RegistryProbe() {
  const { activityBarTools, toolsById } = useToolRegistry();
  return (
    <>
      <output aria-label="activity ids">{activityBarTools.map((tool) => tool.id).join("|")}</output>
      <output aria-label="registry ids">{Object.keys(toolsById).join("|")}</output>
      <output aria-label="attribute explorer title">{toolsById["attribute-explorer"]?.title}</output>
    </>
  );
}

const demoFrame = () => document.querySelector('iframe[title="Demo tool"]');
const builtInIds = ACTIVITY_BAR_TOOLS.map((tool) => tool.id);

function activityIds(): string[] {
  return screen.getByLabelText("activity ids").textContent!.split("|");
}

describe("community tools in the registry", () => {
  it("puts a ready, consented tool after the built-in tools without changing their order", async () => {
    renderWithProviders(
      <CommunityToolsProvider>
        <RegistryProbe />
      </CommunityToolsProvider>,
      { bridgeOverrides: { listCommunityTools: async () => [communityTool("acme.demo")] } },
    );

    await waitFor(() => expect(activityIds()).toEqual([...builtInIds, "acme.demo"]));
  });

  it("offers nothing while the list is loading", () => {
    renderWithProviders(
      <CommunityToolsProvider>
        <RegistryProbe />
      </CommunityToolsProvider>,
      { bridgeOverrides: { listCommunityTools: () => new Promise(() => undefined) } },
    );

    expect(activityIds()).toEqual(builtInIds);
  });

  it("behaves as if there are no community tools when listing fails", async () => {
    let calls = 0;
    renderWithProviders(
      <CommunityToolsProvider>
        <RegistryProbe />
      </CommunityToolsProvider>,
      {
        bridgeOverrides: {
          listCommunityTools: async () => {
            calls += 1;
            throw new Error("boom");
          },
        },
      },
    );

    await waitFor(() => expect(calls).toBe(1));
    expect(activityIds()).toEqual(builtInIds);
  });

  it("never gives an unconsented, invalid, or missing tool a definition", async () => {
    renderWithProviders(
      <CommunityToolsProvider>
        <RegistryProbe />
      </CommunityToolsProvider>,
      {
        bridgeOverrides: {
          listCommunityTools: async () => [
            communityTool("acme.unreviewed", { consentGranted: false }),
            communityTool("acme.broken", { status: "invalid", errors: ["bad"] }),
            communityTool("acme.gone", { status: "missing" }),
            communityTool("acme.ok"),
          ],
        },
      },
    );

    await waitFor(() => expect(activityIds()).toContain("acme.ok"));
    const registryIds = screen.getByLabelText("registry ids").textContent!.split("|");
    expect(activityIds()).toEqual([...builtInIds, "acme.ok"]);
    expect(registryIds).not.toContain("acme.unreviewed");
    expect(registryIds).not.toContain("acme.broken");
    expect(registryIds).not.toContain("acme.gone");
  });

  it("does not let a community tool replace a built-in tool", async () => {
    renderWithProviders(
      <CommunityToolsProvider>
        <RegistryProbe />
      </CommunityToolsProvider>,
      {
        bridgeOverrides: {
          listCommunityTools: async () => [
            communityTool("attribute-explorer", {}, "Impostor"),
            communityTool("acme.demo"),
          ],
        },
      },
    );

    await waitFor(() => expect(activityIds()).toContain("acme.demo"));
    expect(activityIds()).toEqual([...builtInIds, "acme.demo"]);
    expect(screen.getByLabelText("attribute explorer title").textContent).toBe(
      TOOL_REGISTRY["attribute-explorer"].title,
    );
  });

  it("sorts community tools by title and marks them local", async () => {
    function SourceProbe() {
      const { activityBarTools } = useToolRegistry();
      return (
        <output aria-label="community">
          {activityBarTools
            .filter((tool) => tool.source === "local")
            .map((tool) => tool.title)
            .join("|")}
        </output>
      );
    }
    renderWithProviders(
      <CommunityToolsProvider>
        <SourceProbe />
      </CommunityToolsProvider>,
      {
        bridgeOverrides: {
          listCommunityTools: async () => [
            communityTool("acme.zed", {}, "Zed"),
            communityTool("acme.alpha", {}, "Alpha"),
          ],
        },
      },
    );

    await waitFor(() => expect(screen.getByLabelText("community").textContent).toBe("Alpha|Zed"));
  });

  it("shows a data URL icon as an image, and falls back to a built-in icon without one", async () => {
    const dataUrl = "data:image/svg+xml;base64,PHN2Zy8+";
    renderWithProviders(
      <CommunityToolsProvider>
        <RegistryProbe />
        <CommandPaletteProbe />
      </CommunityToolsProvider>,
      {
        bridgeOverrides: {
          listCommunityTools: async () => [
            communityTool("acme.with-icon", { iconDataUrl: dataUrl }, "With icon"),
            communityTool("acme.no-icon", {}, "No icon"),
          ],
        },
      },
    );

    await waitFor(() => expect(activityIds()).toContain("acme.with-icon"));
    const icons = Array.from(document.querySelectorAll("[data-tool-icon]"));
    const withIcon = icons.find((icon) => icon.getAttribute("data-tool-icon") === dataUrl);
    expect(withIcon?.tagName).toBe("IMG");
    // The tool without an icon still gets a drawn icon, never a broken image.
    const noIconRow = screen.getByText("No icon").closest("li")!;
    expect(noIconRow.querySelector("img")).toBeNull();
    expect(noIconRow.querySelector("[data-tool-icon]")?.tagName).toBe("SPAN");
  });

  it("shows a tab whose tool is no longer loaded as empty, and keeps the tab", async () => {
    let tools = [communityTool("acme.demo")];

    function Controls() {
      const { openTool, tabs } = useTabs();
      const { refresh } = useCommunityTools();
      const { toolsById } = useToolRegistry();
      return (
        <>
          <output aria-label="offered">{"acme.demo" in toolsById ? "yes" : "no"}</output>
          <button onClick={() => openTool("acme.demo")}>open demo</button>
          <button onClick={() => void refresh()}>refresh</button>
          <output aria-label="tab count">{tabs.length}</output>
        </>
      );
    }

    renderWithProviders(
      <ToastProvider>
        <StatusBarProvider>
          <CommunityToolsProvider>
            <TabProvider>
              <Controls />
              <TabBar />
            </TabProvider>
          </CommunityToolsProvider>
        </StatusBarProvider>
      </ToastProvider>,
      { bridgeOverrides: { listCommunityTools: async () => tools } },
    );

    // The tool is not offered until the first list arrives, so wait for it before opening.
    await waitFor(() => expect(screen.getByLabelText("offered").textContent).toBe("yes"));
    fireEvent.click(screen.getByText("open demo"));
    await waitFor(() => expect(demoFrame()).not.toBeNull());
    expect(screen.queryByText("This tool is no longer loaded")).not.toBeInTheDocument();

    tools = [];
    fireEvent.click(screen.getByText("refresh"));

    expect(await screen.findByText("This tool is no longer loaded")).toBeInTheDocument();
    expect(demoFrame()).toBeNull();
    expect(Number(screen.getByLabelText("tab count").textContent)).toBeGreaterThan(1);
  });
});

function CommandPaletteProbe() {
  const { activityBarTools } = useToolRegistry();
  return <CommandPalette open tools={activityBarTools} onClose={() => undefined} onOpen={() => undefined} />;
}
