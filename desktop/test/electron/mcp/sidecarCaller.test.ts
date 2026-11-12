import { describe, expect, it, vi } from "vitest";
import { createSidecarCaller } from "../../../src/electron/mcp/sidecarCaller";
import type { ResolvedConnection } from "../../../src/electron/mcp/types";

const conn: ResolvedConnection = {
  displayName: "A · Dev",
  auth: { id: "id-dev", envUrl: "https://a.crm.dynamics.com", crmType: "online", token: "SECRET-TOKEN" },
};

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

describe("createSidecarCaller", () => {
  it("sends the secret and connection headers", async () => {
    const fetchFake = vi.fn(async () => json(200, { ok: 1 }));
    const call = createSidecarCaller({ baseUrl: "http://127.0.0.1:1", secret: "s3", fetch: fetchFake as never });
    expect(await call(conn, "POST", "/api/community-tools/data/fetch", { a: 1 })).toEqual({ ok: 1 });
    const [url, init] = fetchFake.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:1/api/community-tools/data/fetch");
    expect(init.headers).toMatchObject({
      "X-Local-Secret": "s3",
      Authorization: "Bearer SECRET-TOKEN",
      "X-Environment-Url": "https://a.crm.dynamics.com",
      "Content-Type": "application/json",
    });
    expect(init.body).toBe('{"a":1}');
  });

  it("maps a sidecar error body to an agent error", async () => {
    const fetchFake = vi.fn(async () => json(502, { code: "DataverseFault", message: "Boom", dataverseCode: 5 }));
    const call = createSidecarCaller({ baseUrl: "http://x", secret: "s", fetch: fetchFake as never });
    await expect(call(conn, "GET", "/p")).rejects.toMatchObject({
      code: "DataverseFault",
      message: "Boom",
      extra: { dataverseCode: 5 },
    });
  });

  it("flags errors built from the sidecar's message as untrusted, and others not", async () => {
    const withBody = createSidecarCaller({ baseUrl: "http://x", secret: "s", fetch: vi.fn(async () => json(400, { code: "InvalidRequest", message: "bad" })) as never });
    await expect(withBody(conn, "GET", "/p")).rejects.toMatchObject({ untrusted: true });
    const noBody = createSidecarCaller({ baseUrl: "http://x", secret: "s", fetch: vi.fn(async () => new Response("<html>", { status: 500 })) as never });
    await expect(noBody(conn, "GET", "/p")).rejects.toMatchObject({ untrusted: false });
  });

  it("maps PermissionDenied to DataverseFault", async () => {
    const fetchFake = vi.fn(async () => json(403, { code: "PermissionDenied", message: "No" }));
    const call = createSidecarCaller({ baseUrl: "http://x", secret: "s", fetch: fetchFake as never });
    await expect(call(conn, "GET", "/p")).rejects.toMatchObject({ code: "DataverseFault" });
  });

  it("reads Retry-After from a 429", async () => {
    const fetchFake = vi.fn(async () => json(429, { code: "Throttled", message: "Slow down" }, { "Retry-After": "7" }));
    const call = createSidecarCaller({ baseUrl: "http://x", secret: "s", fetch: fetchFake as never });
    await expect(call(conn, "GET", "/p")).rejects.toMatchObject({ code: "Throttled", extra: { retryAfterSeconds: 7 } });
  });

  it("turns an unknown failure into Internal without leaking details", async () => {
    const fetchFake = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED with SECRET-TOKEN");
    });
    const call = createSidecarCaller({ baseUrl: "http://x", secret: "s", fetch: fetchFake as never });
    const err = (await call(conn, "GET", "/p").catch((e: unknown) => e)) as Error;
    expect(err).toMatchObject({ code: "Internal" });
    expect(err.message).not.toContain("SECRET-TOKEN");
  });

  it("maps a body without a known code to Internal", async () => {
    const fetchFake = vi.fn(async () => new Response("<html>", { status: 500 }));
    const call = createSidecarCaller({ baseUrl: "http://x", secret: "s", fetch: fetchFake as never });
    await expect(call(conn, "GET", "/p")).rejects.toMatchObject({ code: "Internal" });
  });

  it("retries a 401 once for GET and for fetch and retrieve", async () => {
    for (const [method, path] of [
      ["GET", "/api/community-tools/metadata/tables"],
      ["POST", "/api/community-tools/data/fetch"],
      ["POST", "/api/community-tools/data/retrieve"],
    ] as const) {
      const fetchFake = vi.fn()
        .mockResolvedValueOnce(json(401, { code: "NoConnection", message: "expired" }))
        .mockResolvedValueOnce(json(200, { ok: true }));
      const refresh = vi.fn(async (c: ResolvedConnection) => ({ ...c, auth: { ...c.auth, token: "NEW" } }));
      const call = createSidecarCaller({ baseUrl: "http://x", secret: "s", fetch: fetchFake as never, refresh });
      expect(await call(conn, method, path, {})).toEqual({ ok: true });
      expect((fetchFake.mock.calls[1][1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer NEW" });
    }
  });

  it("does not retry a 401 on other POST paths", async () => {
    const fetchFake = vi.fn(async () => json(401, { code: "NoConnection", message: "expired" }));
    const refresh = vi.fn();
    const call = createSidecarCaller({ baseUrl: "http://x", secret: "s", fetch: fetchFake as never, refresh });
    await expect(call(conn, "POST", "/api/community-tools/data/create", {})).rejects.toMatchObject({ code: "NoConnection" });
    expect(fetchFake).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });
});
