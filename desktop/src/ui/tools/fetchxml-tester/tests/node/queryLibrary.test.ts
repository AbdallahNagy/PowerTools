import { describe, expect, it } from "vitest";
import { buildExecuteRequest, emptyFetchMessage } from "../../model/executeRequest";
import { fetchErrorMessage } from "../../model/fetchError";
import {
  deleteQuery,
  filterQueries,
  loadQueries,
  saveQuery,
  writeQueries,
  type QueryStore,
} from "../../model/queryLibrary";
import { resultSummary } from "../../model/resultSummary";
import axios from "axios";

function memoryStore(): QueryStore & { raw: string | null } {
  const state = { raw: null as string | null };
  return {
    get raw() {
      return state.raw;
    },
    getItem: () => state.raw,
    setItem: (_key, value) => {
      state.raw = value;
    },
  };
}

const accountQuery = "<fetch><entity name=\"account\"><attribute name=\"name\" /></entity></fetch>";
const contactQuery = "<fetch><entity name=\"contact\"><attribute name=\"fullname\" /></entity></fetch>";

describe("query library", () => {
  it("saves a query under its entity name and replaces a duplicate in place", () => {
    const created = saveQuery([], {
      fetchXml: accountQuery,
      description: "Active accounts",
      connectionName: "Dev",
      environment: "Dev",
    }, { id: "query-1", savedAt: "2026-09-01T00:00:00.000Z" });

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.queries[0]).toMatchObject({
      id: "query-1",
      table: "account",
      description: "Active accounts",
      connectionName: "Dev",
    });
    expect(created.queries[0]?.fetchXml).toContain("<entity name=\"account\">");

    const replaced = saveQuery(created.queries, {
      fetchXml: "  <fetch> <entity name=\"account\"> <attribute name=\"name\" /> </entity> </fetch> ",
      description: "Renamed",
      connectionName: "Dev",
      environment: "Dev",
    }, { id: "query-2", savedAt: "2026-09-02T00:00:00.000Z" });

    expect(replaced.ok).toBe(true);
    if (!replaced.ok) return;
    expect(replaced.queries).toHaveLength(1);
    expect(replaced.queries[0]?.id).toBe("query-1");
    expect(replaced.queries[0]?.description).toBe("Renamed");
  });

  it("keeps underscores in the table name and rejects a query with no entity", () => {
    const saved = saveQuery([], {
      fetchXml: "<fetch><entity name=\"new_widget\"><attribute name=\"new_name\" /></entity></fetch>",
      description: "",
      connectionName: "Dev",
      environment: "Dev",
    }, { id: "custom", savedAt: "2026-09-01T00:00:00.000Z" });

    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.queries[0]?.table).toBe("new_widget");
    expect(saved.queries[0]?.description).toBe("");

    const missing = saveQuery([], {
      fetchXml: "<fetch></fetch>",
      description: "Broken",
      connectionName: "Dev",
      environment: "Dev",
    });
    expect(missing).toEqual({
      ok: false,
      error: "FetchXML must include an <entity> name before it can be saved.",
    });
  });

  it("filters by connection and search, and ignores corrupt storage", () => {
    const first = saveQuery([], {
      fetchXml: accountQuery,
      description: "Accounts",
      connectionName: "Dev",
      environment: "Dev",
    }, { id: "dev", savedAt: "2026-09-01T00:00:00.000Z" });
    if (!first.ok) throw new Error(first.error);
    const second = saveQuery(first.queries, {
      fetchXml: contactQuery,
      description: "People",
      connectionName: "Prod",
      environment: "Prod",
    }, { id: "prod", savedAt: "2026-09-03T00:00:00.000Z" });
    if (!second.ok) throw new Error(second.error);

    expect(filterQueries(second.queries, {
      connectionName: "Dev",
      allEnvironments: false,
      search: "",
    }).map((query) => query.id)).toEqual(["dev"]);

    expect(filterQueries(second.queries, {
      connectionName: "Dev",
      allEnvironments: true,
      search: "fullname",
    }).map((query) => query.table)).toEqual(["contact"]);

    const store = memoryStore();
    writeQueries(store, second.queries);
    expect(loadQueries(store)).toHaveLength(2);
    store.setItem("ignored", "{");
    expect(loadQueries(store)).toEqual([]);
    expect(deleteQuery(second.queries, "dev").map((query) => query.id)).toEqual(["prod"]);
  });
});

describe("execute request", () => {
  it("blocks an empty query and posts the editor text unchanged", () => {
    expect(emptyFetchMessage("  ")).toBe(
      "Please provide a FetchXML query before trying to execute it.",
    );
    expect(emptyFetchMessage(accountQuery)).toBeNull();
    expect(buildExecuteRequest(accountQuery, false)).toEqual({
      fetchXml: accountQuery,
      preserveFetchXml: true,
      valueMode: "raw",
    });
    expect(buildExecuteRequest(accountQuery, true).valueMode).toBe("formatted");
    expect(buildExecuteRequest(accountQuery, false)).not.toHaveProperty("page");
  });

  it("summarizes one page and reads the sidecar error", () => {
    expect(resultSummary(3, true)).toBe("Number of rows returned: 3 (More records: true)");
    const error = new axios.AxiosError("Request failed");
    error.response = {
      data: { error: "0x80040216 The query is invalid." },
      status: 400,
      statusText: "Bad Request",
      headers: {},
      config: { headers: new axios.AxiosHeaders() },
    };
    expect(fetchErrorMessage(error)).toBe("0x80040216 The query is invalid.");
  });
});
