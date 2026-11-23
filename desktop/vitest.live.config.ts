import { defineConfig } from "vitest/config";

/**
 * The opt-in MCP live tests and agent evals. They need a running Dyno and sandbox connections, so they are
 * never part of `npm test`. See evals/mcp/README.md.
 */
export default defineConfig({
  test: {
    name: "mcp-live",
    environment: "node",
    include: [process.env.DYNO_LIVE_SUITE === "evals" ? "test/live/mcp/evals.live.ts" : "test/live/mcp/parity.live.ts"],
    testTimeout: 20 * 60_000,
    hookTimeout: 60_000,
    // One sandbox, one agent at a time: runs share the environments.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
