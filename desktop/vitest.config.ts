import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@powertools/sdk/protocol": fileURLToPath(new URL("../packages/sdk/src/protocol.ts", import.meta.url)),
    },
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "coverage",
    },
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: [
            "test/*.test.{mjs,ts}",
            "test/electron/**/*.test.ts",
            "src/ui/shared/**/*.test.ts",
            "src/ui/tools/**/tests/node/**/*.test.{mjs,ts}",
          ],
          setupFiles: ["test/setup/node.ts"],
          clearMocks: true,
          restoreMocks: true,
        },
      },
      {
        extends: true,
        test: {
          name: "renderer",
          environment: "jsdom",
          // jsdom runs several times slower on Windows (the production target) than on
          // Linux. The heaviest tool tests take about 0.5s on Linux and over 5s on Windows.
          testTimeout: 20_000,
          hookTimeout: 30_000,
          include: [
            "test/renderer/**/*.test.{ts,tsx}",
            "src/ui/tools/**/tests/renderer/**/*.test.{ts,tsx}",
          ],
          setupFiles: ["test/setup/renderer.ts"],
          clearMocks: true,
          restoreMocks: true,
        },
      },
    ],
  },
});
