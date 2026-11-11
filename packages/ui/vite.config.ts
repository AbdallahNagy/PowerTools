import { defineConfig } from "vitest/config";
import { resolveFromPackage } from "./vite.shared";

export default defineConfig({
  plugins: [resolveFromPackage()],
  esbuild: { jsx: "automatic" },
  build: {
    lib: {
      entry: { index: "src/index.ts", "code-editor": "src/code-editor.ts" },
      formats: ["es"],
    },
    outDir: "dist",
    emptyOutDir: false,
    sourcemap: true,
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
