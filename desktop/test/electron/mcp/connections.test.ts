import { describe, expect, it } from "vitest";
import { connectionDisplayName as rendererName } from "../../../src/ui/shared/connections/connectionNaming";
import {
  connectionDisplayName,
  createConnectionResolver,
  type ConnectionSummaryLike,
} from "../../../src/electron/mcp/connections";
import { AgentToolError } from "../../../src/electron/mcp/types";

const summaries: ConnectionSummaryLike[] = [
  { id: "id-dev", organization: "A", environment: "Dev", legacyName: null, envUrl: "https://a-dev.crm.dynamics.com", crmType: "online" },
  { id: "id-test", organization: "A", environment: "Test", legacyName: null, envUrl: "https://a-test.crm.dynamics.com", crmType: "online" },
  { id: "id-old", organization: null, environment: null, legacyName: "Legacy", envUrl: "https://crm.local", crmType: "onpremise" },
];

function resolver(overrides: Partial<Parameters<typeof createConnectionResolver>[0]> = {}) {
  return createConnectionResolver({
    summaries: () => summaries,
    activeId: () => "id-dev",
    resolveAuth: async (id) => ({ id, envUrl: "https://x", crmType: "online", token: "SECRET-TOKEN" }),
    ...overrides,
  });
}

describe("connectionDisplayName", () => {
  it("matches the renderer rule", () => {
    const fixtures = [
      { organization: "A", environment: "Dev", legacyName: null, envUrl: "https://a.crm.dynamics.com" },
      { organization: null, environment: null, legacyName: "Legacy", envUrl: "https://a.crm.dynamics.com" },
      { organization: null, environment: null, legacyName: null, envUrl: "https://a.crm.dynamics.com" },
      { organization: "A", environment: null, legacyName: null, envUrl: "not a url" },
    ];
    for (const f of fixtures) expect(connectionDisplayName(f)).toBe(rendererName(f));
  });
});

describe("createConnectionResolver", () => {
  it("uses the active connection when no name is given", async () => {
    const conn = await resolver().resolve(undefined);
    expect(conn.displayName).toBe("A · Dev");
    expect(conn.auth.id).toBe("id-dev");
  });

  it("throws NoConnection when nothing is active", async () => {
    await expect(resolver({ activeId: () => null }).resolve(undefined)).rejects.toMatchObject({ code: "NoConnection" });
  });

  it("matches names case-insensitively after trimming", async () => {
    const conn = await resolver().resolve("  a · TEST ");
    expect(conn.auth.id).toBe("id-test");
  });

  it("lists valid names when nothing matches", async () => {
    const err = await resolver().resolve("Nope").catch((e: unknown) => e as AgentToolError);
    expect(err).toMatchObject({ code: "ConnectionNotFound" });
    expect((err as AgentToolError).hint).toBe("Valid names: A · Dev, A · Test, Legacy");
  });

  it("rejects two connections with the same display name", async () => {
    const dup = [...summaries, { ...summaries[0], id: "id-dup" }];
    await expect(resolver({ summaries: () => dup }).resolve("A · Dev")).rejects.toMatchObject({ code: "ConnectionNotFound" });
  });

  it("maps sign-in failures to SignInRequired", async () => {
    const r = resolver({ resolveAuth: async () => ({ error: "User canceled the sign-in" }) });
    await expect(r.resolve(undefined)).rejects.toMatchObject({ code: "SignInRequired" });
  });

  it("maps other auth failures to NoConnection and keeps the message", async () => {
    const r = resolver({ resolveAuth: async () => ({ error: "Connection not found." }) });
    await expect(r.resolve(undefined)).rejects.toMatchObject({ code: "NoConnection", message: "Connection not found." });
  });

  it("never puts the token in a thrown message", async () => {
    const r = resolver({ resolveAuth: async () => ({ error: "Enter the password in Manage connections." }) });
    const err = (await r.resolve(undefined).catch((e: unknown) => e)) as Error;
    expect(JSON.stringify(err.message)).not.toContain("SECRET-TOKEN");
  });

  it("lists connections with the active flag", () => {
    expect(resolver().list()).toEqual([
      { displayName: "A · Dev", kind: "online", envUrl: "https://a-dev.crm.dynamics.com", active: true },
      { displayName: "A · Test", kind: "online", envUrl: "https://a-test.crm.dynamics.com", active: false },
      { displayName: "Legacy", kind: "onpremise", envUrl: "https://crm.local", active: false },
    ]);
  });
});
