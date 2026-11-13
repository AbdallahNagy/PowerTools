// Remembers community tool folders, consent, and per-tool storage.
// All file access is injected, and there is no Electron import, so it stays unit-testable.
import { createHash } from "node:crypto";
import { isAbsolute, join, relative, resolve } from "node:path";
import { ID_PATTERN, parseManifest, type CommunityToolManifest } from "./manifest.js";

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
  /** Resolves symlinks; rejects when the path does not exist. */
  realpath(path: string): Promise<string>;
  /** Deletes a file; no error when it does not exist. */
  remove(path: string): Promise<void>;
  /** Sizes in bytes of every file under the folder, at any depth. */
  fileSizes(folder: string): Promise<number[]>;
}

export interface ToolStoreDeps {
  userDataPath: string;
  hostVersion: string;
  builtInToolIds: readonly string[];
  fs: ToolStoreFs;
}

export type ToolStore = ReturnType<typeof createToolStore>;

interface Grant {
  id: string;
  /** Hash of the reviewed permission set; empty for a folder that was added but not yet reviewed. */
  hash: string;
}

interface StoreState {
  folders: string[];
  /** Consent by tool id alone, as older versions wrote it. Read, never added to. */
  consent: Record<string, string>;
  /** Manifest id by folder, so consent can be cleared when the folder is gone. Absent in older files. */
  ids: Record<string, string>;
  /** Consent by folder: the id and permission set the user reviewed in that folder. */
  grants: Record<string, Grant>;
}

const emptyState = (): StoreState => ({ folders: [], consent: {}, ids: {}, grants: {} });

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
    if (!isRecord(value)) return emptyState();
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
    const grants: Record<string, Grant> = {};
    if (isRecord(value.grants)) {
      for (const [folder, grant] of Object.entries(value.grants)) {
        if (isRecord(grant) && typeof grant.id === "string" && typeof grant.hash === "string") {
          grants[folder] = { id: grant.id, hash: grant.hash };
        }
      }
    }
    return { folders, consent, ids, grants };
  } catch {
    return emptyState();
  }
}

function isOutside(folder: string, path: string): boolean {
  const inside = relative(folder, path);
  return inside.length === 0 || inside.startsWith("..") || isAbsolute(inside);
}

function duplicateIdError(id: string): string {
  return `A tool with id "${id}" is already loaded`;
}

/**
 * Whether the user reviewed this exact permission set for this tool in this folder.
 * A folder with a grant entry is decided by it alone. For a folder without one, consent an older version
 * stored by id counts only when this is the one folder recorded with that id (or, in a file that recorded
 * no ids at all, the id is unclaimed), so a different folder that reuses an id never inherits it.
 */
function isGranted(state: StoreState, folder: string, id: string, hash: string): boolean {
  const grant = state.grants[folder];
  if (grant) return grant.id === id && grant.hash !== "" && grant.hash === hash;
  if (state.consent[id] !== hash) return false;
  const recorded = Object.values(state.ids).filter((recordedId) => recordedId === id).length;
  const own = state.ids[folder];
  return own === undefined ? recorded === 0 : own === id && recorded === 1;
}

