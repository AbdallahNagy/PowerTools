// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { connect } from "../src/connect";
import { CONNECT_MESSAGE, PROTOCOL_VERSION, type HostEvent, type ReadyMessage, type ToolRequest } from "../src/protocol";

const ready: ReadyMessage = {
  type: "ready",
  protocolVersion: PROTOCOL_VERSION,
  theme: { name: "light", tokens: { "--color-canvas": "#ffffff" } },
  connection: null,
  shortcuts: [{ key: "k", ctrl: true, shift: false }],
};

const ports: MessagePort[] = [];

function sendConnect(source: Window): MessagePort {
  const channel = new MessageChannel();
  ports.push(channel.port1, channel.port2);
  const event = new MessageEvent("message", { data: { type: CONNECT_MESSAGE } });
  Object.defineProperty(event, "source", { value: source });
  Object.defineProperty(event, "ports", { value: [channel.port2] });
  window.dispatchEvent(event);
  return channel.port1;
}

function respondWith(host: MessagePort, message: ReadyMessage): Promise<unknown> {
  return new Promise((resolve) => {
    host.onmessage = (e: MessageEvent) => {
      resolve(e.data);
      host.postMessage(message);
    };
  });
}

afterEach(() => {
  for (const p of ports.splice(0)) p.close();
  document.body.innerHTML = "";
  delete document.documentElement.dataset.theme;
  document.documentElement.removeAttribute("style");
});

describe("connect", () => {
  it("ignores a connect message from a window other than window.parent", async () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const promise = connect({ timeoutMs: 100 });
    const host = sendConnect(iframe.contentWindow as Window);
    let helloSeen = false;
    host.onmessage = () => {
      helloSeen = true;
    };
    await expect(promise).rejects.toThrow(/Timed out/);
    expect(helloSeen).toBe(false);
  });

  it("rejects when the host speaks an unsupported protocol version", async () => {
    const promise = connect({ timeoutMs: 1000 });
    const host = sendConnect(window.parent);
    void respondWith(host, { ...ready, protocolVersion: 2 });
    await expect(promise).rejects.toThrow("Unsupported host protocol 2");
  });

  it("rejects when no connect message arrives within timeoutMs", async () => {
    await expect(connect({ timeoutMs: 20 })).rejects.toThrow(/Timed out/);
  });

  it("sends hello, applies the theme, and resolves after ready", async () => {
    const promise = connect({ timeoutMs: 1000 });
    const host = sendConnect(window.parent);
    const hello = respondWith(host, ready);
    await expect(hello).resolves.toEqual({ type: "hello", protocolVersion: PROTOCOL_VERSION });
    const client = await promise;
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.getPropertyValue("--color-canvas")).toBe("#ffffff");
    expect(client.theme.current()).toEqual(ready.theme);
  });

  it("re-applies the theme on a later theme event", async () => {
    const promise = connect({ timeoutMs: 1000 });
    const host = sendConnect(window.parent);
    void respondWith(host, ready);
    const client = await promise;
    const changed = new Promise((resolve) => client.theme.onChange(resolve));
    host.postMessage({
      type: "event",
      event: "theme",
      theme: { name: "dark", tokens: { "--color-canvas": "#000000" } },
    } satisfies HostEvent);
    await changed;
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.getPropertyValue("--color-canvas")).toBe("#000000");
  });

  it.each([
    ["no theme", { theme: undefined }],
    ["a theme without tokens", { theme: { name: "dark" } }],
    ["a non-string token", { theme: { name: "dark", tokens: { "--x": 1 } } }],
    ["no shortcuts", { shortcuts: undefined }],
    ["a bad shortcut", { shortcuts: [{}] }],
    ["a connection that is not an object", { connection: "Contoso" }],
  ])("rejects, instead of never settling, when ready has %s", async (_name, broken) => {
    const promise = connect({ timeoutMs: 1000 });
    const host = sendConnect(window.parent);
    void respondWith(host, { ...ready, ...broken } as unknown as ReadyMessage);
    await expect(promise).rejects.toThrow("malformed ready message");
  });

  it("removes a token the next theme no longer sets", async () => {
    const promise = connect({ timeoutMs: 1000 });
    const host = sendConnect(window.parent);
    void respondWith(host, { ...ready, theme: { name: "light", tokens: { "--color-canvas": "#fff", "--color-extra": "red" } } });
    const client = await promise;
    expect(document.documentElement.style.getPropertyValue("--color-extra")).toBe("red");
    const changed = new Promise((resolve) => client.theme.onChange(resolve));

    host.postMessage({ type: "event", event: "theme", theme: { name: "dark", tokens: { "--color-canvas": "#000" } } } satisfies HostEvent);
    await changed;

    expect(document.documentElement.style.getPropertyValue("--color-extra")).toBe("");
    expect(document.documentElement.style.getPropertyValue("--color-canvas")).toBe("#000");
  });

  it("does not forward a shortcut chord that also holds Alt or Meta", async () => {
    const promise = connect({ timeoutMs: 1000 });
    const host = sendConnect(window.parent);
    void respondWith(host, ready);
    await promise;
    const requests: ToolRequest[] = [];
    host.onmessage = (e: MessageEvent) => requests.push(e.data as ToolRequest);

    const alt = new KeyboardEvent("keydown", { key: "k", code: "KeyK", ctrlKey: true, altKey: true, cancelable: true });
    const meta = new KeyboardEvent("keydown", { key: "k", code: "KeyK", ctrlKey: true, metaKey: true, cancelable: true });
    window.dispatchEvent(alt);
    window.dispatchEvent(meta);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(alt.defaultPrevented).toBe(false);
    expect(meta.defaultPrevented).toBe(false);
    expect(requests).toEqual([]);
  });

  it("forwards a matching shell shortcut and prevents its default", async () => {
    const promise = connect({ timeoutMs: 1000 });
    const host = sendConnect(window.parent);
    void respondWith(host, ready);
    await promise;
    const request = new Promise<ToolRequest>((resolve) => {
      host.onmessage = (e: MessageEvent) => resolve(e.data as ToolRequest);
    });

    const other = new KeyboardEvent("keydown", { key: "k", ctrlKey: false, cancelable: true });
    window.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);

    const match = new KeyboardEvent("keydown", { key: "K", code: "KeyK", ctrlKey: true, cancelable: true });
    window.dispatchEvent(match);
    expect(match.defaultPrevented).toBe(true);
    const req = await request;
    expect(req.method).toBe("shell.shortcut");
    expect(req.args).toEqual({ key: "K", code: "KeyK", ctrlKey: true, shiftKey: false });
  });
});
