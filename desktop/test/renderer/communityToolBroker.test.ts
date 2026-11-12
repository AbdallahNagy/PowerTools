import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConnectionSnapshot, ThemeSnapshot, ToolResponse } from "@powertools/sdk/protocol";
import { createBroker, type BrokerServices } from "../../src/ui/shell/community-tools/broker";

const CONNECTION: ConnectionSnapshot = { displayName: "Contoso", kind: "online" };

function makeServices(overrides: Partial<BrokerServices> = {}): BrokerServices {
  return {
    getConnection: vi.fn(() => CONNECTION),
    connectionKey: vi.fn(() => "conn-1"),
    isActive: vi.fn(() => true),
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
    expect(callSidecar).toHaveBeenCalledWith("POST", "/api/community-tools/data/retrieve", args, "conn-1");
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
      ["metadata.table", { table: "my_table1" }, "GET", "/api/community-tools/metadata/tables/my_table1"],
      ["metadata.columns", { table: "account" }, "GET", "/api/community-tools/metadata/tables/account/columns"],
      ["metadata.relationships", { table: "account" }, "GET", "/api/community-tools/metadata/tables/account/relationships"],
      ["metadata.choices", { table: "account", column: "a_b" }, "GET", "/api/community-tools/metadata/tables/account/columns/a_b/choices"],
    ];
    let id = 0;
    for (const [method, args, verb, path, body, result] of cases) {
      callSidecar.mockClear();
      const response = await ctx.call(++id, method, args);
      expect(response, method).toMatchObject({ ok: true });
      if (result !== undefined) expect((response as { result: unknown }).result, method).toEqual(result);
      if (body === undefined) expect(callSidecar).toHaveBeenCalledWith(verb, path, undefined, "conn-1");
      else expect(callSidecar).toHaveBeenCalledWith(verb, path, body, "conn-1");
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

  it("passes a ToolError-shaped rejection through only from the sidecar, not from other services", async () => {
    const shaped = { code: "DataverseFault", message: "from a local service" };
    const ctx = track(setup({ services: { copyText: vi.fn(async () => { throw shaped; }), confirm: vi.fn(async () => { throw shaped; }) } }));
    for (const [id, method, args] of [[1, "shell.copyText", { text: "x" }], [2, "shell.confirm", { title: "T", message: "M" }]] as const) {
      expect(await ctx.call(id, method, args)).toEqual({ id, ok: false, error: { code: "Internal", message: "The host could not complete the request." } });
    }
  });

  it("passes ToolError-shaped sidecar rejections through", async () => {
    const callSidecar = vi.fn(async () => { throw { code: "DataverseFault", message: "Bad", dataverseCode: -2147220891, extra: "hidden" }; });
    const ctx = track(setup({ services: { callSidecar } }));
    const response = await ctx.call(1, "data.delete", { table: "a", id: "1" });
    expect(response).toEqual({ id: 1, ok: false, error: { code: "DataverseFault", message: "Bad", dataverseCode: -2147220891 } });
  });

  it("still runs calls when maxInFlight is not a usable number", async () => {
    for (const maxInFlight of [Number.NaN, Number.POSITIVE_INFINITY, 0, -3]) {
      const ctx = track(setup({ maxInFlight }));
      expect(await ctx.call(1, "data.delete", { table: "a", id: "1" }), String(maxInFlight)).toMatchObject({ ok: true });
    }
  });

  it("hands every toast type to the host, including warning", async () => {
    const ctx = track(setup());
    for (const [n, type] of ["info", "success", "warning", "error"].entries()) {
      await ctx.call(n + 1, "shell.toast", { type, message: "m" });
      expect(ctx.services.toast).toHaveBeenLastCalledWith(type, "m");
    }
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

  it("accepts only a braceless GUID for shell.openSolution", async () => {
    const ctx = track(setup());
    const id = "22222222-2222-2222-2222-222222222222";
    expect(await ctx.call(1, "shell.openSolution", { solutionId: id })).toEqual({ id: 1, ok: true, result: undefined });
    expect(ctx.services.openSolution).toHaveBeenCalledWith(id);
    for (const [n, bad] of [`{${id}}`, "MySolution", "", 5, undefined].entries()) {
      expect(await ctx.call(10 + n, "shell.openSolution", { solutionId: bad })).toMatchObject({
        ok: false,
        error: { code: "InvalidRequest" },
      });
    }
    expect(ctx.services.openSolution).toHaveBeenCalledTimes(1);
  });

  describe("argument checks", () => {
    it.each([
      ["page", 0], ["page", -1], ["page", 1.5], ["page", "2"], ["page", Number.NaN],
      ["pageSize", 0], ["pageSize", 2.5], ["pageSize", -10], ["pageSize", "5"],
    ])("rejects %s = %j for data.fetchXml", async (field, value) => {
      const ctx = track(setup());
      const response = await ctx.call(1, "data.fetchXml", { fetchXml: "<fetch/>", [field]: value });
      expect(response).toMatchObject({ ok: false, error: { code: "InvalidRequest" } });
      expect(ctx.services.callSidecar).not.toHaveBeenCalled();
    });

    it("accepts integer paging values of 1 or more", async () => {
      const ctx = track(setup());
      expect(await ctx.call(1, "data.fetchXml", { fetchXml: "<fetch/>", page: 1, pageSize: 5000 })).toMatchObject({ ok: true });
    });

    it.each(["metadata.table", "metadata.columns", "metadata.relationships"])("%s rejects table names that are not identifiers", async (method) => {
      const ctx = track(setup());
      let id = 0;
      for (const table of [".", "..", "a/b", "a b", "1abc", "a.b", "a%2Fb", "a?x"]) {
        expect(await ctx.call(++id, method, { table }), table).toMatchObject({ ok: false, error: { code: "InvalidRequest" } });
      }
      expect(ctx.services.callSidecar).not.toHaveBeenCalled();
      expect(await ctx.call(++id, method, { table: "_new_Table9" })).toMatchObject({ ok: true });
    });

    it("metadata.choices rejects a table or column that is not an identifier", async () => {
      const ctx = track(setup());
      expect(await ctx.call(1, "metadata.choices", { table: "account", column: ".." })).toMatchObject({ ok: false, error: { code: "InvalidRequest" } });
      expect(await ctx.call(2, "metadata.choices", { table: "..", column: "name" })).toMatchObject({ ok: false, error: { code: "InvalidRequest" } });
      expect(await ctx.call(3, "metadata.choices", { table: "account", column: "a/b" })).toMatchObject({ ok: false, error: { code: "InvalidRequest" } });
      expect(ctx.services.callSidecar).not.toHaveBeenCalled();
      expect(await ctx.call(4, "metadata.choices", { table: "account", column: "statuscode" })).toMatchObject({ ok: true });
    });
  });

  describe("connection changes", () => {
    function controlled() {
      let key: string | null = "conn-A";
      const releases: Array<() => void> = [];
      const seen: Array<{ n: number; key: string | null }> = [];
      const callSidecar = vi.fn((_m: string, _p: string, body?: unknown, k?: string | null) => {
        seen.push({ n: (body as { n: number }).n, key: k ?? null });
        return new Promise<unknown>((resolve) => releases.push(() => resolve({ n: (body as { n: number }).n })));
      });
      const ctx = track(setup({ maxInFlight: 2, services: { callSidecar, connectionKey: vi.fn(() => key) } }));
      const send = (n: number) =>
        ctx.channel.port2.postMessage({ id: n, method: "data.update", args: { table: "a", id: "1", values: {}, n } });
      return { ctx, send, callSidecar, seen, releases, setKey: (k: string | null) => (key = k) };
    }

    it("cancels queued calls when the connection changes and lets started calls finish", async () => {
      const { ctx, send, callSidecar, seen, releases, setKey } = controlled();
      [1, 2, 3, 4].forEach(send);
      await ctx.settle();
      expect(seen.map((s) => s.n)).toEqual([1, 2]);
      setKey("conn-B");
      releases.splice(0).forEach((release) => release());
      await ctx.nextMessage(4);
      const byId = new Map((ctx.received as ToolResponse[]).map((r) => [r.id, r]));
      expect(byId.get(1)).toMatchObject({ ok: true });
      expect(byId.get(2)).toMatchObject({ ok: true });
      const cancelled = { ok: false, error: { code: "Cancelled", message: "The connection changed before this call ran." } };
      expect(byId.get(3)).toMatchObject(cancelled);
      expect(byId.get(4)).toMatchObject(cancelled);
      expect(callSidecar).toHaveBeenCalledTimes(2);
      expect(seen.every((s) => s.key === "conn-A")).toBe(true);
    });

    it("rejects queued calls as soon as notifyConnection runs", async () => {
      const { ctx, send, callSidecar, setKey } = controlled();
      [1, 2, 3].forEach(send);
      await ctx.settle();
      setKey("conn-B");
      ctx.broker.notifyConnection({ displayName: "Other", kind: "online" });
      await ctx.settle();
      expect(ctx.received).toContainEqual({ id: 3, ok: false, error: { code: "Cancelled", message: "The connection changed before this call ran." } });
      expect(callSidecar).toHaveBeenCalledTimes(2);
    });

    it("runs a call made after the change against the new key", async () => {
      const { ctx, send, seen, releases, setKey } = controlled();
      send(1);
      await ctx.settle();
      setKey("conn-B");
      send(2);
      await ctx.settle();
      expect(seen).toEqual([{ n: 1, key: "conn-A" }, { n: 2, key: "conn-B" }]);
      releases.splice(0).forEach((release) => release());
    });
  });

  describe("inactive tab", () => {
    const inactive = () => track(setup({ services: { isActive: vi.fn(() => false) } }));
    const cancelled = { ok: false, error: { code: "Cancelled", message: "This tool is not in the active tab." } };

    it("ignores shell.shortcut but still replies ok", async () => {
      const ctx = inactive();
      expect(await ctx.call(1, "shell.shortcut", { key: "w", code: "KeyW", ctrlKey: true, shiftKey: false })).toEqual({ id: 1, ok: true, result: undefined });
      expect(ctx.services.dispatchShortcut).not.toHaveBeenCalled();
    });

    it("cancels shell.confirm", async () => {
      const ctx = inactive();
      expect(await ctx.call(1, "shell.confirm", { title: "T", message: "M" })).toMatchObject(cancelled);
      expect(ctx.services.confirm).not.toHaveBeenCalled();
    });

    it("cancels shell.openFile", async () => {
      const ctx = inactive();
      expect(await ctx.call(1, "shell.openFile", { filters: [] })).toMatchObject(cancelled);
      expect(ctx.services.openFile).not.toHaveBeenCalled();
    });

    it("cancels shell.saveFile", async () => {
      const ctx = inactive();
      expect(await ctx.call(1, "shell.saveFile", { suggestedName: "a", content: "c" })).toMatchObject(cancelled);
      expect(ctx.services.saveFile).not.toHaveBeenCalled();
    });

    it("cancels shell.copyText, shell.openRecord and shell.openSolution", async () => {
      const ctx = inactive();
      expect(await ctx.call(1, "shell.copyText", { text: "x" })).toMatchObject(cancelled);
      expect(await ctx.call(2, "shell.openRecord", { table: "account", id: "1" })).toMatchObject(cancelled);
      expect(await ctx.call(3, "shell.openSolution", { solutionId: "22222222-2222-2222-2222-222222222222" })).toMatchObject(cancelled);
      expect(ctx.services.copyText).not.toHaveBeenCalled();
      expect(ctx.services.openRecord).not.toHaveBeenCalled();
      expect(ctx.services.openSolution).not.toHaveBeenCalled();
    });

    it("still runs all of those when the tab is active", async () => {
      const ctx = track(setup());
      await ctx.call(1, "shell.shortcut", { key: "w", code: "KeyW", ctrlKey: true, shiftKey: false });
      await ctx.call(2, "shell.confirm", { title: "T", message: "M" });
      await ctx.call(3, "shell.openFile", { filters: [] });
      await ctx.call(4, "shell.saveFile", { suggestedName: "a", content: "c" });
      await ctx.call(5, "shell.copyText", { text: "x" });
      await ctx.call(6, "shell.openRecord", { table: "account", id: "1" });
      await ctx.call(7, "shell.openSolution", { solutionId: "22222222-2222-2222-2222-222222222222" });
      expect(ctx.services.copyText).toHaveBeenCalled();
      expect(ctx.services.openRecord).toHaveBeenCalled();
      expect(ctx.services.openSolution).toHaveBeenCalled();
      expect(ctx.services.dispatchShortcut).toHaveBeenCalled();
      expect(ctx.services.confirm).toHaveBeenCalled();
      expect(ctx.services.openFile).toHaveBeenCalled();
      expect(ctx.services.saveFile).toHaveBeenCalled();
    });

    it("keeps serving non-interactive calls", async () => {
      const ctx = inactive();
      expect(await ctx.call(1, "shell.toast", { type: "info", message: "hi" })).toMatchObject({ ok: true });
      expect(await ctx.call(2, "storage.get", { key: "k" })).toMatchObject({ ok: true });
    });
  });
});
