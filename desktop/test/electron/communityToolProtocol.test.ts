import { join, resolve } from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityToolManifest } from "../../src/electron/communityTools/manifest";

const electronProtocol = vi.hoisted(() => ({
  registerSchemesAsPrivileged: vi.fn(),
  handle: vi.fn(),
}));

vi.mock("electron", () => ({ protocol: electronProtocol }));

const { TOOL_SCHEME, installToolProtocol, registerToolScheme, resolveToolRequest, toolPolicy } = await import(
  "../../src/electron/communityTools/toolProtocol.ts"
);

const TOOLS = resolve("/tools");
const FOLDER = join(TOOLS, "acme");
const OTHER_FOLDER = join(TOOLS, "other");

function manifest(overrides: Partial<CommunityToolManifest> = {}): CommunityToolManifest {
  return {
    manifestVersion: 1,
    id: "acme.demo",
    name: "Demo",
    description: "Demo tool",
    version: "1.0.0",
    publisher: { name: "Acme" },
    icon: "icon.svg",
    entry: "app/index.html",
    minHostVersion: "1.0.0",
    permissions: [],
    messages: [],
    network: [],
    allowMultipleInstances: true,
    ...overrides,
  };
}

function enoent(path: string): Error {
  return Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
}

function fakeDeps(options: { files?: Record<string, string>; links?: Record<string, string>; network?: string[] } = {}) {
  const files = new Map(Object.entries(options.files ?? {}));
  const links = new Map(Object.entries(options.links ?? {}));
  const consented = new Set(["acme.demo", "other.tool"]);
  const tools = new Map([
    ["acme.demo", { folder: FOLDER, manifest: manifest({ network: options.network ?? [] }) }],
    ["other.tool", { folder: OTHER_FOLDER, manifest: manifest({ id: "other.tool" }) }],
  ]);
  return {
    consented,
    isConsented: (id: string) => consented.has(id),
    folderFor: (id: string) => tools.get(id)?.folder ?? null,
    manifestFor: (id: string) => tools.get(id)?.manifest ?? null,
    readFile: vi.fn(async (path: string) => {
      const content = files.get(path);
      if (content === undefined) throw enoent(path);
      return Buffer.from(content, "utf8");
    }),
    realpath: vi.fn(async (path: string) => {
      const target = links.get(path) ?? path;
      if (target !== FOLDER && target !== OTHER_FOLDER && !files.has(target)) throw enoent(path);
      return target;
    }),
  };
}

describe("toolPolicy", () => {
  it("blocks every connection when the tool lists no network hosts", () => {
    const policy = toolPolicy({ network: [] });
    expect(policy).toBe(
      "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
        "font-src 'self' data:; connect-src 'none'; worker-src 'self' blob:; base-uri 'none'; form-action 'none'; " +
        "frame-src 'none'",
    );
    expect(policy).toContain("connect-src 'none'");
    expect(policy).not.toContain("127.0.0.1");
    expect(policy).not.toMatch(/pt-tool:(?!\/\/)/);
  });

  it("allows https to each listed network host", () => {
    expect(toolPolicy({ network: ["api.example.com"] })).toContain("connect-src https://api.example.com;");
    expect(toolPolicy({ network: ["a.example.com", "b.example.com"] })).toContain(
      "connect-src https://a.example.com https://b.example.com;",
    );
  });
});

