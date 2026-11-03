import { request } from "http";
import { afterEach, describe, expect, it } from "vitest";
import {
  CancellableLoopbackClient,
  SignInCancelledError,
} from "../../src/electron/cancellableLoopbackClient.ts";

async function waitForRedirectUri(client: CancellableLoopbackClient): Promise<string> {
  for (let i = 0; i < 100; i++) {
    try {
      return client.getRedirectUri();
    } catch {
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  throw new Error("loopback server never started");
}

// Raw http keeps the test outside the fetch interception used by other suites.
function get(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request(url, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", reject);
    req.end();
  });
}

describe("CancellableLoopbackClient", () => {
  let client: CancellableLoopbackClient;

  afterEach(() => client.closeServer());

  it("rejects the pending listener when cancelled", async () => {
    client = new CancellableLoopbackClient();
    const listener = client.listenForAuthCode();
    await waitForRedirectUri(client);

    client.cancel();

    await expect(listener).rejects.toBeInstanceOf(SignInCancelledError);
  });

  it("resolves with the auth code from the redirect", async () => {
    client = new CancellableLoopbackClient();
    const listener = client.listenForAuthCode("ok", "err");
    const redirectUri = await waitForRedirectUri(client);

    expect(await get(`${redirectUri}/?code=abc&state=xyz`)).toBe(302);
    await expect(listener).resolves.toMatchObject({ code: "abc", state: "xyz" });
  });

  it("ignores cancel after the auth code has arrived", async () => {
    client = new CancellableLoopbackClient();
    const listener = client.listenForAuthCode();
    const redirectUri = await waitForRedirectUri(client);

    await get(`${redirectUri}/?code=abc`);
    client.cancel();

    await expect(listener).resolves.toMatchObject({ code: "abc" });
  });

  it("keeps waiting on requests that are not auth responses", async () => {
    client = new CancellableLoopbackClient();
    const listener = client.listenForAuthCode();
    const redirectUri = await waitForRedirectUri(client);

    expect(await get(`${redirectUri}/favicon.ico`)).toBe(404);

    client.cancel();
    await expect(listener).rejects.toBeInstanceOf(SignInCancelledError);
  });
});
