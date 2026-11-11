import { createClient, type PowerToolsClient } from "./client";
import {
  CONNECT_MESSAGE,
  PROTOCOL_VERSION,
  type HelloMessage,
  type ReadyMessage,
  type ShortcutSpec,
  type ThemeSnapshot,
} from "./protocol";

const DEFAULT_TIMEOUT_MS = 10_000;

function applyTheme(theme: ThemeSnapshot): void {
  const root = document.documentElement;
  root.dataset.theme = theme.name;
  for (const [name, value] of Object.entries(theme.tokens)) root.style.setProperty(name, value);
}

function matchesShortcut(event: KeyboardEvent, spec: ShortcutSpec): boolean {
  if (event.ctrlKey !== spec.ctrl || event.shiftKey !== spec.shift) return false;
  if (spec.code !== undefined) return event.code === spec.code;
  return event.key.toLowerCase() === spec.key.toLowerCase();
}

function installShortcuts(client: PowerToolsClient, shortcuts: ShortcutSpec[]): void {
  if (shortcuts.length === 0) return;
  window.addEventListener("keydown", (event) => {
    if (!shortcuts.some((spec) => matchesShortcut(event, spec))) return;
    event.preventDefault();
    void client
      .call("shell.shortcut", { key: event.key, code: event.code, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey })
      .catch(() => undefined);
  });
}

function isReady(data: unknown): data is ReadyMessage {
  return typeof data === "object" && data !== null && (data as { type?: unknown }).type === "ready";
}

/**
 * Waits for the host to hand this frame its port, performs the handshake, applies the
 * host theme, and resolves with a connected client.
 */
export function connect(options: { timeoutMs?: number } = {}): Promise<PowerToolsClient> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<PowerToolsClient>((resolve, reject) => {
    let port: MessagePort | null = null;

    const timer = setTimeout(() => {
      fail(new Error(`Timed out waiting for the Power Tools host after ${timeoutMs} ms`));
    }, timeoutMs);

    function cleanup(): void {
      clearTimeout(timer);
      window.removeEventListener("message", onWindowMessage);
    }

    function fail(error: Error): void {
      cleanup();
      if (port) {
        port.onmessage = null;
        port.close();
      }
      reject(error);
    }

    function onReady(event: MessageEvent): void {
      const data: unknown = event.data;
      if (!isReady(data) || !port) return;
      if (data.protocolVersion !== PROTOCOL_VERSION) {
        fail(new Error(`Unsupported host protocol ${data.protocolVersion}`));
        return;
      }
      cleanup();
      applyTheme(data.theme);
      const client = createClient(port, data);
      client.theme.onChange(applyTheme);
      installShortcuts(client, data.shortcuts);
      resolve(client);
    }

    function onWindowMessage(event: MessageEvent): void {
      if (port) return;
      if (event.source !== window.parent) return;
      const data: unknown = event.data;
      if (typeof data !== "object" || data === null || (data as { type?: unknown }).type !== CONNECT_MESSAGE) return;
      if (event.ports.length !== 1) return;
      port = event.ports[0];
      window.removeEventListener("message", onWindowMessage);
      port.onmessage = onReady;
      const hello: HelloMessage = { type: "hello", protocolVersion: PROTOCOL_VERSION };
      port.postMessage(hello);
    }

    window.addEventListener("message", onWindowMessage);
  });
}
