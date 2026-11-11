import {
  METHODS,
  type BatchOperation,
  type ConnectionSnapshot,
  type ErrorCode,
  type HostEvent,
  type MethodName,
  type ThemeSnapshot,
  type ToolError,
  type ToolResponse,
} from "@powertools/sdk/protocol";
import { authorize } from "./permissions";

export interface BrokerServices {
  getConnection(): ConnectionSnapshot | null;
  /** The tab's current connection id. Stays inside host code; it is never sent to the tool. */
  connectionKey(): string | null;
  /** True when this tool's tab is the active tab. */
  isActive(): boolean;
  /** Runs against the connection named by `connectionKey`, not the live one. Rejects with ToolError-shaped objects. */
  callSidecar(method: "GET" | "POST", path: string, body: unknown, connectionKey: string | null): Promise<unknown>;
  toast(type: "info" | "success" | "error", message: string): void;
  setStatus(text: string | null): void;
  confirm(title: string, message: string): Promise<boolean>;
  openRecord(table: string, id: string): void;
  openSolution(solutionId: string): void;
  openFile(filters: Array<{ name: string; extensions: string[] }>): Promise<{ name: string; content: string } | null>;
  saveFile(suggestedName: string, content: string): Promise<boolean>;
  copyText(text: string): Promise<void>;
  dispatchShortcut(keys: { key: string; code?: string; ctrlKey: boolean; shiftKey: boolean }): void;
  storage: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    remove(key: string): Promise<void>;
  };
}

const DEFAULT_MAX_IN_FLIGHT = 4;
const API = "/api/community-tools";
const INTERNAL: ToolError = { code: "Internal", message: "The host could not complete the request." };

const METHOD_SET: ReadonlySet<string> = new Set(METHODS);
const ERROR_CODES: Record<ErrorCode, true> = {
  PermissionDenied: true,
  NoConnection: true,
  DataverseFault: true,
  Throttled: true,
  Cancelled: true,
  InvalidRequest: true,
  Internal: true,
};

type Args = Record<string, unknown>;

class RequestError extends Error {
  readonly toolError: ToolError;
  constructor(toolError: ToolError) {
    super(toolError.message);
    this.toolError = toolError;
  }
}

const fail = (code: ErrorCode, message: string) => new RequestError({ code, message });

// ---- Validation of untrusted input ----

function isRecord(value: unknown): value is Args {
  return Object.prototype.toString.call(value) === "[object Object]";
}

const isText = (value: unknown): value is string => typeof value === "string" && value !== "";
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isGuid = (value: unknown): value is string => typeof value === "string" && GUID_PATTERN.test(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);
const isOptional = (value: unknown, check: (v: unknown) => boolean) => value === undefined || check(value);
const isPositiveInteger = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 1;
// Used as a URL path segment, so "." and ".." and anything with a separator are out.
const isIdentifier = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);

function isEntityRefList(value: unknown): boolean {
  return Array.isArray(value) && value.every((ref) => isRecord(ref) && isText(ref.logicalName) && isText(ref.id));
}

function isBatchOperation(value: unknown): value is BatchOperation {
  if (!isRecord(value) || !isText(value.table)) return false;
  if (value.op === "create") return isRecord(value.values);
  if (value.op === "update") return isText(value.id) && isRecord(value.values);
  return value.op === "delete" && isText(value.id);
}

function isFileFilterList(value: unknown): boolean {
  return Array.isArray(value) && value.every((f) => isRecord(f) && isString(f.name) && isStringArray(f.extensions));
}

const TOAST_TYPES = ["info", "success", "warning", "error"];

