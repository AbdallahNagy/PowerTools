// Remembers community tool folders, consent, and per-tool storage.
// All file access is injected, and there is no Electron import, so it stays unit-testable.
import { createHash } from "node:crypto";
import { isAbsolute, join, relative, resolve } from "node:path";
import { parseManifest, type CommunityToolManifest } from "./manifest.js";

export const MANIFEST_FILE = "powertools-tool.json";
const STATE_FILE = "community-tools.json";
const STORAGE_DIR = "community-tool-data";
const MAX_ICON_BYTES = 256 * 1024;
const MAX_STORAGE_BYTES = 1024 * 1024;

export interface LoadedCommunityTool {
  /** Manifest id, or the folder path when there is no valid manifest. */
  id: string;
  folder: string;
  status: "ready" | "invalid" | "missing";
  errors: string[];
  manifest: CommunityToolManifest | null;
  /** data:image/svg+xml;base64,... */
  iconDataUrl: string | null;
  /** True when the stored consent hash matches the current permission set. */
  consentGranted: boolean;
}

/** The file operations the store needs. `main.ts` passes a node:fs/promises implementation. */
export interface ToolStoreFs {
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  /** Creates the folder and its parents; no error when it exists. */
  mkdir(path: string): Promise<void>;
  /** Size in bytes. */
  size(path: string): Promise<number>;
}

export interface ToolStoreDeps {
  userDataPath: string;
  hostVersion: string;
  builtInToolIds: readonly string[];
  fs: ToolStoreFs;
}

export type ToolStore = ReturnType<typeof createToolStore>;

interface StoreState {
  folders: string[];
  consent: Record<string, string>;
  /** Manifest id by folder, so consent can be cleared when the folder is gone. Absent in older files. */
  ids: Record<string, string>;
}

