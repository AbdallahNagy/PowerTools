import { join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { consentHash, createToolStore, type ToolStoreFs } from "../../src/electron/communityTools/toolStore";

const ROOT = resolve("/fake");
const USER_DATA = join(ROOT, "user-data");
const STATE_FILE = join(USER_DATA, "community-tools.json");
const ICON = '<svg xmlns="http://www.w3.org/2000/svg"/>';

function createMemoryFs() {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  /** Where a path really is, for paths that are symlinks. */
  const links = new Map<string, string>();
  const delays: { readText?: Promise<void> } = {};
  const fs: ToolStoreFs = {
    readText: async (path) => {
      await delays.readText;
      const content = files.get(path);
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      return content;
    },
    writeText: async (path, content) => {
      files.set(path, content);
    },
    exists: async (path) => files.has(path) || dirs.has(path),
    mkdir: async (path) => {
      dirs.add(path);
    },
    size: async (path) => Buffer.byteLength(files.get(path) ?? "", "utf8"),
    realpath: async (path) => links.get(path) ?? path,
    remove: async (path) => {
      files.delete(path);
    },
    fileSizes: async (folder) =>
      [...files].filter(([path]) => path.startsWith(folder + sep)).map(([, content]) => Buffer.byteLength(content, "utf8")),
  };
  return { fs, files, dirs, links, delays };
}

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    manifestVersion: 1,
    id: "contoso.record-counter",
    name: "Record Counter",
    description: "Counts records.",
    version: "1.0.0",
    publisher: { name: "Contoso" },
    icon: "icon.svg",
    entry: "index.html",
    minHostVersion: "1.0.0",
    permissions: ["data:read"],
    ...overrides,
  };
}

function setup(builtInToolIds: readonly string[] = ["welcome"]) {
  const memory = createMemoryFs();
  const store = createToolStore({ userDataPath: USER_DATA, hostVersion: "1.3.0", builtInToolIds, fs: memory.fs });

  function writeTool(name: string, overrides: Record<string, unknown> = {}) {
    const folder = join(ROOT, name);
    memory.dirs.add(folder);
    memory.files.set(join(folder, "powertools-tool.json"), JSON.stringify(manifest(overrides)));
    memory.files.set(join(folder, "icon.svg"), ICON);
    return folder;
  }

  return { ...memory, store, writeTool };
}

