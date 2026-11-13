import { describe, expect, it, vi } from "vitest";
import { createApprovalWindow } from "../../../src/electron/mcp/approvalWindow";
import type { ApprovalRequest } from "../../../src/electron/mcp/approval";

const REQUEST: ApprovalRequest = {
  id: "r1",
  tool: "records_delete",
  title: "Delete record",
  connection: "A · Dev",
  effect: "destructive",
  summary: "delete a record",
  removes: "record account 1",
  args: {},
};

function setup(options: { focused?: boolean; gone?: boolean } = {}) {
  const send = vi.fn();
  const flashFrame = vi.fn();
  const focus = vi.fn();
  const window = {
    isDestroyed: () => false,
    isFocused: () => options.focused ?? true,
    focus,
    flashFrame,
    webContents: { send },
  };
  const notify = vi.fn<(onClick: () => void) => void>();
  const onUnavailable = vi.fn();
  const ui = createApprovalWindow({
    getWindow: () => (options.gone ? null : window),
    notify,
    onUnavailable,
  });
  return { ui, send, flashFrame, focus, notify, onUnavailable };
}

describe("approval window", () => {
  it("sends the request and the dismissal to the main window", () => {
    const { ui, send } = setup();
    ui.present(REQUEST);
    ui.dismiss("r1");
    expect(send).toHaveBeenNthCalledWith(1, "mcp-approval-present", REQUEST);
    expect(send).toHaveBeenNthCalledWith(2, "mcp-approval-dismiss", "r1");
  });

  it("does not notify when the window is focused", () => {
    const { ui, notify, flashFrame } = setup({ focused: true });
    ui.attention();
    expect(notify).not.toHaveBeenCalled();
    expect(flashFrame).not.toHaveBeenCalled();
  });

  it("notifies and flashes when the window is not focused, and focuses it on click", () => {
    const { ui, notify, flashFrame, focus } = setup({ focused: false });
    ui.attention();
    expect(flashFrame).toHaveBeenCalledWith(true);
    expect(notify).toHaveBeenCalledTimes(1);
    notify.mock.calls[0][0]();
    expect(focus).toHaveBeenCalled();
  });

  it("reports unavailable when there is no window", () => {
    const { ui, onUnavailable, send } = setup({ gone: true });
    ui.present(REQUEST);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });
});
