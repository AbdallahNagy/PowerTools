import { isAxiosError } from "axios";
import type { ConnectionSnapshot, ErrorCode, ToolError } from "@powertools/sdk/protocol";

import { desktopBridge } from "../../platform/desktopBridge";
import { api } from "../../shared/api/client";
import {
  buildDynamicsRecordUrl,
  solutionEditorUrl,
  type ConnectionInfo,
  type useOpenInBrowser,
} from "../../shared/connections";
import type { useToast } from "../../shared/ui";
import type { BrokerServices } from "./broker";

const API_PREFIX = "/api/community-tools/";
const MAX_STATUS_LENGTH = 200;

const INTERNAL: ToolError = { code: "Internal", message: "The host could not complete the request." };
const KNOWN_CODES: ReadonlySet<string> = new Set<ErrorCode>([
  "PermissionDenied",
  "NoConnection",
  "DataverseFault",
  "Throttled",
  "Cancelled",
  "InvalidRequest",
  "Internal",
]);

function mapSidecarError(error: unknown): ToolError {
  if (isAxiosError(error)) {
    const body: unknown = error.response?.data;
    if (typeof body === "object" && body !== null) {
      const { code, message, dataverseCode } = body as Record<string, unknown>;
      if (typeof code === "string" && KNOWN_CODES.has(code)) {
        const mapped: ToolError = {
          code: code as ErrorCode,
          message: typeof message === "string" ? message : INTERNAL.message,
        };
        if (typeof dataverseCode === "number") mapped.dataverseCode = dataverseCode;
        return mapped;
      }
    }
  }
  return { ...INTERNAL };
}

/** Whether a request can be replayed after a token refresh without repeating a write. */
function isReplayable(method: "GET" | "POST", path: string): boolean {
  return method === "GET" || path.endsWith("/data/retrieve") || path.endsWith("/data/fetch");
}

/** What a tool is told about its connection: a display name and a kind, never an id or a URL. */
export function connectionSnapshot(
  connection: { displayName: string; crmType: ConnectionSnapshot["kind"] } | null,
): ConnectionSnapshot | null {
  return connection ? { displayName: connection.displayName, kind: connection.crmType } : null;
}

// Storage is read-modify-write on the whole file, so run one operation at a time per tool. The chain is
// per tool id, not per tab: two tabs of one tool write the same file and must not lose each other's updates.
const storageChains = new Map<string, Promise<unknown>>();

export function createHostServices(input: {
  toolId: string;
  toolName: string;
  getConnection(): ConnectionInfo | null;
  openInBrowser: ReturnType<typeof useOpenInBrowser>;
  toast: ReturnType<typeof useToast>;
  setStatus(text: string | null): void;
  requestConfirm(options: { title: string; message: string; confirmLabel: string }): Promise<boolean>;
  dispatchShortcut(keys: { key: string; code?: string; ctrlKey: boolean; shiftKey: boolean }): void;
  /** True when this tool's tab is the active tab. */
  isActive(): boolean;
}): BrokerServices {
  const { toolId, getConnection, openInBrowser, toast } = input;

  function storageOp<T>(work: () => Promise<T>): Promise<T> {
    const run = (storageChains.get(toolId) ?? Promise.resolve()).then(work);
    const settled = run.catch(() => undefined);
    storageChains.set(toolId, settled);
    // Forget an idle chain so the map does not keep a promise for every tool ever opened.
    void settled.then(() => {
      if (storageChains.get(toolId) === settled) storageChains.delete(toolId);
    });
    return run.catch(() => {
      throw { ...INTERNAL };
    });
  }

  return {
    getConnection() {
      return connectionSnapshot(getConnection());
    },

    connectionKey() {
      return getConnection()?.id ?? null;
    },

    isActive: input.isActive,

    async callSidecar(method, path, body, connectionKey) {
      if (!path.startsWith(API_PREFIX) || path.split("/").includes("..")) throw { ...INTERNAL };
      if (connectionKey === null) {
        throw { code: "NoConnection", message: "This tab is not connected to an environment." } satisfies ToolError;
      }
      try {
        const response = await api.request({
          method,
          url: path,
          data: body,
          meta: { connectionId: connectionKey, noAuthRetry: !isReplayable(method, path) },
        });
        return response.data as unknown;
      } catch (error) {
        throw mapSidecarError(error);
      }
    },

    toast(type, message) {
      toast.showToast(message, type);
    },

    setStatus(text) {
      input.setStatus(text === null ? null : text.slice(0, MAX_STATUS_LENGTH));
    },

    confirm(title, message) {
      return input.requestConfirm({ title, message, confirmLabel: "Confirm" });
    },

    openRecord(table, id) {
      const connection = getConnection();
      if (!connection) return;
      void openInBrowser(buildDynamicsRecordUrl({ envUrl: connection.envUrl, entityLogicalName: table, recordId: id }));
    },

    openSolution(solutionId) {
      const connection = getConnection();
      if (!connection) return;
      void openInBrowser(solutionEditorUrl(connection.envUrl, solutionId));
    },

    async openFile(filters) {
      let result;
      try {
        result = await desktopBridge.openFileForCommunityTool(toolId, filters);
      } catch {
        throw { ...INTERNAL };
      }
      if (result === null) return null;
      if ("error" in result) throw { code: "Internal", message: result.error } satisfies ToolError;
      return result;
    },

    async saveFile(suggestedName, content) {
      try {
        return await desktopBridge.saveFileForCommunityTool(toolId, suggestedName, content);
      } catch {
        throw { ...INTERNAL };
      }
    },

    async copyText(text) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        throw { ...INTERNAL };
      }
    },

    dispatchShortcut: input.dispatchShortcut,

    storage: {
      get: (key) => storageOp(async () => {
          const data = await desktopBridge.readCommunityToolStorage(toolId);
          return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : undefined;
        }),
      set: (key, value) =>
        storageOp(async () => {
          const data = await desktopBridge.readCommunityToolStorage(toolId);
          await desktopBridge.writeCommunityToolStorage(toolId, { ...data, [key]: value });
        }),
      remove: (key) =>
        storageOp(async () => {
          const data = await desktopBridge.readCommunityToolStorage(toolId);
          if (!Object.prototype.hasOwnProperty.call(data, key)) return;
          const rest = { ...data };
          delete rest[key];
          await desktopBridge.writeCommunityToolStorage(toolId, rest);
        }),
    },
  };
}
