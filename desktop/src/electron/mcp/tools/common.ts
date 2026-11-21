import type { AgentToolContext } from "../types.js";

/** The sidecar routes of the agent tools. */
export const AGENT_API = "/api/agent";

/** The sidecar routes for record reads, shared with the community tools. */
export const DATA_API = "/api/community-tools/data";

export const NAME_PATTERN = "^[a-z_][a-z0-9_]*$";
export const GUID_PATTERN = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

export const connectionProp = {
  type: "string",
  description: "Display name of a saved connection (see connections_list). Defaults to the active connection.",
};

export const str = (value: unknown) => String(value);

/** "1 step" or "3 steps". */
export const steps = (count: number) => `${count} step${count === 1 ? "" : "s"}`;

/** The arguments without the connection, as the sidecar takes them. */
export function bodyOf(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args).filter(([key]) => key !== "connection"));
}

/** POSTs to an agent route on the call's connection. */
export async function postAgent(args: Record<string, unknown>, ctx: AgentToolContext, route: string, body = bodyOf(args)) {
  // Approval already resolved this connection; the context hands back the same one.
  const conn = await ctx.resolveConnection(args.connection as string | undefined);
  const data = await ctx.callSidecar(conn, "POST", `${AGENT_API}${route}`, body, ctx.signal);
  return { conn, data };
}
