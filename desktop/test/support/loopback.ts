import { httpServer } from "./httpServer";

/**
 * Stops the MSW interceptor for the rest of the test file. MSW's fetch patch breaks the long-lived
 * streaming responses of a real loopback MCP server, so tests that run one need the real fetch.
 */
export function bypassMsw() {
  httpServer.close();
}
