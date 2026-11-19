import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useOpenInBrowser } from "../../src/ui/shared/connections";
import { ToastProvider } from "../../src/ui/shared/ui/Toast";
import { renderWithProviders } from "../support/render";

function OpenButton() {
  const open = useOpenInBrowser("p");
  return (
    <button type="button" onClick={() => void open("https://contoso.crm.dynamics.com/main.aspx")}>
      Open record
    </button>
  );
}

describe("useOpenInBrowser", () => {
  it("says the page is opening before the browser answers", async () => {
    let finish: (value: { fallback: boolean }) => void = () => undefined;
    renderWithProviders(
      <ToastProvider>
        <OpenButton />
      </ToastProvider>,
      {
        bridgeOverrides: {
          openUrlForConnection: () => new Promise((resolve) => { finish = resolve; }),
        },
      },
    );

    fireEvent.click(screen.getByRole("button", { name: "Open record" }));
    expect(await screen.findByText("Opening in your browser…")).toBeInTheDocument();
    finish({ fallback: false });
  });
});