/** One check per method over the `args` object; true means the shape is acceptable. */
const ARGS_CHECK: Record<MethodName, (a: Args) => boolean> = {
  "connection.get": () => true,
  "data.retrieve": (a) => isText(a.table) && isText(a.id) && isStringArray(a.columns),
  "data.fetchXml": (a) =>
    isText(a.fetchXml) &&
    isOptional(a.page, isPositiveInteger) &&
    isOptional(a.pageSize, isPositiveInteger) &&
    isOptional(a.pagingCookie, (v) => v === null || isString(v)),
  "data.create": (a) => isText(a.table) && isRecord(a.values),
  "data.update": (a) => isText(a.table) && isText(a.id) && isRecord(a.values),
  "data.delete": (a) => isText(a.table) && isText(a.id),
  "data.associate": (a) => isText(a.table) && isText(a.id) && isText(a.relationship) && isEntityRefList(a.related),
  "data.disassociate": (a) => isText(a.table) && isText(a.id) && isText(a.relationship) && isEntityRefList(a.related),
  "data.execute": (a) => isText(a.message) && isRecord(a.parameters),
  "data.batch": (a) => Array.isArray(a.operations) && a.operations.every(isBatchOperation) && typeof a.continueOnError === "boolean",
  "metadata.tables": () => true,
  "metadata.table": (a) => isIdentifier(a.table),
  "metadata.columns": (a) => isIdentifier(a.table),
  "metadata.relationships": (a) => isIdentifier(a.table),
  "metadata.choices": (a) => isIdentifier(a.table) && isIdentifier(a.column),
  "shell.toast": (a) => typeof a.type === "string" && TOAST_TYPES.includes(a.type) && isString(a.message),
  "shell.setStatus": (a) => a.text === null || isString(a.text),
  "shell.confirm": (a) => isString(a.title) && isString(a.message),
  "shell.openRecord": (a) => isText(a.table) && isText(a.id),
  "shell.openSolution": (a) => isGuid(a.solutionId),
  "shell.openFile": (a) => isFileFilterList(a.filters),
  "shell.saveFile": (a) => isString(a.suggestedName) && isString(a.content),
  "shell.copyText": (a) => isString(a.text),
  "shell.shortcut": (a) => isString(a.key) && isString(a.code) && typeof a.ctrlKey === "boolean" && typeof a.shiftKey === "boolean",
  "storage.get": (a) => isText(a.key),
  "storage.set": (a) => isText(a.key),
  "storage.remove": (a) => isText(a.key),
};

function isSidecarMethod(method: MethodName): boolean {
  return method.startsWith("data.") || method.startsWith("metadata.");
}

function toToolError(error: unknown): ToolError {
  if (error instanceof RequestError) return error.toolError;
  if (isRecord(error) && typeof error.code === "string" && Object.prototype.hasOwnProperty.call(ERROR_CODES, error.code) && typeof error.message === "string") {
    const passed: ToolError = { code: error.code as ErrorCode, message: error.message };
    if (typeof error.dataverseCode === "number") passed.dataverseCode = error.dataverseCode;
    return passed;
  }
  return INTERNAL;
}

// ---- Sidecar routing ----

const enc = encodeURIComponent;

async function runSidecar(services: BrokerServices, method: MethodName, a: Args, key: string | null): Promise<unknown> {
  const post = (route: string) => services.callSidecar("POST", `${API}/data/${route}`, a, key);
  const get = (path: string) => services.callSidecar("GET", `${API}/metadata/tables${path}`, undefined, key);
  switch (method) {
    case "data.retrieve": return post("retrieve");
    case "data.fetchXml": return post("fetch");
    case "data.create": {
      const body = await post("create");
      if (!isRecord(body) || typeof body.id !== "string") throw new Error("Unexpected create response.");
      return body.id;
    }
    case "data.execute": {
      const body = await post("execute");
      if (!isRecord(body)) throw new Error("Unexpected execute response.");
      return body.results;
    }
    case "data.update": return post("update");
    case "data.delete": return post("delete");
    case "data.associate": return post("associate");
    case "data.disassociate": return post("disassociate");
    case "data.batch": return post("batch");
    case "metadata.tables": return get("");
    case "metadata.table": return get(`/${enc(a.table as string)}`);
    case "metadata.columns": return get(`/${enc(a.table as string)}/columns`);
    case "metadata.relationships": return get(`/${enc(a.table as string)}/relationships`);
    case "metadata.choices": return get(`/${enc(a.table as string)}/columns/${enc(a.column as string)}/choices`);
    default: throw new Error(`Not a sidecar method: ${method}`);
  }
}

async function runLocal(services: BrokerServices, method: MethodName, a: Args): Promise<unknown> {
  switch (method) {
    case "connection.get": return services.getConnection();
    case "shell.toast": services.toast(a.type === "warning" ? "info" : (a.type as "info" | "success" | "error"), a.message as string); return undefined;
    case "shell.setStatus": services.setStatus(a.text as string | null); return undefined;
    case "shell.confirm": return (await services.confirm(a.title as string, a.message as string)) === true;
    case "shell.openRecord": services.openRecord(a.table as string, a.id as string); return undefined;
    case "shell.openSolution": services.openSolution(a.solutionId as string); return undefined;
    case "shell.openFile": return services.openFile(a.filters as Array<{ name: string; extensions: string[] }>);
    case "shell.saveFile": return (await services.saveFile(a.suggestedName as string, a.content as string)) === true;
    case "shell.copyText": await services.copyText(a.text as string); return undefined;
    case "shell.shortcut":
      services.dispatchShortcut({ key: a.key as string, code: a.code as string, ctrlKey: a.ctrlKey as boolean, shiftKey: a.shiftKey as boolean });
      return undefined;
    case "storage.get": return services.storage.get(a.key as string);
    case "storage.set": await services.storage.set(a.key as string, a.value); return undefined;
    case "storage.remove": await services.storage.remove(a.key as string); return undefined;
    default: throw new Error(`Not a local method: ${method}`);
  }
}

