import type { ApprovalRequest } from "./approval.js";

export interface ApprovalWindowLike {
  isDestroyed(): boolean;
  isFocused(): boolean;
  focus(): void;
  flashFrame(flag: boolean): void;
  webContents: { send(channel: string, ...args: unknown[]): void };
}

export interface ApprovalWindowDeps {
  getWindow(): ApprovalWindowLike | null;
  /** Shows the "waiting for your approval" notification; `onClick` should bring the window forward. */
  notify(onClick: () => void): void;
  /** There is no window to ask in. */
  onUnavailable(): void;
}

/** Connects the approval gate to the main window: shows and clears the dialog, and draws attention. */
export function createApprovalWindow(deps: ApprovalWindowDeps) {
  const live = () => {
    const window = deps.getWindow();
    return window && !window.isDestroyed() ? window : null;
  };

  return {
    present(request: ApprovalRequest) {
      const window = live();
      if (!window) {
        deps.onUnavailable();
        return;
      }
      window.webContents.send("mcp-approval-present", request);
    },

    dismiss(id: string) {
      live()?.webContents.send("mcp-approval-dismiss", id);
    },

    attention() {
      const window = live();
      if (!window || window.isFocused()) return;
      window.flashFrame(true);
      deps.notify(() => {
        const target = live();
        if (!target) return;
        target.focus();
        target.flashFrame(false);
      });
    },
  };
}
