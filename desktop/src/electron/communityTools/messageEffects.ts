// Shared by the community tool Broker and the MCP server. Must stay import-free so both the
// nodenext main process and the bundler renderer can import it.

export type ToolPermission = "data:read" | "data:write" | "data:delete" | "metadata:read" | "metadata:write" | "files";

export type EffectClass = "read" | "change" | "destructive";

/** Permission implied by each known Dataverse message. A message missing here is allowed only if declared. */
export const MESSAGE_PERMISSION: Record<string, ToolPermission | null> = {
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

/** Lower case. Messages that remove data or metadata, or whose effect cannot be undone. */
export const DESTRUCTIVE_MESSAGES: readonly string[] = [
  "delete",
  "bulkdelete",
  "disassociate",
  "deleteentity",
  "deleteattribute",
  "deleterelationship",
  "deleteoptionvalue",
  "removesolutioncomponent",
  "cloneassolution",
  "merge",
  "revokeaccess",
  "removemembersteam",
  "removeactivecustomizations",
];

const KNOWN_MESSAGES = new Map(
  Object.entries(MESSAGE_PERMISSION).map(([name, permission]) => [name.toLowerCase(), permission]),
);

/** Effect class of a Dataverse message. Unknown messages are destructive. */
export function messageEffect(message: string): EffectClass | "forbidden" {
  const key = message.toLowerCase();
  if (FORBIDDEN_MESSAGES.includes(key)) return "forbidden";
  if (DESTRUCTIVE_MESSAGES.includes(key)) return "destructive";
  if (!KNOWN_MESSAGES.has(key)) return "destructive";
  const permission = KNOWN_MESSAGES.get(key);
  if (permission === null || permission === undefined || permission.endsWith(":read")) return "read";
  return "change";
}