/** SHA-256 of the sorted permission, message, and network lists. */
export function consentHash(manifest: Pick<CommunityToolManifest, "permissions" | "messages" | "network">): string {
  const sorted = (list: string[]) => [...list].sort();
  const payload = JSON.stringify({
    permissions: sorted(manifest.permissions),
    messages: sorted(manifest.messages),
    network: sorted(manifest.network),
  });
  return createHash("sha256").update(payload).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseState(text: string): StoreState {
  try {
    const value: unknown = JSON.parse(text);
    if (!isRecord(value)) return { folders: [], consent: {}, ids: {} };
    const folders = Array.isArray(value.folders) ? value.folders.filter((f): f is string => typeof f === "string") : [];
    const consent: Record<string, string> = {};
    if (isRecord(value.consent)) {
      for (const [id, hash] of Object.entries(value.consent)) {
        if (typeof hash === "string") consent[id] = hash;
      }
    }
    const ids: Record<string, string> = {};
    if (isRecord(value.ids)) {
      for (const [folder, id] of Object.entries(value.ids)) {
        if (typeof id === "string") ids[folder] = id;
      }
    }
    return { folders, consent, ids };
  } catch {
    return { folders: [], consent: {}, ids: {} };
  }
}

function duplicateIdError(id: string): string {
  return `A tool with id "${id}" is already loaded`;
}

export function createToolStore({ userDataPath, hostVersion, builtInToolIds, fs }: ToolStoreDeps) {
  const statePath = join(userDataPath, STATE_FILE);
  const storageDir = join(userDataPath, STORAGE_DIR);
  // Ready tools from the last list(), by id.
  let ready = new Map<string, LoadedCommunityTool>();

  async function readState(): Promise<StoreState> {
    if (!(await fs.exists(statePath))) return { folders: [], consent: {}, ids: {} };
    try {
      return parseState(await fs.readText(statePath));
    } catch {
      return { folders: [], consent: {}, ids: {} };
    }
  }

  async function writeState(state: StoreState): Promise<void> {
    await fs.mkdir(userDataPath);
    await fs.writeText(statePath, JSON.stringify(state, null, 2));
  }

  function failed(folder: string, status: "invalid" | "missing", errors: string[]): LoadedCommunityTool {
    return { id: folder, folder, status, errors, manifest: null, iconDataUrl: null, consentGranted: false };
  }

  async function readIcon(folder: string, icon: string): Promise<string> {
    const iconPath = resolve(folder, icon);
    const inside = relative(folder, iconPath);
    if (inside.length === 0 || inside.startsWith("..") || isAbsolute(inside)) {
      throw new Error(`icon: "${icon}" must be a relative path inside the package`);
    }
    if (!(await fs.exists(iconPath))) throw new Error(`icon: "${icon}" not found`);
    if ((await fs.size(iconPath)) > MAX_ICON_BYTES) throw new Error("Icon is larger than 256 KB");
    const svg = await fs.readText(iconPath);
    return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
  }

  async function loadFolder(folder: string, consent: Record<string, string>): Promise<LoadedCommunityTool> {
    if (!(await fs.exists(folder))) return failed(folder, "missing", ["Folder not found"]);

    const manifestPath = join(folder, MANIFEST_FILE);
    if (!(await fs.exists(manifestPath))) return failed(folder, "invalid", [`${MANIFEST_FILE} not found`]);

    let json: unknown;
    try {
      json = JSON.parse(await fs.readText(manifestPath));
    } catch {
      return failed(folder, "invalid", [`${MANIFEST_FILE} is not valid JSON`]);
    }

    const parsed = parseManifest(json, hostVersion);
    if (!parsed.ok) return failed(folder, "invalid", parsed.errors);
    const { manifest } = parsed;

    let iconDataUrl: string;
    try {
      iconDataUrl = await readIcon(folder, manifest.icon);
    } catch (err) {
      return failed(folder, "invalid", [(err as Error).message]);
    }

    return {
      id: manifest.id,
      folder,
      status: "ready",
      errors: [],
      manifest,
      iconDataUrl,
      consentGranted: consent[manifest.id] === consentHash(manifest),
    };
  }

  /** Loads every folder in order. A later folder whose id is taken is listed as invalid. */
  async function loadAll(state: StoreState): Promise<LoadedCommunityTool[]> {
    const taken = new Set(builtInToolIds);
    const tools: LoadedCommunityTool[] = [];
    for (const folder of state.folders) {
      const tool = await loadFolder(folder, state.consent);
      if (tool.status === "ready" && taken.has(tool.id)) {
        tools.push(failed(folder, "invalid", [duplicateIdError(tool.id)]));
        continue;
      }
      if (tool.status === "ready") taken.add(tool.id);
      tools.push(tool);
    }
    ready = new Map(tools.filter((tool) => tool.status === "ready").map((tool) => [tool.id, tool]));
    return tools;
  }

  function requireReady(id: string): LoadedCommunityTool {
    const tool = ready.get(id);
    if (!tool) throw new Error("Community tool not found");
    return tool;
  }

  function storagePath(id: string): string {
    return join(storageDir, `${requireReady(id).id}.json`);
  }

  return {
    /** Re-reads every remembered folder and its manifest. */
    async list(): Promise<LoadedCommunityTool[]> {
      return loadAll(await readState());
    },

    async addFolder(folderInput: string): Promise<LoadedCommunityTool> {
      const folder = resolve(folderInput);
      const state = await readState();
      const current = await loadAll(state);

      const existing = current.find((tool) => tool.folder === folder);
      if (existing) return existing;

      const tool = await loadFolder(folder, state.consent);
      if (tool.status === "ready" && (builtInToolIds.includes(tool.id) || ready.has(tool.id))) {
        throw new Error(duplicateIdError(tool.id));
      }

      const ids = tool.status === "ready" ? { ...state.ids, [folder]: tool.id } : state.ids;
      await writeState({ ...state, folders: [...state.folders, folder], ids });
      if (tool.status === "ready") ready.set(tool.id, tool);
      return tool;
    },

    /** Forgets a tool by id (or by folder for a tool without a valid manifest) and its consent. */
    async remove(id: string): Promise<void> {
      const state = await readState();
      const tools = await loadAll(state);
      const tool = tools.find((entry) => entry.id === id);
      if (!tool) return;
      // A missing or broken folder has no readable manifest, so use the id recorded when it was added.
      const consentId = tool.manifest?.id ?? state.ids[tool.folder] ?? id;
      const stillUsed = tools.some((entry) => entry !== tool && entry.status === "ready" && entry.id === consentId);
      const consent = { ...state.consent };
      if (!stillUsed) delete consent[consentId];
      const ids = { ...state.ids };
      delete ids[tool.folder];
      await writeState({ folders: state.folders.filter((folder) => folder !== tool.folder), consent, ids });
      ready.delete(id);
    },

    async grantConsent(id: string): Promise<void> {
      const tool = requireReady(id);
      const state = await readState();
      await writeState({
        ...state,
        consent: { ...state.consent, [id]: consentHash(tool.manifest!) },
        ids: { ...state.ids, [tool.folder]: id },
      });
      ready.set(id, { ...tool, consentGranted: true });
    },

    /** Folder of a ready tool, for the protocol handler. */
    folderFor(id: string): string | null {
      return ready.get(id)?.folder ?? null;
    },

    /** True when the tool is ready and the user has reviewed its current permission set. */
    isConsented(id: string): boolean {
      return ready.get(id)?.consentGranted ?? false;
    },

    manifestFor(id: string): CommunityToolManifest | null {
      return ready.get(id)?.manifest ?? null;
    },

    async readStorage(id: string): Promise<Record<string, unknown>> {
      const path = storagePath(id);
      if (!(await fs.exists(path))) return {};
      try {
        const value: unknown = JSON.parse(await fs.readText(path));
        return isRecord(value) ? value : {};
      } catch {
        return {};
      }
    },

    async writeStorage(id: string, data: Record<string, unknown>): Promise<void> {
      const path = storagePath(id);
      const text = JSON.stringify(data);
      if (Buffer.byteLength(text, "utf8") > MAX_STORAGE_BYTES) throw new Error("Tool storage is limited to 1 MB");
      await fs.mkdir(storageDir);
      await fs.writeText(path, text);
    },
  };
}
