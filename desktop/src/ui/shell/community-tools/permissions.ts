import type { MethodName, Permission } from "@powertools/sdk/protocol";

/**
 * Which permission each protocol method needs. "per-message" and "per-operation"
 * are resolved from the arguments by `authorize`.
 */
export const METHOD_PERMISSION: Record<MethodName, Permission | null | "per-message" | "per-operation"> = {
  "connection.get": null,
  "data.retrieve": "data:read",
  "data.fetchXml": "data:read",
  "data.create": "data:write",
  "data.update": "data:write",
  "data.delete": "data:delete",
  "data.associate": "data:write",
  "data.disassociate": "data:write",
  "data.execute": "per-message",
  "data.batch": "per-operation",
  "metadata.tables": "metadata:read",
  "metadata.table": "metadata:read",
  "metadata.columns": "metadata:read",
  "metadata.relationships": "metadata:read",
  "metadata.choices": "metadata:read",
  "shell.toast": null,
  "shell.setStatus": null,
  "shell.confirm": null,
  "shell.openRecord": null,
  "shell.openSolution": null,
  "shell.openFile": "files",
  "shell.saveFile": "files",
  "shell.copyText": null,
  "shell.shortcut": null,
  "storage.get": null,
  "storage.set": null,
  "storage.remove": null,
};

/** Permission implied by each known Dataverse message. A message missing here is allowed only if declared. */
export const MESSAGE_PERMISSION: Record<string, Permission | null> = {
  WhoAmI: null,
  RetrieveVersion: null,
  RetrieveCurrentOrganization: null,
  RetrieveEntity: "metadata:read",
  RetrieveAllEntities: "metadata:read",
  RetrieveAttribute: "metadata:read",
  Retrieve: "data:read",
  RetrieveMultiple: "data:read",
  Create: "data:write",
  Update: "data:write",
  Upsert: "data:write",
  Associate: "data:write",
  Disassociate: "data:write",
  Merge: "data:write",
  Delete: "data:delete",
  PublishXml: "metadata:write",
  PublishAllXml: "metadata:write",
  CreateEntity: "metadata:write",
  UpdateEntity: "metadata:write",
  CreateAttribute: "metadata:write",
  UpdateAttribute: "metadata:write",
  CreateOneToMany: "metadata:write",
  CreateManyToMany: "metadata:write",
  DeleteEntity: "metadata:write",
  DeleteAttribute: "metadata:write",
  SetState: "data:write",
  Assign: "data:write",
  GrantAccess: "data:write",
  RevokeAccess: "data:write",
  AddMembersTeam: "data:write",
  RemoveMembersTeam: "data:write",
  ExecuteWorkflow: "data:write",
  BulkDelete: "data:delete",
};

/** Lower case; compared case-insensitively. Wrapper messages that can carry other requests past the per-message check. Never allowed. */
export const FORBIDDEN_MESSAGES: readonly string[] = ["executemultiple", "executetransaction", "executeasync"];

// Dataverse does not distinguish message names by case, so neither does the lookup.
const MESSAGE_PERMISSION_BY_LOWER = new Map(
  Object.entries(MESSAGE_PERMISSION).map(([name, permission]) => [name.toLowerCase(), permission]),
);

const BATCH_OPERATION_PERMISSION: Record<string, Permission> = {
  create: "data:write",
  update: "data:write",
  delete: "data:delete",
};

type Manifest = { permissions: string[]; messages: string[] };
type Authorization = { ok: true; needs: Permission[] } | { ok: false; message: string };

function has(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

/** Permissions that the method needs before the message table is consulted. */
function baseNeeds(method: MethodName, args: unknown): Authorization {
  const rule = METHOD_PERMISSION[method];
  if (rule === null) return { ok: true, needs: [] };
  if (rule === "per-message") {
    const message = isRecord(args) ? args.message : undefined;
    if (typeof message !== "string" || message === "") return { ok: false, message: "A message name is required." };
    return { ok: true, needs: [] };
  }
  if (rule === "per-operation") {
    const operations = isRecord(args) ? args.operations : undefined;
    if (!Array.isArray(operations)) return { ok: false, message: "A list of operations is required." };
    const needs = new Set<Permission>();
    for (const operation of operations) {
      const op = isRecord(operation) ? operation.op : undefined;
      if (typeof op !== "string" || !has(BATCH_OPERATION_PERMISSION, op)) {
        return { ok: false, message: "Unknown batch operation." };
      }
      needs.add(BATCH_OPERATION_PERMISSION[op]);
    }
    return { ok: true, needs: [...needs] };
  }
  return { ok: true, needs: [rule] };
}

/** Decides whether a tool with this manifest may call `method`. The broker is the only caller. */
export function authorize(manifest: Manifest, method: MethodName, args: unknown): Authorization {
  const base = baseNeeds(method, args);
  if (!base.ok) return base;
  const needs = [...base.needs];

  if (METHOD_PERMISSION[method] === "per-message") {
    const message = (args as { message: string }).message;
    if (FORBIDDEN_MESSAGES.includes(message.toLowerCase())) {
      return { ok: false, message: `Message "${message}" cannot be run by a community tool` };
    }
    if (!manifest.messages.includes(message)) {
      return { ok: false, message: `Message "${message}" is not declared in powertools-tool.json` };
    }
    const implied = MESSAGE_PERMISSION_BY_LOWER.get(message.toLowerCase()) ?? null;
    if (implied) needs.push(implied);
  }

  const lacking = needs.find((permission) => !manifest.permissions.includes(permission));
  if (lacking) return { ok: false, message: `This tool does not have the "${lacking}" permission.` };
  return { ok: true, needs };
}
