import { describe, expect, it, vi } from "vitest";

import { createConnectionStore, migrateState } from "../../src/electron/connectionStore";
import type { PersistedState } from "../../src/electron/storage";

function ids() {
  let next = 0;
  return () => `id-${++next}`;
}

const online = (fields: Record<string, unknown>) => ({
  envUrl: "https://contoso.crm.dynamics.com",
  crmType: "online",
  homeAccountId: "home-1",
  ...fields,
});

function storeWith(connections: unknown[], activeConnectionId: string | null = null) {
  const save = vi.fn<(state: PersistedState) => void>();
  const store = createConnectionStore({
    initial: { connections, activeConnectionId },
    save,
    createId: ids(),
  });
  return { store, save };
}

describe("migrateState", () => {
  it("moves the old name to legacyName, adds ids and maps the active connection", () => {
    const { state, changed } = migrateState(
      {
        connections: [
          online({ name: "Contoso Prod" }),
          {
            name: "Fabrikam",
            envUrl: "https://fabrikam.local",
            crmType: "onpremise",
            authMode: "ifd",
            username: "jo",
            domain: "FAB",
            encryptedPassword: "secret",
          },
        ],
        activeConnectionName: "Fabrikam",
      },
      ids(),
    );

    expect(changed).toBe(true);
    expect(state.activeConnectionId).toBe("id-2");
    expect(state.connections).toEqual([
      {
        id: "id-1",
        legacyName: "Contoso Prod",
        organization: null,
        environment: null,
        browser: null,
        crmType: "online",
        envUrl: "https://contoso.crm.dynamics.com",
        homeAccountId: "home-1",
      },
      {
        id: "id-2",
        legacyName: "Fabrikam",
        organization: null,
        environment: null,
        browser: null,
        crmType: "onpremise",
        envUrl: "https://fabrikam.local",
        authMode: "ifd",
        username: "jo",
        domain: "FAB",
        encryptedPassword: "secret",
      },
    ]);
  });

  it("keeps old names that differ only by case as separate connections", () => {
    const { state } = migrateState(
      { connections: [online({ name: "Prod" }), online({ name: "prod" })] },
      ids(),
    );
    expect(state.connections.map((connection) => connection.legacyName)).toEqual(["Prod", "prod"]);
  });

  it("leaves current files unchanged and drops unusable entries", () => {
    const current = online({ id: "a", organization: "Contoso", environment: "Dev", browser: { id: "edge", profile: "Profile 1" } });
    expect(migrateState({ connections: [current], activeConnectionId: "a" }, ids())).toEqual({
      state: { connections: [current], activeConnectionId: "a" },
      changed: false,
    });
    expect(migrateState({ connections: [null, { crmType: "online" }], activeConnectionId: "x" }, ids())).toEqual({
      state: { connections: [], activeConnectionId: null },
      changed: true,
    });
  });

  it("ignores a browser it does not know", () => {
    const { state } = migrateState({ connections: [online({ id: "a", browser: { id: "netscape" } })] }, ids());
    expect(state.connections[0].browser).toBeNull();
  });
});

describe("connection store", () => {
  it("saves migrated files once at startup", () => {
    const { save } = storeWith([online({ name: "Old" })]);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("makes the first added connection active and rejects a second Contoso · Dev", () => {
    const { store } = storeWith([]);
    const first = store.add({ ...online({}), organization: "Contoso", environment: "Dev", browser: null, account: null } as never);
    expect(first.success).toBe(true);
    expect(store.activeId).toBe("id-1");

    const second = store.add({ ...online({}), organization: " contoso ", environment: "DEV", browser: null, account: null } as never);
    expect(second).toEqual({ success: false, error: 'contoso already has an environment named "DEV".' });

    const third = store.add({ ...online({}), organization: "Contoso", environment: "Dev 2", browser: null, account: null } as never);
    expect(third.success).toBe(true);
    expect(store.activeId).toBe("id-1");
  });

  it("drops the old name once organization and environment are set, and keeps the id", () => {
    const { store } = storeWith([online({ name: "My old prod" })]);
    const [conn] = store.list();

    const partial = store.describe(conn.id, { organization: "Contoso" });
    expect(partial.success && partial.value.legacyName).toBe("My old prod");

    const result = store.describe(conn.id, { environment: "Production" });
    expect(result.success).toBe(true);
    expect(store.get(conn.id)).toMatchObject({ id: conn.id, organization: "Contoso", environment: "Production" });
    expect(store.get(conn.id)).not.toHaveProperty("legacyName");
  });

  it("requires organization and environment for a described connection", () => {
    const { store } = storeWith([online({ id: "a", organization: "Contoso", environment: "Dev" })]);
    expect(store.describe("a", { environment: "  " })).toEqual({
      success: false,
      error: "Enter an organization and an environment.",
    });
  });

  it("checks clashes against other connections only", () => {
    const { store } = storeWith([
      online({ id: "a", organization: "Contoso", environment: "Dev" }),
      online({ id: "b", organization: "Contoso", environment: "Test" }),
    ]);
    expect(store.describe("a", { environment: "dev", browser: { id: "chrome", profile: "Profile 2" } }).success).toBe(true);
    expect(store.describe("b", { environment: "Dev" }).success).toBe(false);
    expect(store.get("a")?.browser).toEqual({ id: "chrome", profile: "Profile 2" });
  });

  it("falls back to the first remaining connection when the active one is removed", () => {
    const { store, save } = storeWith(
      [online({ id: "a", organization: "Contoso", environment: "Dev" }), online({ id: "b", organization: "Contoso", environment: "Test" })],
      "a",
    );
    store.remove("a");
    expect(store.activeId).toBe("b");
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ activeConnectionId: "b" }));
    store.remove("b");
    expect(store.activeId).toBeNull();
  });

  it("never writes the MSAL account to disk", () => {
    const { store, save } = storeWith([online({ id: "a", organization: "Contoso", environment: "Dev" })]);
    const conn = store.get("a");
    if (conn?.crmType !== "online") throw new Error("expected an online connection");
    store.replace({ ...conn, account: { homeAccountId: "home-2" } as never, homeAccountId: "home-2" });
    const saved = save.mock.lastCall?.[0].connections[0];
    expect(saved).not.toHaveProperty("account");
    expect(saved).toMatchObject({ homeAccountId: "home-2" });
  });

  it("gives the renderer summaries without secrets", () => {
    const { store } = storeWith([
      {
        id: "p",
        name: "Fabrikam",
        envUrl: "https://fabrikam.local",
        crmType: "onpremise",
        authMode: "ad",
        username: "jo",
        domain: "FAB",
        encryptedPassword: "",
        needsPassword: true,
      },
    ]);
    expect(store.summaries()).toEqual([
      {
        id: "p",
        organization: null,
        environment: null,
        legacyName: "Fabrikam",
        browser: null,
        envUrl: "https://fabrikam.local",
        crmType: "onpremise",
        needsPassword: true,
      },
    ]);
  });
});
