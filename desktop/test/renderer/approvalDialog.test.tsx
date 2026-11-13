import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { McpApprovalRequest } from "../../src/ui/platform/desktopBridge";
import { ApprovalDialog } from "../../src/ui/shell/agents/ApprovalDialog";
import { renderWithProviders } from "../support/render";

function request(over: Partial<McpApprovalRequest> = {}): McpApprovalRequest {
  return {
    id: "req-1",
    tool: "records_update",
    title: "Update record",
    connection: "Contoso · Dev",
    effect: "change",
    summary: "update an account record",
    args: { table: "account", id: "1" },
    ...over,
  };
}

function setup() {
  let present: (r: McpApprovalRequest) => void = () => undefined;
  let dismiss: (id: string) => void = () => undefined;
  const respondMcpApproval = vi.fn(async () => undefined);
  renderWithProviders(<ApprovalDialog />, {
    bridgeOverrides: {
      onMcpApprovalPresent: (cb) => {
        present = cb;
        return () => undefined;
      },
      onMcpApprovalDismiss: (cb) => {
        dismiss = cb;
        return () => undefined;
      },
      respondMcpApproval,
    },
  });
  return {
    present: (r: McpApprovalRequest) => act(() => present(r)),
    dismiss: (id: string) => act(() => dismiss(id)),
    respondMcpApproval,
  };
}

describe("approval dialog", () => {
  it("shows nothing until a request arrives", () => {
    setup();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the title, connection and tool, and no warning for a change", () => {
    const { present } = setup();
    present(request());
    expect(screen.getByText("An agent wants to update an account record")).toBeInTheDocument();
    expect(screen.getByText("Connection: Contoso · Dev")).toBeInTheDocument();
    expect(screen.getByText("Tool: Update record")).toBeInTheDocument();
    expect(screen.queryByText(/It cannot be undone/)).not.toBeInTheDocument();
  });

  it("shows the exact destructive warning", () => {
    const { present } = setup();
    present(request({ effect: "destructive", removes: "record account 1", summary: "delete an account record" }));
    expect(screen.getByText("This removes record account 1 from Contoso · Dev. It cannot be undone.")).toBeInTheDocument();
  });

  it("puts initial focus on Deny", async () => {
    const { present } = setup();
    present(request());
    expect(await screen.findByRole("button", { name: "Deny" })).toHaveFocus();
  });

  it("sends allow and deny from the buttons", () => {
    const { present, respondMcpApproval } = setup();
    present(request());
    fireEvent.click(screen.getByRole("button", { name: "Allow" }));
    expect(respondMcpApproval).toHaveBeenCalledWith("req-1", true);
    present(request({ id: "req-2" }));
    fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    expect(respondMcpApproval).toHaveBeenCalledWith("req-2", false);
  });

  it("treats Escape as Deny", () => {
    const { present, respondMcpApproval } = setup();
    present(request());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(respondMcpApproval).toHaveBeenCalledWith("req-1", false);
  });

  it("removes the dialog when main dismisses the request", () => {
    const { present, dismiss } = setup();
    present(request());
    dismiss("req-1");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows one request at a time, in order", () => {
    const { present } = setup();
    present(request({ id: "a", summary: "do the first thing" }));
    present(request({ id: "b", summary: "do the second thing" }));
    expect(screen.getByText("An agent wants to do the first thing")).toBeInTheDocument();
    expect(screen.queryByText("An agent wants to do the second thing")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    expect(screen.getByText("An agent wants to do the second thing")).toBeInTheDocument();
  });

  it("renders arguments as literal text", () => {
    const { present } = setup();
    present(request({ args: { values: { name: "<img src=x onerror=alert(1)>" } } }));
    expect(document.querySelector("img")).toBeNull();
    const pre = document.querySelector("pre");
    expect(pre?.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});
