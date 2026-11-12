import { buildFetchXml, type RetrieveMultipleQuery } from "./fetchXmlQuery";
import type {
  BatchOperation,
  ConnectionSnapshot,
  DataRecord,
  EntityRef,
  ErrorCode,
  FetchPage,
  FileFilter,
  HostEvent,
  MethodArgs,
  MethodName,
  ReadyMessage,
  ThemeSnapshot,
  ToastType,
  ToolRequest,
} from "./protocol";

/** Rejection reason for every SDK call the host refuses or fails. */
export class ToolClientError extends Error {
  readonly code: ErrorCode;
  readonly dataverseCode?: number;

  constructor(code: ErrorCode, message: string, dataverseCode?: number) {
    super(message);
    this.name = "ToolClientError";
    this.code = code;
    this.dataverseCode = dataverseCode;
  }
}

export type Unsubscribe = () => void;

export interface FetchXmlOptions { page?: number; pagingCookie?: string | null; pageSize?: number }
export interface OpenedFile { name: string; content: string }

export interface PowerToolsClient {
  connection: {
    get(): Promise<ConnectionSnapshot | null>;
    onChange(listener: (connection: ConnectionSnapshot | null) => void): Unsubscribe;
  };
  data: {
    retrieve(table: string, id: string, columns: string[]): Promise<DataRecord>;
    retrieveMultiple(table: string, query: RetrieveMultipleQuery, options?: FetchXmlOptions): Promise<FetchPage>;
    fetchXml(fetchXml: string, options?: FetchXmlOptions): Promise<FetchPage>;
    create(table: string, values: Record<string, unknown>): Promise<string>;
    update(table: string, id: string, values: Record<string, unknown>): Promise<void>;
    delete(table: string, id: string): Promise<void>;
    associate(table: string, id: string, relationship: string, related: EntityRef[]): Promise<void>;
    disassociate(table: string, id: string, relationship: string, related: EntityRef[]): Promise<void>;
    execute<T = unknown>(message: string, parameters?: Record<string, unknown>): Promise<T>;
    batch<T = unknown>(operations: BatchOperation[], options?: { continueOnError?: boolean }): Promise<T>;
  };
  metadata: {
    tables<T = unknown>(): Promise<T>;
    table<T = unknown>(table: string): Promise<T>;
    columns<T = unknown>(table: string): Promise<T>;
    relationships<T = unknown>(table: string): Promise<T>;
    choices<T = unknown>(table: string, column: string): Promise<T>;
  };
  shell: {
    toast(type: ToastType, message: string): Promise<void>;
    setStatus(text: string | null): Promise<void>;
    confirm(title: string, message: string): Promise<boolean>;
    openRecord(table: string, id: string): Promise<void>;
    openSolution(solutionId: string): Promise<void>;
    openFile(filters?: FileFilter[]): Promise<OpenedFile | null>;
    saveFile(suggestedName: string, content: string): Promise<boolean>;
    copyText(text: string): Promise<void>;
  };
  storage: {
    get<T = unknown>(key: string): Promise<T | undefined>;
    set(key: string, value: unknown): Promise<void>;
    remove(key: string): Promise<void>;
  };
  theme: {
    current(): ThemeSnapshot;
    onChange(listener: (theme: ThemeSnapshot) => void): Unsubscribe;
  };
  /** Sends one protocol request. Used by the SDK itself; tools should prefer the namespaces above. */
  call<M extends MethodName, R = unknown>(method: M, args: MethodArgs[M]): Promise<R>;
}

interface Pending { resolve: (value: unknown) => void; reject: (reason: unknown) => void }

function isResponse(data: unknown): data is { id: number; ok: boolean; result?: unknown; error?: unknown } {
  return typeof data === "object" && data !== null && typeof (data as { id?: unknown }).id === "number" && "ok" in data;
}

function isToolError(value: unknown): value is { code: ErrorCode; message: string; dataverseCode?: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { code?: unknown }).code === "string" &&
    typeof (value as { message?: unknown }).message === "string"
  );
}

function isHostEvent(data: unknown): data is HostEvent {
  return typeof data === "object" && data !== null && (data as { type?: unknown }).type === "event";
}

