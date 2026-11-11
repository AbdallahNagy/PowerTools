// Wire protocol between a community tool frame and the Power Tools host.
// Pure types and constants with no imports: the desktop app imports this file by source path.

export const PROTOCOL_VERSION = 1;
export const CONNECT_MESSAGE = "pt-tool:connect";

export const PERMISSIONS = ["data:read", "data:write", "data:delete", "metadata:read", "metadata:write", "files"] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const METHODS = [
  "connection.get",
  "data.retrieve", "data.fetchXml", "data.create", "data.update", "data.delete",
  "data.associate", "data.disassociate", "data.execute", "data.batch",
  "metadata.tables", "metadata.table", "metadata.columns", "metadata.relationships", "metadata.choices",
  "shell.toast", "shell.setStatus", "shell.confirm", "shell.openRecord", "shell.openSolution",
  "shell.openFile", "shell.saveFile", "shell.copyText", "shell.shortcut",
  "storage.get", "storage.set", "storage.remove",
] as const;
export type MethodName = (typeof METHODS)[number];

export type ErrorCode = "PermissionDenied" | "NoConnection" | "DataverseFault" | "Throttled" | "Cancelled" | "InvalidRequest" | "Internal";
export interface ToolError { code: ErrorCode; message: string; dataverseCode?: number }

export interface ToolRequest { id: number; method: MethodName; args: unknown }
export type ToolResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: ToolError };

export interface ConnectionSnapshot { displayName: string; kind: "online" | "onpremise" }
/** Token keys are CSS custom property names, for example "--color-canvas". */
export interface ThemeSnapshot { name: "dark" | "light"; tokens: Record<string, string> }
export interface ShortcutSpec { key: string; code?: string; ctrl: boolean; shift: boolean }

export interface HelloMessage { type: "hello"; protocolVersion: number }
export interface ReadyMessage { type: "ready"; protocolVersion: number; theme: ThemeSnapshot; connection: ConnectionSnapshot | null; shortcuts: ShortcutSpec[] }
export type HostEvent =
  | { type: "event"; event: "theme"; theme: ThemeSnapshot }
  | { type: "event"; event: "connection"; connection: ConnectionSnapshot | null };

export interface EntityRef { logicalName: string; id: string; name?: string }
export interface DataRecord { logicalName: string; id: string; values: Record<string, unknown>; formatted: Record<string, string> }
export interface FetchPage { records: DataRecord[]; moreRecords: boolean; pagingCookie: string | null; page: number }
export type BatchOperation =
  | { op: "create"; table: string; values: Record<string, unknown> }
  | { op: "update"; table: string; id: string; values: Record<string, unknown> }
  | { op: "delete"; table: string; id: string };

/**
 * Value encoding inside `values` and execute parameters: strings, numbers, booleans,
 * and null are plain; typed values carry a "$type" discriminator.
 */
export type TypedValue =
  | { $type: "EntityReference"; logicalName: string; id: string; name?: string }
  | { $type: "OptionSetValue"; value: number }
  | { $type: "Money"; value: number }
  | { $type: "Decimal"; value: number }
  | { $type: "Double"; value: number }
  | { $type: "DateTime"; value: string }
  | { $type: "Guid"; value: string }
  | { $type: "OptionSetValueCollection"; values: number[] };

export type ToastType = "info" | "success" | "warning" | "error";
export interface FileFilter { name: string; extensions: string[] }

/** The single `args` object each method sends. */
export interface MethodArgs {
  "connection.get": Record<string, never>;
  "data.retrieve": { table: string; id: string; columns: string[] };
  "data.fetchXml": { fetchXml: string; page?: number; pagingCookie?: string | null; pageSize?: number };
  "data.create": { table: string; values: Record<string, unknown> };
  "data.update": { table: string; id: string; values: Record<string, unknown> };
  "data.delete": { table: string; id: string };
  "data.associate": { table: string; id: string; relationship: string; related: EntityRef[] };
  "data.disassociate": { table: string; id: string; relationship: string; related: EntityRef[] };
  "data.execute": { message: string; parameters: Record<string, unknown> };
  "data.batch": { operations: BatchOperation[]; continueOnError: boolean };
  "metadata.tables": Record<string, never>;
  "metadata.table": { table: string };
  "metadata.columns": { table: string };
  "metadata.relationships": { table: string };
  "metadata.choices": { table: string; column: string };
  "shell.toast": { type: ToastType; message: string };
  "shell.setStatus": { text: string | null };
  "shell.confirm": { title: string; message: string };
  "shell.openRecord": { table: string; id: string };
  "shell.openSolution": { solutionId: string };
  "shell.openFile": { filters: FileFilter[] };
  "shell.saveFile": { suggestedName: string; content: string };
  "shell.copyText": { text: string };
  "shell.shortcut": { key: string; code: string; ctrlKey: boolean; shiftKey: boolean };
  "storage.get": { key: string };
  "storage.set": { key: string; value: unknown };
  "storage.remove": { key: string };
}
