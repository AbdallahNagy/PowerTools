import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "../../../packages/sdk/src/protocol";
import { MANIFEST_PERMISSIONS, parseManifest } from "../../src/electron/communityTools/manifest";

const HOST_VERSION = "1.3.0";

function validManifest(): Record<string, unknown> {
  return {
    manifestVersion: 1,
    id: "contoso.record-counter",
    name: "Record Counter",
    description: "Counts records.",
    version: "1.0.0",
    publisher: { name: "Contoso", url: "https://contoso.example" },
    icon: "assets/icon.svg",
    entry: "index.html",
    minHostVersion: "1.2.0",
    permissions: ["data:read"],
    messages: ["WhoAmI"],
    network: ["api.contoso.example"],
  };
}

function errorsFor(overrides: Record<string, unknown>, hostVersion = HOST_VERSION): string[] {
  const result = parseManifest({ ...validManifest(), ...overrides }, hostVersion);
  if (result.ok) throw new Error("expected the manifest to be rejected");
  return result.errors;
}

describe("parseManifest", () => {
  it("accepts a valid manifest and defaults allowMultipleInstances to true", () => {
    const result = parseManifest(validManifest(), HOST_VERSION);
    expect(result).toEqual({
      ok: true,
      manifest: { ...validManifest(), allowMultipleInstances: true },
    });
  });

  it("keeps an explicit allowMultipleInstances and ignores unknown top-level fields", () => {
    const result = parseManifest({ ...validManifest(), allowMultipleInstances: false, extra: 42 }, HOST_VERSION);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.allowMultipleInstances).toBe(false);
      expect(result.manifest).not.toHaveProperty("extra");
    }
  });

  it("rejects input that is not an object", () => {
    expect(parseManifest("nope", HOST_VERSION).ok).toBe(false);
    expect(parseManifest(null, HOST_VERSION).ok).toBe(false);
    expect(parseManifest([], HOST_VERSION).ok).toBe(false);
  });

  it.each([
    ["manifestVersion", { manifestVersion: 2 }],
    ["id", { id: "Contoso.Tool" }],
    ["id", { id: "contoso" }],
    ["id", { id: "contoso.tool.extra" }],
    ["id", { id: "contoso.-tool" }],
    ["name", { name: "" }],
    ["description", { description: 5 }],
    ["version", { version: "1.0" }],
    ["version", { version: "1.0.0-beta" }],
    ["publisher", { publisher: "Contoso" }],
    ["publisher.name", { publisher: { url: "https://contoso.example" } }],
    ["publisher.url", { publisher: { name: "Contoso", url: 3 } }],
    ["minHostVersion", { minHostVersion: "1.2" }],
    ["minHostVersion", { minHostVersion: "1.10.0" }],
    ["minHostVersion", { minHostVersion: "2.0.0" }],
    ["icon", { icon: "assets/icon.png" }],
    ["icon", { icon: "../icon.svg" }],
    ["icon", { icon: "assets\\icon.svg" }],
    ["icon", { icon: "/icon.svg" }],
    ["entry", { entry: "app/../../index.html" }],
    ["entry", { entry: "app\\index.html" }],
    ["entry", { entry: "C:/index.html" }],
    ["entry", { entry: "https://evil.example/index.html" }],
    ["permissions", { permissions: ["data:read", "data:everything"] }],
    ["permissions", { permissions: "data:read" }],
    ["messages", { messages: ["Who Am I"] }],
    ["messages", { messages: ["1WhoAmI"] }],
    ["network", { network: ["https://api.contoso.example"] }],
    ["network", { network: ["api.contoso.example/path"] }],
    ["network", { network: ["*.contoso.example"] }],
    ["allowMultipleInstances", { allowMultipleInstances: "yes" }],
  ])("reports %s for %j", (field, overrides) => {
    const errors = errorsFor(overrides);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(field);
  });

  it("compares minHostVersion numerically per segment", () => {
    expect(parseManifest({ ...validManifest(), minHostVersion: "1.3.0" }, "1.10.0").ok).toBe(true);
    expect(parseManifest({ ...validManifest(), minHostVersion: "1.10.0" }, "1.9.0").ok).toBe(false);
    expect(parseManifest({ ...validManifest(), minHostVersion: "1.3.0" }, "1.3.0").ok).toBe(true);
  });

  it("collects every error instead of stopping at the first", () => {
    const errors = errorsFor({ id: "Bad", icon: "icon.png", permissions: ["nope"] });
    expect(errors).toHaveLength(3);
    expect(errors.some((e) => e.includes("id"))).toBe(true);
    expect(errors.some((e) => e.includes("icon"))).toBe(true);
    expect(errors.some((e) => e.includes("permissions"))).toBe(true);
  });
});

describe("MANIFEST_PERMISSIONS", () => {
  it("matches the SDK permission list", () => {
    expect([...MANIFEST_PERMISSIONS]).toEqual([...PERMISSIONS]);
  });
});
