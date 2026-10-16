import { describe, expect, it } from "vitest";

import {
  connectionDisplayName,
  environmentKind,
  groupConnections,
  nextFreeEnvironment,
  suggestOrganization,
  toConnectionInfo,
} from "./connectionNaming";
import type { ConnectionSummary } from "./types";

function summary(id: string, organization: string | null, environment: string | null, legacyName: string | null = null): ConnectionSummary {
  return {
    id,
    organization,
    environment,
    legacyName,
    browser: null,
    envUrl: `https://${id}.crm4.dynamics.com`,
    crmType: "online",
    needsPassword: false,
  };
}

describe("environmentKind", () => {
  it.each([
    ["Dev", "dev"],
    ["Dev 2", "dev"],
    ["dev - integration", "dev"],
    ["QC Team A", "test"],
    ["SIT", "test"],
    ["UAT", "uat"],
    ["Pre-Prod", "staging"],
    ["Prod EU", "production"],
    ["Production", "production"],
    ["Training", "other"],
    [null, "other"],
  ] as const)("reads %s as %s", (environment, kind) => {
    expect(environmentKind(environment)).toBe(kind);
  });
});

describe("connectionDisplayName", () => {
  it("joins organization and environment, else uses the old name, else the host", () => {
    expect(connectionDisplayName(summary("a", "Contoso", "Dev"))).toBe("Contoso · Dev");
    expect(connectionDisplayName(summary("a", "Contoso", null, "My old prod"))).toBe("My old prod");
    expect(connectionDisplayName(summary("contoso-dev", null, null))).toBe("contoso-dev.crm4.dynamics.com");
  });
});

describe("nextFreeEnvironment", () => {
  const existing = [summary("a", "Contoso", "Dev"), summary("b", "Contoso", "dev 2"), summary("c", "Fabrikam", "Test")];

  it("fills in the next free number when the organization already has the preset", () => {
    expect(nextFreeEnvironment(existing, "contoso", "Dev")).toBe("Dev 3");
    expect(nextFreeEnvironment(existing, "Contoso", "Test")).toBe("Test");
    expect(nextFreeEnvironment(existing, "Fabrikam", "Dev")).toBe("Dev");
  });

  it("leaves the connection being edited out", () => {
    expect(nextFreeEnvironment(existing, "Contoso", "Dev", "a")).toBe("Dev");
  });
});

describe("groupConnections", () => {
  it("sorts organizations A to Z, environments by kind, and puts Other last", () => {
    const groups = groupConnections(
      [
        summary("p", "Contoso", "Production"),
        summary("old", null, null, "Fabrikam test"),
        summary("d2", "Contoso", "Dev 2"),
        summary("q", "Contoso", "QC"),
        summary("d", "contoso", "Dev"),
        summary("t", "Adventure Works", "Training"),
      ].map(toConnectionInfo),
    );

    expect(groups.map((group) => [group.label, group.connections.map((connection) => connection.environment ?? connection.displayName)])).toEqual([
      ["Adventure Works", ["Training"]],
      ["Contoso", ["Dev", "Dev 2", "QC", "Production"]],
      ["Other", ["Fabrikam test"]],
    ]);
  });
});

describe("suggestOrganization", () => {
  it("offers the first label of the address", () => {
    expect(suggestOrganization("https://contoso-dev.crm4.dynamics.com/")).toBe("contoso-dev");
    expect(suggestOrganization("not a url")).toBeNull();
  });
});