export function createToolStore({ userDataPath, hostVersion, builtInToolIds, fs }: ToolStoreDeps) {
  const statePath = join(userDataPath, STATE_FILE);
  const storageDir = join(userDataPath, STORAGE_DIR);
  // Ready tools from the last list(), by id.
  let ready = new Map<string, LoadedCommunityTool>();

  // Operations that read and write the state file or the ready map run one at a time, in call order, so a slow
  // list() that started first cannot overwrite what a later addFolder() recorded.
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const run = queue.then(work);
    queue = run.catch(() => undefined);
    return run;
  }

  async function readState(): Promise<StoreState> {
    if (!(await fs.exists(statePath))) return emptyState();
    try {
      return parseState(await fs.readText(statePath));
    } catch {
      return emptyState();
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
    if (isOutside(folder, iconPath)) throw new Error(`icon: "${icon}" must be a relative path inside the package`);
    if (!(await fs.exists(iconPath))) throw new Error(`icon: "${icon}" not found`);
    // A symlink inside the folder can point anywhere, so check where the file really is.
    if (isOutside(await fs.realpath(folder), await fs.realpath(iconPath))) {
      throw new Error(`icon: "${icon}" must be a file inside the package`);
    }
    if ((await fs.size(iconPath)) > MAX_ICON_BYTES) throw new Error("Icon is larger than 256 KB");
    const svg = await fs.readText(iconPath);
    // The file may have grown since it was measured.
    if (Buffer.byteLength(svg, "utf8") > MAX_ICON_BYTES) throw new Error("Icon is larger than 256 KB");
    return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
  }

  async function loadFolder(folder: string, state: StoreState): Promise<LoadedCommunityTool> {
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
      consentGranted: isGranted(state, folder, manifest.id, consentHash(manifest)),
    };
  }

  /** Loads every folder in order. A later folder whose id is taken is listed as invalid. */
  async function loadAll(state: StoreState): Promise<LoadedCommunityTool[]> {
    const taken = new Set(builtInToolIds);
    const tools: LoadedCommunityTool[] = [];
    for (const folder of state.folders) {
      const tool = await loadFolder(folder, state);
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
    list(): Promise<LoadedCommunityTool[]> {
      return serial(async () => loadAll(await readState()));
    },

    addFolder(folderInput: string): Promise<LoadedCommunityTool> {
      return serial(async () => {
        const folder = resolve(folderInput);
        const state = await readState();
        const current = await loadAll(state);

        const existing = current.find((tool) => tool.folder === folder);
        if (existing) return existing;

        // A new folder starts unreviewed, whatever an older folder with the same id was granted.
        const tool = await loadFolder(folder, { ...state, grants: { ...state.grants, [folder]: { id: "", hash: "" } } });
        if (tool.status === "ready" && (builtInToolIds.includes(tool.id) || ready.has(tool.id))) {
          throw new Error(duplicateIdError(tool.id));
        }

        const isReady = tool.status === "ready";
        await writeState({
          ...state,
          folders: [...state.folders, folder],
          ids: isReady ? { ...state.ids, [folder]: tool.id } : state.ids,
          grants: isReady ? { ...state.grants, [folder]: { id: tool.id, hash: "" } } : state.grants,
        });
        if (isReady) ready.set(tool.id, tool);
        return tool;
      });
    },

    /** Forgets a tool by id (or by folder for a tool without a valid manifest), its consent, and its stored settings. */
    remove(id: string): Promise<void> {
      return serial(async () => {
        const state = await readState();
        const tools = await loadAll(state);
        const tool = tools.find((entry) => entry.id === id);
        if (!tool) return;
        // A missing or broken folder has no readable manifest, so use the id recorded when it was added.
        const toolId = tool.manifest?.id ?? state.ids[tool.folder] ?? state.grants[tool.folder]?.id ?? id;
        const consent = { ...state.consent };
        const ids = { ...state.ids };
        const grants = { ...state.grants };
        delete ids[tool.folder];
        delete grants[tool.folder];
        // Consent kept by id alone belongs to no folder in particular; drop it once no folder claims the id.
        const stillUsed = Object.values(ids).includes(toolId);
        if (!stillUsed) delete consent[toolId];
        await writeState({ folders: state.folders.filter((folder) => folder !== tool.folder), consent, ids, grants });
        ready.delete(id);
        if (!stillUsed && ID_PATTERN.test(toolId)) await fs.remove(join(storageDir, `${toolId}.json`));
      });
    },

    grantConsent(id: string): Promise<void> {
      return serial(async () => {
        const tool = requireReady(id);
        const state = await readState();
        await writeState({
          ...state,
          ids: { ...state.ids, [tool.folder]: id },
          grants: { ...state.grants, [tool.folder]: { id, hash: consentHash(tool.manifest!) } },
        });
        ready.set(id, { ...tool, consentGranted: true });
      });
    },

    /** Total size of the tool's folder in bytes, and how many files it holds. */
    async bundleSize(id: string): Promise<{ bytes: number; files: number }> {
      const sizes = await fs.fileSizes(requireReady(id).folder);
      return { bytes: sizes.reduce((total, size) => total + size, 0), files: sizes.length };
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
