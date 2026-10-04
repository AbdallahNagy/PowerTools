import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../../../../../../test/support/render";
import { PUBLIC_TOOLS } from "../../../publicCatalog";
import WelcomeTab from "../../index";
import { welcomeTool } from "../../tool";

describe("Welcome tool", () => {
  it("owns the singleton Welcome manifest", () => {
    expect(welcomeTool).toMatchObject({
      id: "welcome",
      title: "Welcome",
      icon: "",
      showInActivityBar: false,
      allowMultipleInstances: false,
      component: WelcomeTab,
    });
  });

  it("opens the PowerTools repository through the desktop bridge", () => {
    const openedUrls: string[] = [];
    renderWithProviders(<WelcomeTab />, {
      bridgeOverrides: {
        openExternalUrl: async (url) => {
          openedUrls.push(url);
        },
      },
    });

    fireEvent.click(screen.getByRole("link", { name: "View on GitHub" }));

    expect(openedUrls).toEqual([
      "https://github.com/AbdallahNagy/PowerTools",
    ]);
  });

  it("lists every public tool from the catalog", () => {
    renderWithProviders(<WelcomeTab />);

    for (const tool of PUBLIC_TOOLS) {
      expect(
        screen.getByRole("heading", { name: tool.title }),
      ).toBeInTheDocument();
      expect(screen.getByText(tool.description)).toBeInTheDocument();
    }
  });
});