function listenerSet<T>() {
  const listeners = new Set<(value: T) => void>();
  return {
    add(listener: (value: T) => void): Unsubscribe {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(value: T) {
      for (const listener of [...listeners]) listener(value);
    },
  };
}

/** Wraps a connected host port. `ready` is the handshake reply that opened it. */
export function createClient(port: MessagePort, ready: ReadyMessage): PowerToolsClient {
  let nextId = 1;
  const pending = new Map<number, Pending>();
  let theme = ready.theme;
  const themeListeners = listenerSet<ThemeSnapshot>();
  const connectionListeners = listenerSet<ConnectionSnapshot | null>();

  let closed = false;
  const CLOSED = () => new ToolClientError("Cancelled", "The connection to Power Tools was closed.");

  // A closed port never answers, so settle what is waiting instead of leaving it pending forever.
  port.addEventListener("close", () => {
    closed = true;
    for (const [id, entry] of [...pending]) {
      pending.delete(id);
      entry.reject(CLOSED());
    }
  });

  port.onmessage = (event: MessageEvent) => {
    const data: unknown = event.data;
    if (isResponse(data)) {
      const entry = pending.get(data.id);
      if (!entry) return;
      pending.delete(data.id);
      if (data.ok === true) entry.resolve(data.result);
      else if (isToolError(data.error)) {
        entry.reject(new ToolClientError(data.error.code, data.error.message, data.error.dataverseCode));
      } else entry.reject(new ToolClientError("Internal", "The host sent a reply the SDK could not read."));
      return;
    }
    if (isHostEvent(data)) {
      if (data.event === "theme") {
        theme = data.theme;
        themeListeners.emit(theme);
      } else if (data.event === "connection") {
        connectionListeners.emit(data.connection);
      }
    }
  };

  function call<M extends MethodName, R = unknown>(method: M, args: MethodArgs[M]): Promise<R> {
    const id = nextId++;
    return new Promise<R>((resolve, reject) => {
      if (closed) {
        reject(CLOSED());
        return;
      }
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      const request: ToolRequest = { id, method, args };
      port.postMessage(request);
    });
  }

  function fetchXml(xml: string, options: FetchXmlOptions = {}): Promise<FetchPage> {
    return call("data.fetchXml", { fetchXml: xml, ...options });
  }

  return {
    connection: {
      get: () => call("connection.get", {}),
      onChange: connectionListeners.add,
    },
    data: {
      retrieve: (table, id, columns) => call("data.retrieve", { table, id, columns }),
      retrieveMultiple: (table, query, options) => fetchXml(buildFetchXml(table, query), options),
      fetchXml,
      create: (table, values) => call("data.create", { table, values }),
      update: (table, id, values) => call("data.update", { table, id, values }),
      delete: (table, id) => call("data.delete", { table, id }),
      associate: (table, id, relationship, related) => call("data.associate", { table, id, relationship, related }),
      disassociate: (table, id, relationship, related) => call("data.disassociate", { table, id, relationship, related }),
      execute: (message, parameters = {}) => call("data.execute", { message, parameters }),
      batch: (operations, options = {}) =>
        call("data.batch", { operations, continueOnError: options.continueOnError ?? false }),
    },
    metadata: {
      tables: () => call("metadata.tables", {}),
      table: (table) => call("metadata.table", { table }),
      columns: (table) => call("metadata.columns", { table }),
      relationships: (table) => call("metadata.relationships", { table }),
      choices: (table, column) => call("metadata.choices", { table, column }),
    },
    shell: {
      toast: (type, message) => call("shell.toast", { type, message }),
      setStatus: (text) => call("shell.setStatus", { text }),
      confirm: (title, message) => call("shell.confirm", { title, message }),
      openRecord: (table, id) => call("shell.openRecord", { table, id }),
      openSolution: (solutionId) => call("shell.openSolution", { solutionId }),
      openFile: (filters = []) => call("shell.openFile", { filters }),
      saveFile: (suggestedName, content) => call("shell.saveFile", { suggestedName, content }),
      copyText: (text) => call("shell.copyText", { text }),
    },
    storage: {
      get: (key) => call("storage.get", { key }),
      set: (key, value) => call("storage.set", { key, value }),
      remove: (key) => call("storage.remove", { key }),
    },
    theme: {
      current: () => theme,
      onChange: themeListeners.add,
    },
    call,
  };
}
