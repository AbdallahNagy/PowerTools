import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
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
