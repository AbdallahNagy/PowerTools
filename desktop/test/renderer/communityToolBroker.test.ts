import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConnectionSnapshot, ThemeSnapshot, ToolResponse } from "@powertools/sdk/protocol";
import { createBroker, type BrokerServices } from "../../src/ui/shell/community-tools/broker";

const CONNECTION: ConnectionSnapshot = { displayName: "Contoso", kind: "online" };

function makeServices(overrides: Partial<BrokerServices> = {}): BrokerServices {
  return {
    getConnection: vi.fn(() => CONNECTION),
    callSidecar: vi.fn(async () => ({})),
    toast: vi.fn(),
    setStatus: vi.fn(),
    confirm: vi.fn(async () => true),
    openRecord: vi.fn(),
    openSolution: vi.fn(),
    openFile: vi.fn(async () => ({ name: "a.json", content: "{}" })),
    saveFile: vi.fn(async () => true),
    copyText: vi.fn(async () => undefined),
    dispatchShortcut: vi.fn(),
    storage: {
      get: vi.fn(async () => "stored"),
      set: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    },
    ...overrides,
  };
}

const ALL_PERMISSIONS = ["data:read", "data:write", "data:delete", "metadata:read", "metadata:write", "files"];

function setup(options: { permissions?: string[]; messages?: string[]; services?: Partial<BrokerServices>; maxInFlight?: number } = {}) {
  const channel = new MessageChannel();
  const services = makeServices(options.services);
  const broker = createBroker({
    manifest: { name: "Sample", permissions: options.permissions ?? ALL_PERMISSIONS, messages: options.messages ?? [] },
    port: channel.port1,
    services,
    maxInFlight: options.maxInFlight,
  });
  const received: unknown[] = [];
  const waiters: Array<() => void> = [];
  channel.port2.onmessage = (event) => {
    received.push(event.data);
    waiters.splice(0).forEach((resolve) => resolve());
  };
  async function nextMessage(count = received.length + 1): Promise<void> {
    while (received.length < count) await new Promise<void>((resolve) => waiters.push(resolve));
  }
  async function call(id: number, method: string, args: unknown): Promise<ToolResponse> {
    const before = received.length;
    channel.port2.postMessage({ id, method, args });
    await nextMessage(before + 1);
    return received[before] as ToolResponse;
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
  return { channel, services, broker, received, call, nextMessage, settle };
}

const open: Array<() => void> = [];
function track<T extends ReturnType<typeof setup>>(ctx: T): T {
  open.push(() => {
    ctx.broker.dispose();
    ctx.channel.port2.close();
  });
  return ctx;
}
afterEach(() => open.splice(0).forEach((close) => close()));

describe("community tool broker", () => {
  it("runs a permitted request through the sidecar", async () => {
    const callSidecar = vi.fn(async () => ({ records: [] }));
    const ctx = track(setup({ services: { callSidecar } }));
    const args = { table: "account", id: "1", columns: ["name"] };
    const response = await ctx.call(1, "data.retrieve", args);
    expect(response).toEqual({ id: 1, ok: true, result: { records: [] } });
    expect(callSidecar).toHaveBeenCalledWith("POST", "/api/community-tools/data/retrieve", args);
  });

  it("denies a request without the permission and never calls the sidecar", async () => {
    const ctx = track(setup({ permissions: ["data:read"] }));
    const response = await ctx.call(1, "data.delete", { table: "account", id: "1" });
    expect(response).toMatchObject({ id: 1, ok: false, error: { code: "PermissionDenied" } });
    expect(ctx.services.callSidecar).not.toHaveBeenCalled();
  });

  it("refuses file dialogs without the files permission before calling any service", async () => {
    const ctx = track(setup({ permissions: [] }));
    const open = await ctx.call(1, "shell.openFile", { filters: [] });
    const save = await ctx.call(2, "shell.saveFile", { suggestedName: "a.txt", content: "x" });
    expect(open).toMatchObject({ ok: false, error: { code: "PermissionDenied" } });
    expect(save).toMatchObject({ ok: false, error: { code: "PermissionDenied" } });
    expect(ctx.services.openFile).not.toHaveBeenCalled();
    expect(ctx.services.saveFile).not.toHaveBeenCalled();
  });

  it("maps every sidecar method to its route", async () => {
    const callSidecar = vi.fn(async (_m: string, path: string) => (path.endsWith("/data/create") ? { id: "new-id" } : path.endsWith("/data/execute") ? { results: { A: 1 } } : { ok: 1 }));
    const ctx = track(setup({ services: { callSidecar }, messages: ["WhoAmI"] }));
    const ref = [{ logicalName: "contact", id: "2" }];
    const cases: Array<[string, unknown, string, string, unknown?, unknown?]> = [
      ["data.fetchXml", { fetchXml: "<fetch/>" }, "POST", "/api/community-tools/data/fetch", { fetchXml: "<fetch/>" }],
      ["data.create", { table: "a", values: {} }, "POST", "/api/community-tools/data/create", { table: "a", values: {} }, "new-id"],
      ["data.update", { table: "a", id: "1", values: {} }, "POST", "/api/community-tools/data/update", { table: "a", id: "1", values: {} }],
      ["data.delete", { table: "a", id: "1" }, "POST", "/api/community-tools/data/delete", { table: "a", id: "1" }],
      ["data.associate", { table: "a", id: "1", relationship: "r", related: ref }, "POST", "/api/community-tools/data/associate", { table: "a", id: "1", relationship: "r", related: ref }],
      ["data.disassociate", { table: "a", id: "1", relationship: "r", related: ref }, "POST", "/api/community-tools/data/disassociate", { table: "a", id: "1", relationship: "r", related: ref }],
      ["data.execute", { message: "WhoAmI", parameters: {} }, "POST", "/api/community-tools/data/execute", { message: "WhoAmI", parameters: {} }, { A: 1 }],
      ["data.batch", { operations: [{ op: "delete", table: "a", id: "1" }], continueOnError: true }, "POST", "/api/community-tools/data/batch", { operations: [{ op: "delete", table: "a", id: "1" }], continueOnError: true }],
      ["metadata.tables", {}, "GET", "/api/community-tools/metadata/tables"],
      ["metadata.table", { table: "my table/1" }, "GET", "/api/community-tools/metadata/tables/my%20table%2F1"],
      ["metadata.columns", { table: "account" }, "GET", "/api/community-tools/metadata/tables/account/columns"],
      ["metadata.relationships", { table: "account" }, "GET", "/api/community-tools/metadata/tables/account/relationships"],
      ["metadata.choices", { table: "account", column: "a/b" }, "GET", "/api/community-tools/metadata/tables/account/columns/a%2Fb/choices"],
    ];
    let id = 0;
    for (const [method, args, verb, path, body, result] of cases) {
      callSidecar.mockClear();
      const response = await ctx.call(++id, method, args);
      expect(response, method).toMatchObject({ ok: true });
      if (result !== undefined) expect((response as { result: unknown }).result, method).toEqual(result);
      if (body === undefined) expect(callSidecar).toHaveBeenCalledWith(verb, path);
      else expect(callSidecar).toHaveBeenCalledWith(verb, path, body);
    }
  });

  it("runs at most four sidecar calls at once and completes six in order", async () => {
    let active = 0;
    let peak = 0;
    const started: number[] = [];
    const callSidecar = vi.fn(async (_m: string, _p: string, body?: unknown) => {
      started.push((body as { n: number }).n);
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      return { n: (body as { n: number }).n };
    });
    const ctx = track(setup({ services: { callSidecar } }));
    for (let n = 1; n <= 6; n++) {
      ctx.channel.port2.postMessage({ id: n, method: "data.update", args: { table: "a", id: "1", values: {}, n } });
    }
    await ctx.nextMessage(6);
    expect(peak).toBe(4);
    expect(started).toEqual([1, 2, 3, 4, 5, 6]);
    expect((ctx.received as ToolResponse[]).map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect((ctx.received as ToolResponse[]).every((r) => r.ok)).toBe(true);
  });

  it("does not queue shell calls behind busy sidecar calls", async () => {
    const callSidecar = vi.fn(() => new Promise<unknown>(() => undefined));
    const ctx = track(setup({ services: { callSidecar }, maxInFlight: 1 }));
    ctx.channel.port2.postMessage({ id: 1, method: "data.delete", args: { table: "a", id: "1" } });
    ctx.channel.port2.postMessage({ id: 2, method: "data.delete", args: { table: "a", id: "2" } });
    const response = await ctx.call(3, "shell.copyText", { text: "hi" });
    expect(response).toEqual({ id: 3, ok: true, result: undefined });
    expect(ctx.services.copyText).toHaveBeenCalledWith("hi");
  });

  it("fails data and metadata calls with NoConnection when there is no connection", async () => {
    const ctx = track(setup({ services: { getConnection: vi.fn(() => null) } }));
    expect(await ctx.call(1, "data.retrieve", { table: "a", id: "1", columns: [] })).toMatchObject({ ok: false, error: { code: "NoConnection" } });
    expect(await ctx.call(2, "metadata.tables", {})).toMatchObject({ ok: false, error: { code: "NoConnection" } });
    expect(await ctx.call(3, "connection.get", {})).toEqual({ id: 3, ok: true, result: null });
    expect(ctx.services.callSidecar).not.toHaveBeenCalled();
  });

  it("posts a HostEvent from notifyConnection and notifyTheme", async () => {
    const ctx = track(setup());
    ctx.broker.notifyConnection(CONNECTION);
    ctx.broker.notifyConnection(null);
    const theme: ThemeSnapshot = { name: "dark", tokens: { "--color-canvas": "#000" } };
    ctx.broker.notifyTheme(theme);
    await ctx.nextMessage(3);
    expect(ctx.received).toEqual([
      { type: "event", event: "connection", connection: CONNECTION },
      { type: "event", event: "connection", connection: null },
      { type: "event", event: "theme", theme },
    ]);
  });

  it("answers malformed messages with InvalidRequest only when they carry an id, and keeps working", async () => {
    const ctx = track(setup());
    ctx.channel.port2.postMessage(null);
    ctx.channel.port2.postMessage("x");
    ctx.channel.port2.postMessage({ id: 1 });
    ctx.channel.port2.postMessage({ id: 2, method: "nope", args: {} });
    ctx.channel.port2.postMessage({ id: 3, method: "data.retrieve", args: "nope" });
    ctx.channel.port2.postMessage({ id: 4, method: "data.retrieve", args: { table: "", id: "1", columns: [] } });
    ctx.channel.port2.postMessage({ id: 5, method: "constructor", args: {} });
    await ctx.nextMessage(5);
    expect(ctx.received).toEqual(
      [1, 2, 3, 4, 5].map((id) => ({ id, ok: false, error: { code: "InvalidRequest", message: expect.any(String) } })),
    );
    expect(await ctx.call(6, "shell.toast", { type: "info", message: "hi" })).toEqual({ id: 6, ok: true, result: undefined });
  });

  it("posts nothing after dispose and does not throw", async () => {
    let release: (value: unknown) => void = () => undefined;
    const callSidecar = vi.fn(() => new Promise<unknown>((resolve) => (release = resolve)));
    const ctx = track(setup({ services: { callSidecar } }));
    ctx.channel.port2.postMessage({ id: 1, method: "data.delete", args: { table: "a", id: "1" } });
    await ctx.settle();
    expect(callSidecar).toHaveBeenCalled();
    expect(() => ctx.broker.dispose()).not.toThrow();
    release({});
    await ctx.settle();
    expect(() => ctx.broker.notifyTheme({ name: "light", tokens: {} })).not.toThrow();
    expect(ctx.received).toEqual([]);
  });

  it("turns an unexpected throw into Internal without detail", async () => {
    const boom = new Error("secret path C:\\x");
    const ctx = track(setup({ services: { copyText: vi.fn(async () => { throw boom; }), callSidecar: vi.fn(async () => { throw boom; }) } }));
    const shell = await ctx.call(1, "shell.copyText", { text: "x" });
    const data = await ctx.call(2, "data.delete", { table: "a", id: "1" });
    for (const response of [shell, data]) {
      expect(response).toEqual({ id: response.id, ok: false, error: { code: "Internal", message: "The host could not complete the request." } });
    }
    expect(JSON.stringify(ctx.received)).not.toContain("secret");
  });

  it("passes ToolError-shaped sidecar rejections through", async () => {
    const callSidecar = vi.fn(async () => { throw { code: "DataverseFault", message: "Bad", dataverseCode: -2147220891, extra: "hidden" }; });
    const ctx = track(setup({ services: { callSidecar } }));
    const response = await ctx.call(1, "data.delete", { table: "a", id: "1" });
    expect(response).toEqual({ id: 1, ok: false, error: { code: "DataverseFault", message: "Bad", dataverseCode: -2147220891 } });
  });

  it("routes shell and storage calls to the services", async () => {
    const ctx = track(setup());
    expect(await ctx.call(1, "shell.confirm", { title: "T", message: "M" })).toEqual({ id: 1, ok: true, result: true });
    expect(await ctx.call(2, "shell.openFile", { filters: [{ name: "JSON", extensions: ["json"] }] })).toEqual({ id: 2, ok: true, result: { name: "a.json", content: "{}" } });
    expect(await ctx.call(3, "shell.saveFile", { suggestedName: "a", content: "c" })).toEqual({ id: 3, ok: true, result: true });
    expect(await ctx.call(4, "storage.get", { key: "k" })).toEqual({ id: 4, ok: true, result: "stored" });
    expect(await ctx.call(5, "storage.set", { key: "k", value: { a: 1 } })).toEqual({ id: 5, ok: true, result: undefined });
    expect(ctx.services.storage.set).toHaveBeenCalledWith("k", { a: 1 });
    expect(await ctx.call(6, "shell.shortcut", { key: "k", code: "KeyK", ctrlKey: true, shiftKey: false })).toMatchObject({ ok: true });
    expect(ctx.services.dispatchShortcut).toHaveBeenCalledWith({ key: "k", code: "KeyK", ctrlKey: true, shiftKey: false });
  });
});