describe("resolveToolRequest", () => {
  it("serves a tool file with its type, the tool policy, and the required headers", async () => {
    const deps = fakeDeps({ files: { [join(FOLDER, "index.html")]: "<p>hi</p>" } });
    const response = await resolveToolRequest("pt-tool://acme.demo/index.html", deps);
    expect(response.status).toBe(200);
    expect(response.body?.toString("utf8")).toBe("<p>hi</p>");
    expect(response.headers).toEqual({
      "Content-Type": "text/html",
      "Content-Security-Policy": toolPolicy(manifest()),
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    });
  });

  it.each([
    ["app.js", "text/javascript"],
    ["styles/app.css", "text/css"],
    ["icon.svg", "image/svg+xml"],
    ["data.json", "application/json"],
    ["fonts/a.woff2", "font/woff2"],
    ["blob.xyz", "application/octet-stream"],
  ])("serves %s as %s", async (file, type) => {
    const deps = fakeDeps({ files: { [join(FOLDER, file)]: "x" } });
    const response = await resolveToolRequest(`pt-tool://acme.demo/${file}`, deps);
    expect(response.status).toBe(200);
    expect(response.headers["Content-Type"]).toBe(type);
  });

  it("serves the manifest entry for the tool root", async () => {
    const deps = fakeDeps({ files: { [join(FOLDER, "app", "index.html")]: "entry" } });
    for (const url of ["pt-tool://acme.demo/", "pt-tool://acme.demo"]) {
      const response = await resolveToolRequest(url, deps);
      expect(response.status).toBe(200);
      expect(response.body?.toString("utf8")).toBe("entry");
      expect(response.headers["Content-Type"]).toBe("text/html");
    }
  });

  it("decodes the path and ignores the query and fragment", async () => {
    const deps = fakeDeps({ files: { [join(FOLDER, "my file.js")]: "x" } });
    const response = await resolveToolRequest("pt-tool://acme.demo/my%20file.js?v=1#top", deps);
    expect(response.status).toBe(200);
  });

  it.each([
    "pt-tool://acme.demo/../secret.txt",
    "pt-tool://acme.demo/%2e%2e/secret.txt",
    "pt-tool://acme.demo/a/..%5c..%5csecret",
    "pt-tool://acme.demo/a%5csecret",
    "pt-tool://acme.demo/a%00.js",
    "pt-tool://acme.demo/%2e%2e%2fother/index.html",
    "pt-tool://acme.demo/%E0%A4%A",
  ])("rejects %s with 403", async (url) => {
    const deps = fakeDeps({
      files: { [join(TOOLS, "secret.txt")]: "secret", [join(OTHER_FOLDER, "index.html")]: "other" },
    });
    const response = await resolveToolRequest(url, deps);
    expect(response.status).toBe(403);
    expect(response.body).toBeNull();
    expect(response.headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(deps.readFile).not.toHaveBeenCalled();
  });

  it("rejects a symlink that points outside the tool folder with 403", async () => {
    const link = join(FOLDER, "leak.txt");
    const target = join(TOOLS, "secret.txt");
    const deps = fakeDeps({ files: { [target]: "secret" }, links: { [link]: target } });
    const response = await resolveToolRequest("pt-tool://acme.demo/leak.txt", deps);
    expect(response.status).toBe(403);
    expect(deps.readFile).not.toHaveBeenCalled();
  });

  it("serves a symlink that stays inside the tool folder", async () => {
    const link = join(FOLDER, "alias.js");
    const target = join(FOLDER, "real.js");
    const deps = fakeDeps({ files: { [target]: "real" }, links: { [link]: target } });
    const response = await resolveToolRequest("pt-tool://acme.demo/alias.js", deps);
    expect(response.status).toBe(200);
    expect(response.body?.toString("utf8")).toBe("real");
  });

  it("returns 404 for an unknown tool id", async () => {
    const response = await resolveToolRequest("pt-tool://nobody.here/index.html", fakeDeps());
    expect(response.status).toBe(404);
    expect(response.headers["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("returns 404 for a missing file", async () => {
    const response = await resolveToolRequest("pt-tool://acme.demo/missing.js", fakeDeps());
    expect(response.status).toBe(404);
  });

  it("returns 404 when the file cannot be read", async () => {
    const deps = fakeDeps({ files: { [join(FOLDER, "dir")]: "x" } });
    deps.readFile.mockRejectedValueOnce(Object.assign(new Error("EISDIR"), { code: "EISDIR" }));
    const response = await resolveToolRequest("pt-tool://acme.demo/dir", deps);
    expect(response.status).toBe(404);
  });

  it("returns 404 for another scheme", async () => {
    const response = await resolveToolRequest("https://acme.demo/index.html", fakeDeps());
    expect(response.status).toBe(404);
  });
});

describe("registerToolScheme", () => {
  it("registers pt-tool with the privileges the spike verified", () => {
    registerToolScheme();
    expect(TOOL_SCHEME).toBe("pt-tool");
    expect(electronProtocol.registerSchemesAsPrivileged).toHaveBeenCalledWith([
      { scheme: "pt-tool", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
    ]);
  });
});

describe("consent", () => {
  it("serves a ready tool only once its consent is granted", async () => {
    const deps = fakeDeps({ files: { [join(FOLDER, "index.html")]: "<p>hi</p>" } });
    deps.consented.delete("acme.demo");

    const before = await resolveToolRequest("pt-tool://acme.demo/index.html", deps);
    expect(before.status).toBe(404);
    expect(before.body).toBeNull();
    expect(deps.readFile).not.toHaveBeenCalled();

    deps.consented.add("acme.demo");
    const after = await resolveToolRequest("pt-tool://acme.demo/index.html", deps);
    expect(after.status).toBe(200);
  });
});

describe("installToolProtocol", () => {
  beforeEach(() => electronProtocol.handle.mockReset());

  it("waits for the tool list to load before answering a request", async () => {
    let finishLoading!: () => void;
    const ready = new Promise<void>((done) => {
      finishLoading = done;
    });
    let loaded = false;
    const deps = fakeDeps({ files: { [join(FOLDER, "index.html")]: "<p>hi</p>" } });
    installToolProtocol({
      ...deps,
      folderFor: (id: string) => (loaded ? deps.folderFor(id) : null),
      ready,
    });

    expect(electronProtocol.handle).toHaveBeenCalledWith("pt-tool", expect.any(Function));
    const handler = electronProtocol.handle.mock.calls[0][1] as (request: Request) => Promise<Response>;
    const pending = handler(new Request("pt-tool://acme.demo/index.html"));
    loaded = true;
    finishLoading();

    const response = await pending;
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Security-Policy")).toBe(toolPolicy(manifest()));
    expect(await response.text()).toBe("<p>hi</p>");
  });

  it("still answers when loading the tool list failed", async () => {
    installToolProtocol({ ...fakeDeps(), ready: Promise.reject(new Error("boom")) });
    const handler = electronProtocol.handle.mock.calls[0][1] as (request: Request) => Promise<Response>;
    const response = await handler(new Request("pt-tool://nobody.here/index.html"));
    expect(response.status).toBe(404);
  });
});
