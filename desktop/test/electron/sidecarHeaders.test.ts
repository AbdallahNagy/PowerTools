import { describe, expect, it } from "vitest";
import { sidecarAuthHeaders } from "../../src/electron/sidecarHeaders";

const online = { id: "c1", envUrl: "https://org.crm.dynamics.com", crmType: "online" as const, token: "tok" };
const onprem = { id: "c2", envUrl: "https://crm.local", crmType: "onpremise" as const };

describe("sidecarAuthHeaders", () => {
  it("builds online headers", () => {
    expect(sidecarAuthHeaders(online)).toEqual({
      Authorization: "Bearer tok",
      "X-Environment-Url": "https://org.crm.dynamics.com",
    });
  });

  it("builds on-premises headers", () => {
    expect(sidecarAuthHeaders(onprem)).toEqual({ "X-Connection-Name": "c2" });
  });

  it("prefixes target headers", () => {
    expect(sidecarAuthHeaders(online, "Target-")).toEqual({
      "X-Target-Authorization": "Bearer tok",
      "X-Target-Environment-Url": "https://org.crm.dynamics.com",
    });
    expect(sidecarAuthHeaders(onprem, "Target-")).toEqual({ "X-Target-Connection-Name": "c2" });
  });

  it("throws when an online connection has no token", () => {
    expect(() => sidecarAuthHeaders({ ...online, token: undefined })).toThrow("Missing token for online connection");
  });
});