describe("community tool store", () => {
  it("adds a valid folder as ready, without consent, with the icon as a data URL", async () => {
    const { store, writeTool, files } = setup();
    const folder = writeTool("counter");

    const tool = await store.addFolder(folder);

    expect(tool).toMatchObject({
      id: "contoso.record-counter",
      folder,
      status: "ready",
      errors: [],
      consentGranted: false,
      iconDataUrl: `data:image/svg+xml;base64,${Buffer.from(ICON).toString("base64")}`,
    });
    expect(tool.manifest?.name).toBe("Record Counter");
    expect(JSON.parse(files.get(STATE_FILE) ?? "")).toEqual({
      folders: [folder],
      consent: {},
      ids: { [folder]: "contoso.record-counter" },
      grants: { [folder]: { id: "contoso.record-counter", hash: "" } },
    });
    expect(store.folderFor("contoso.record-counter")).toBe(folder);
    expect(store.manifestFor("contoso.record-counter")?.id).toBe("contoso.record-counter");
  });

  it("remembers consent until the permission set changes", async () => {
    const { store, writeTool } = setup();
    const folder = writeTool("counter");
    await store.addFolder(folder);

    await store.grantConsent("contoso.record-counter");
    expect((await store.list())[0].consentGranted).toBe(true);

    writeTool("counter", { permissions: ["data:read", "data:write"] });
    expect((await store.list())[0].consentGranted).toBe(false);
  });

  it("does not give a new folder the consent of an older folder that used the same id", async () => {
    const { store, writeTool, files, dirs } = setup();
    const older = writeTool("older");
    await store.addFolder(older);
    await store.grantConsent("contoso.record-counter");
    dirs.delete(older);
    files.delete(join(older, "powertools-tool.json"));
    expect((await store.list())[0]).toMatchObject({ status: "missing" });

    const added = await store.addFolder(writeTool("newer"));

    expect(added).toMatchObject({ status: "ready", consentGranted: false });
    expect(store.isConsented("contoso.record-counter")).toBe(false);
    // Still unreviewed after the next refresh, and reviewing it grants only that folder.
    expect((await store.list()).find((tool) => tool.status === "ready")).toMatchObject({ consentGranted: false });
    await store.grantConsent("contoso.record-counter");
    expect((await store.list()).find((tool) => tool.status === "ready")).toMatchObject({ consentGranted: true });
  });

  it("keeps consent per folder when the same folder is reloaded", async () => {
    const { store, writeTool } = setup();
    const folder = writeTool("counter");
    await store.addFolder(folder);
    await store.grantConsent("contoso.record-counter");

    expect((await store.list())[0]).toMatchObject({ folder, consentGranted: true });
  });

  describe("consent in a state file written before folders were bound to it", () => {
    const hash = consentHash({ permissions: ["data:read"], messages: [], network: [] });

    it("counts for the one folder recorded with that id", async () => {
      const { store, writeTool, files } = setup();
      const folder = writeTool("counter");
      files.set(STATE_FILE, JSON.stringify({ folders: [folder], consent: { "contoso.record-counter": hash }, ids: { [folder]: "contoso.record-counter" } }));

      expect((await store.list())[0]).toMatchObject({ consentGranted: true });
    });

    it("counts for the only folder when no ids were recorded at all", async () => {
      const { store, writeTool, files } = setup();
      const folder = writeTool("counter");
      files.set(STATE_FILE, JSON.stringify({ folders: [folder], consent: { "contoso.record-counter": hash } }));

      expect((await store.list())[0]).toMatchObject({ consentGranted: true });
    });

    it("does not count when two folders were recorded with the same id", async () => {
      const { store, writeTool, files, dirs } = setup();
      const missing = join(ROOT, "gone");
      dirs.delete(missing);
      const folder = writeTool("counter");
      files.set(
        STATE_FILE,
        JSON.stringify({
          folders: [missing, folder],
          consent: { "contoso.record-counter": hash },
          ids: { [missing]: "contoso.record-counter", [folder]: "contoso.record-counter" },
        }),
      );

      const tools = await store.list();
      expect(tools.find((tool) => tool.status === "ready")).toMatchObject({ consentGranted: false });
    });

    it("does not count for a folder recorded under a different id", async () => {
      const { store, writeTool, files } = setup();
      const folder = writeTool("counter");
      files.set(STATE_FILE, JSON.stringify({ folders: [folder], consent: { "contoso.record-counter": hash }, ids: { [folder]: "contoso.other" } }));

      expect((await store.list())[0]).toMatchObject({ consentGranted: false });
    });
  });

  it("does not drop a tool added while the startup list is still reading", async () => {
    const { store, writeTool, files, delays } = setup();
    const first = writeTool("first", { id: "contoso.first" });
    files.set(STATE_FILE, JSON.stringify({ folders: [first], ids: { [first]: "contoso.first" } }));
    let release!: () => void;
    delays.readText = new Promise<void>((resolve) => {
      release = resolve;
    });

    const startup = store.list();
    const second = writeTool("second", { id: "contoso.second" });
    const adding = store.addFolder(second);
    delays.readText = undefined;
    release();
    await Promise.all([startup, adding]);

    expect(store.folderFor("contoso.first")).toBe(first);
    expect(store.folderFor("contoso.second")).toBe(second);
    expect((await store.list()).map((tool) => tool.id)).toEqual(["contoso.first", "contoso.second"]);
  });

  it("refuses an icon that is a link to a file outside the folder", async () => {
    const { store, writeTool, links, files } = setup();
    const folder = writeTool("counter");
    const outside = join(ROOT, "elsewhere", "secret.svg");
    files.set(outside, ICON);
    links.set(join(folder, "icon.svg"), outside);

    const tool = await store.addFolder(folder);

    expect(tool).toMatchObject({ status: "invalid", iconDataUrl: null });
    expect(tool.errors[0]).toContain("must be a file inside the package");
  });

  it("reports the total size of the folder", async () => {
    const { store, writeTool, files } = setup();
    const folder = writeTool("counter");
    files.set(join(folder, "app", "index.js"), "x".repeat(1000));
    await store.addFolder(folder);

    const expected = Buffer.byteLength(JSON.stringify(manifest()), "utf8") + Buffer.byteLength(ICON) + 1000;
    await expect(store.bundleSize("contoso.record-counter")).resolves.toEqual({ bytes: expected, files: 3 });
    await expect(store.bundleSize("contoso.unknown")).rejects.toThrow("Community tool not found");
  });

  it("deletes the stored settings of a tool when it is removed", async () => {
    const { store, writeTool, files } = setup();
    await store.addFolder(writeTool("counter"));
    await store.writeStorage("contoso.record-counter", { count: 3 });
    const storageFile = join(USER_DATA, "community-tool-data", "contoso.record-counter.json");
    expect(files.has(storageFile)).toBe(true);

    await store.remove("contoso.record-counter");

    expect(files.has(storageFile)).toBe(false);
  });

  it("hashes the sorted permission, message and network lists", () => {
    const a = consentHash({ permissions: ["data:write", "data:read"], messages: ["B", "A"], network: ["b.example", "a.example"] });
    const b = consentHash({ permissions: ["data:read", "data:write"], messages: ["A", "B"], network: ["a.example", "b.example"] });
    const c = consentHash({ permissions: ["data:read"], messages: ["A", "B"], network: ["a.example", "b.example"] });

    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("lists a folder without a manifest as invalid", async () => {
    const { store, dirs } = setup();
    const folder = join(ROOT, "empty");
    dirs.add(folder);

    const tool = await store.addFolder(folder);

    expect(tool).toMatchObject({ id: folder, status: "invalid", errors: ["powertools-tool.json not found"], manifest: null });
    expect(store.folderFor(folder)).toBeNull();
  });

  it("lists a manifest that fails validation as invalid with its errors", async () => {
    const { store, writeTool } = setup();
    const folder = writeTool("broken", { manifestVersion: 2 });

    const tool = await store.addFolder(folder);

    expect(tool.status).toBe("invalid");
    expect(tool.errors).toContain("manifestVersion: must be 1");
  });

  it("refuses an icon larger than 256 KB", async () => {
    const { store, writeTool, files } = setup();
    const folder = writeTool("counter");
    files.set(join(folder, "icon.svg"), "x".repeat(256 * 1024 + 1));

    const tool = await store.addFolder(folder);

    expect(tool).toMatchObject({ status: "invalid", errors: ["Icon is larger than 256 KB"], iconDataUrl: null });
  });

  it("lists a remembered folder that no longer exists as missing", async () => {
    const { store, writeTool, files, dirs } = setup();
    const gone = writeTool("gone", { id: "contoso.gone" });
    const kept = writeTool("kept");
    await store.addFolder(gone);
    await store.addFolder(kept);
    dirs.delete(gone);
    files.delete(join(gone, "powertools-tool.json"));

    const tools = await store.list();

    expect(tools.map((tool) => [tool.id, tool.status, tool.errors])).toEqual([
      [gone, "missing", ["Folder not found"]],
      ["contoso.record-counter", "ready", []],
    ]);
  });

  it("rejects a second folder with the same id", async () => {
    const { store, writeTool } = setup();
    await store.addFolder(writeTool("first"));

    await expect(store.addFolder(writeTool("second"))).rejects.toThrow('A tool with id "contoso.record-counter" is already loaded');
    expect((await store.list()).map((tool) => tool.folder)).toEqual([join(ROOT, "first")]);
  });

  it("rejects an id that a built-in tool uses", async () => {
    const { store, writeTool } = setup(["contoso.record-counter"]);

    await expect(store.addFolder(writeTool("counter"))).rejects.toThrow('A tool with id "contoso.record-counter" is already loaded');
  });

  it("returns the existing entry when the same folder is added again", async () => {
    const { store, writeTool, files } = setup();
    const folder = writeTool("counter");
    await store.addFolder(folder);

    await expect(store.addFolder(folder)).resolves.toMatchObject({ status: "ready" });
    expect(JSON.parse(files.get(STATE_FILE) ?? "").folders).toEqual([folder]);
  });

  it("removes a tool and forgets its folder and consent", async () => {
    const { store, writeTool, files } = setup();
    await store.addFolder(writeTool("counter"));
    await store.grantConsent("contoso.record-counter");

    await store.remove("contoso.record-counter");

    expect(await store.list()).toEqual([]);
    expect(JSON.parse(files.get(STATE_FILE) ?? "")).toEqual({ folders: [], consent: {}, ids: {}, grants: {} });
    expect(store.folderFor("contoso.record-counter")).toBeNull();
  });

  it("forgets the consent of a tool whose folder is missing when it is removed", async () => {
    const { store, writeTool, files, dirs } = setup();
    const gone = writeTool("gone");
    await store.addFolder(gone);
    await store.grantConsent("contoso.record-counter");
    dirs.delete(gone);
    files.delete(join(gone, "powertools-tool.json"));
    expect((await store.list())[0]).toMatchObject({ status: "missing" });

    await store.remove(gone);

    expect(JSON.parse(files.get(STATE_FILE) ?? "")).toEqual({ folders: [], consent: {}, ids: {}, grants: {} });
    const other = await store.addFolder(writeTool("other"));
    expect(other).toMatchObject({ id: "contoso.record-counter", status: "ready", consentGranted: false });
    expect(store.isConsented("contoso.record-counter")).toBe(false);
  });

  it("reads a state file written before ids were recorded", async () => {
    const { store, writeTool, files } = setup();
    const folder = writeTool("counter");
    files.set(STATE_FILE, JSON.stringify({ folders: [folder] }));

    expect((await store.list()).map((tool) => tool.id)).toEqual(["contoso.record-counter"]);
    await store.grantConsent("contoso.record-counter");
    expect(JSON.parse(files.get(STATE_FILE) ?? "").ids).toEqual({ [folder]: "contoso.record-counter" });
  });

  it("reports consent by id only for a ready tool whose permission set was reviewed", async () => {
    const { store, writeTool } = setup();
    await store.addFolder(writeTool("counter"));

    expect(store.isConsented("contoso.record-counter")).toBe(false);
    await store.grantConsent("contoso.record-counter");
    expect(store.isConsented("contoso.record-counter")).toBe(true);
    expect(store.isConsented("nobody.here")).toBe(false);
  });

  it("treats a corrupt state file as empty", async () => {
    const { store, files } = setup();
    files.set(STATE_FILE, "{not json");

    await expect(store.list()).resolves.toEqual([]);
  });

  it("reads and writes tool storage under the tool id", async () => {
    const { store, writeTool, files } = setup();
    await store.addFolder(writeTool("counter"));

    expect(await store.readStorage("contoso.record-counter")).toEqual({});
    await store.writeStorage("contoso.record-counter", { count: 3 });

    expect(await store.readStorage("contoso.record-counter")).toEqual({ count: 3 });
    expect(files.has(join(USER_DATA, "community-tool-data", "contoso.record-counter.json"))).toBe(true);
  });

  it("rejects tool storage above 1 MB", async () => {
    const { store, writeTool } = setup();
    await store.addFolder(writeTool("counter"));

    await expect(
      store.writeStorage("contoso.record-counter", { value: "x".repeat(1.1 * 1024 * 1024) }),
    ).rejects.toThrow("Tool storage is limited to 1 MB");
  });

  it("refuses storage and consent for an id that is not a loaded tool", async () => {
    const { store } = setup();

    await expect(store.readStorage("contoso.unknown")).rejects.toThrow("Community tool not found");
    await expect(store.writeStorage("contoso.unknown", {})).rejects.toThrow("Community tool not found");
    await expect(store.grantConsent("contoso.unknown")).rejects.toThrow("Community tool not found");
  });
});