// ---- Broker ----

export function createBroker(input: {
  manifest: { name: string; permissions: string[]; messages: string[] };
  port: MessagePort;
  services: BrokerServices;
  maxInFlight?: number;
}): {
  notifyTheme(theme: ThemeSnapshot): void;
  notifyConnection(connection: ConnectionSnapshot | null): void;
  dispose(): void;
} {
  const { manifest, port, services } = input;
  const maxInFlight = Math.max(1, input.maxInFlight ?? DEFAULT_MAX_IN_FLIGHT);
  let disposed = false;
  let running = 0;
  const queue: Array<{ run(): void; cancel(error: RequestError): void }> = [];
  const CHANGED = () => fail("Cancelled", "The connection changed before this call ran.");
  const NOT_ACTIVE = () => fail("Cancelled", "This tool is not in the active tab.");

  function post(message: ToolResponse | HostEvent): boolean {
    if (disposed) return false;
    try {
      port.postMessage(message);
      return true;
    } catch {
      return false;
    }
  }

  function reply(id: number, work: Promise<unknown>): void {
    work.then(
      (result) => {
        if (!post({ id, ok: true, result })) post({ id, ok: false, error: INTERNAL });
      },
      (error: unknown) => {
        post({ id, ok: false, error: toToolError(error) });
      },
    );
  }

  function pump(): void {
    while (running < maxInFlight && queue.length > 0) queue.shift()!.run();
  }

  /**
   * Runs a sidecar-bound job now or when a slot frees, in arrival order. A job that has not started
   * when the tab's connection differs from `key` is cancelled instead of run against another environment.
   */
  function schedule<T>(key: string | null, job: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push({
        run() {
          if (disposed) {
            reject(fail("Cancelled", "The tool was closed."));
            return;
          }
          if (services.connectionKey() !== key) {
            reject(CHANGED());
            return;
          }
          running += 1;
          job()
            .then(resolve, reject)
            .finally(() => {
              running -= 1;
              pump();
            });
        },
        cancel: reject,
      });
      pump();
    });
  }

  async function handle(method: MethodName, args: Args): Promise<unknown> {
    const decision = authorize(manifest, method, args);
    if (!decision.ok) throw fail("PermissionDenied", decision.message);
    if (!isSidecarMethod(method)) {
      if (!services.isActive()) {
        if (method === "shell.shortcut") return undefined;
        if (method === "shell.confirm" || method === "shell.openFile" || method === "shell.saveFile") throw NOT_ACTIVE();
      }
      return runLocal(services, method, args);
    }
    const key = services.connectionKey();
    if (services.getConnection() === null || key === null) throw fail("NoConnection", "No connection is open for this tool.");
    return schedule(key, () => runSidecar(services, method, args, key));
  }

  function onMessage(event: MessageEvent): void {
    try {
      const data: unknown = event.data;
      if (!isRecord(data)) return;
      const id = data.id;
      if (typeof id !== "number" || !Number.isFinite(id)) return;
      const method = data.method;
      if (typeof method !== "string" || !METHOD_SET.has(method)) {
        post({ id, ok: false, error: { code: "InvalidRequest", message: "Unknown method." } });
        return;
      }
      const args = data.args;
      if (!isRecord(args) || !ARGS_CHECK[method as MethodName](args)) {
        post({ id, ok: false, error: { code: "InvalidRequest", message: `Invalid arguments for ${method}.` } });
        return;
      }
      reply(id, handle(method as MethodName, args));
    } catch {
      // Untrusted input must never escape the handler.
    }
  }

  port.onmessage = onMessage;

  return {
    notifyTheme(theme) {
      post({ type: "event", event: "theme", theme });
    },
    notifyConnection(connection) {
      for (const pending of queue.splice(0)) pending.cancel(CHANGED());
      post({ type: "event", event: "connection", connection });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      queue.length = 0;
      port.onmessage = null;
      try {
        port.close();
      } catch {
        // already closed
      }
    },
  };
}
