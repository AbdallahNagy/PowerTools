import { afterEach, describe, expect, it } from "vitest";
import { createClient, ToolClientError, type PowerToolsClient } from "../src/client";
import type { HostEvent, ReadyMessage, ThemeSnapshot, ToolRequest, ToolResponse } from "../src/protocol";

const GUID = "00000000-0000-0000-0000-000000000001";

const ready: ReadyMessage = {
  type: "ready",
  protocolVersion: 1,
  theme: { name: "dark", tokens: { "--color-canvas": "#000" } },
  connection: { displayName: "Dev", kind: "online" },
  shortcuts: [],
};

const channels: MessageChannel[] = [];

function setup(): { client: PowerToolsClient; host: MessagePort; requests: ToolRequest[] } {
  const channel = new MessageChannel();
  channels.push(channel);
  const requests: ToolRequest[] = [];
  const host = channel.port2;
  host.onmessage = (e: MessageEvent) => requests.push(e.data as ToolRequest);
  const client = createClient(channel.port1, ready);
  return { client, host, requests };
}

async function waitFor<T>(get: () => T | undefined): Promise<T> {
  for (let i = 0; i < 100; i++) {
    const value = get();
    if (value !== undefined) return value;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("waitFor timed out");
}

afterEach(() => {
  for (const c of channels.splice(0)) {
    c.port1.close();
    c.port2.close();
  }
});

describe("createClient", () => {
  it("posts a data.retrieve request with its args", async () => {
    const { client, requests } = setup();
    void client.data.retrieve("account", GUID, ["name"]);
    const req = await waitFor(() => requests[0]);
    expect(req).toEqual({ id: 1, method: "data.retrieve", args: { table: "account", id: GUID, columns: ["name"] } });
  });

  it("resolves with result on an ok reply", async () => {
    const { client, host, requests } = setup();
    const promise = client.data.retrieve("account", GUID, ["name"]);
    const req = await waitFor(() => requests[0]);
    const record = { logicalName: "account", id: GUID, values: { name: "A" }, formatted: {} };
    host.postMessage({ id: req.id, ok: true, result: record } satisfies ToolResponse);
    await expect(promise).resolves.toEqual(record);
  });

  it("rejects with ToolClientError on an error reply", async () => {
    const { client, host, requests } = setup();
    const promise = client.data.delete("account", GUID);
    const req = await waitFor(() => requests[0]);
    host.postMessage({
      id: req.id,
      ok: false,
      error: { code: "DataverseFault", message: "boom", dataverseCode: -2147220891 },
    } satisfies ToolResponse);
    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ToolClientError);
    expect(error).toMatchObject({ code: "DataverseFault", message: "boom", dataverseCode: -2147220891 });
  });

  it("matches replies to their own ids when they arrive in reverse order", async () => {
    const { client, host, requests } = setup();
    const first = client.storage.get("a");
    const second = client.storage.get("b");
    await waitFor(() => requests[1]);
    host.postMessage({ id: requests[1].id, ok: true, result: "B" } satisfies ToolResponse);
    host.postMessage({ id: requests[0].id, ok: true, result: "A" } satisfies ToolResponse);
    await expect(first).resolves.toBe("A");
    await expect(second).resolves.toBe("B");
  });

  it("ignores a reply with an unknown id", async () => {
    const { client, host, requests } = setup();
    const promise = client.storage.get("a");
    const req = await waitFor(() => requests[0]);
    host.postMessage({ id: 999, ok: true, result: "wrong" } satisfies ToolResponse);
    host.postMessage({ id: req.id, ok: true, result: "right" } satisfies ToolResponse);
    await expect(promise).resolves.toBe("right");
  });

  it("calls theme.onChange listeners on a theme event and updates theme.current", async () => {
    const { client, host } = setup();
    expect(client.theme.current()).toEqual(ready.theme);
    const seen: ThemeSnapshot[] = [];
    client.theme.onChange((t) => seen.push(t));
    const theme: ThemeSnapshot = { name: "light", tokens: { "--color-canvas": "#fff" } };
    host.postMessage({ type: "event", event: "theme", theme } satisfies HostEvent);
    await waitFor(() => seen[0]);
    expect(seen).toEqual([theme]);
    expect(client.theme.current()).toEqual(theme);
  });

  it("calls connection.onChange listeners on a connection event until unsubscribed", async () => {
    const { client, host } = setup();
    const seen: unknown[] = [];
    const unsubscribe = client.connection.onChange((c) => seen.push(c));
    host.postMessage({ type: "event", event: "connection", connection: null } satisfies HostEvent);
    await waitFor(() => (seen.length ? seen : undefined));
    expect(seen).toEqual([null]);
    unsubscribe();
    const snapshot = { displayName: "Other", kind: "onpremise" } as const;
    host.postMessage({ type: "event", event: "connection", connection: snapshot } satisfies HostEvent);
    await new Promise((r) => setTimeout(r, 20));
    expect(seen).toEqual([null]);
  });

  it("sends retrieveMultiple as data.fetchXml with built FetchXML", async () => {
    const { client, requests } = setup();
    void client.data.retrieveMultiple("account", { select: ["name"], top: 5 });
    const req = await waitFor(() => requests[0]);
    expect(req.method).toBe("data.fetchXml");
    expect(req.args).toEqual({
      fetchXml: '<fetch top="5"><entity name="account"><attribute name="name" /></entity></fetch>',
    });
  });

  it("sends execute, batch, setStatus, and choices args with the shared names", async () => {
    const { client, requests } = setup();
    void client.data.execute("WhoAmI", {});
    void client.data.batch([{ op: "delete", table: "account", id: GUID }]);
    void client.shell.setStatus(null);
    void client.metadata.choices("account", "industrycode");
    await waitFor(() => requests[3]);
    expect(requests.map((r) => [r.method, r.args])).toEqual([
      ["data.execute", { message: "WhoAmI", parameters: {} }],
      ["data.batch", { operations: [{ op: "delete", table: "account", id: GUID }], continueOnError: false }],
      ["shell.setStatus", { text: null }],
      ["metadata.choices", { table: "account", column: "industrycode" }],
    ]);
  });
});
