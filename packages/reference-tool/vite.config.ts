import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { type Plugin } from "vite";
import { defineConfig } from "vitest/config";

/** Puts the manifest and the icon next to index.html, so dist/ is the folder a user loads. */
function copyPackageFiles(): Plugin {
  return {
    name: "powertools-copy-package-files",
    closeBundle() {
      copyFileSync(resolve(__dirname, "powertools-tool.json"), resolve(__dirname, "dist/powertools-tool.json"));
      copyFileSync(resolve(__dirname, "src/icon.svg"), resolve(__dirname, "dist/icon.svg"));
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [tailwindcss(), copyPackageFiles()],
  esbuild: { jsx: "automatic" },
  // @powertools/ui is linked from a sibling folder with its own react; the tool must bundle exactly one.
  resolve: { dedupe: ["react", "react-dom"] },
  // No modulepreload polyfill: it calls fetch(), which the page policy (connect-src none) forbids.
  build: { outDir: "dist", emptyOutDir: true, assetsInlineLimit: 0, modulePreload: { polyfill: false } },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.tsx"],
  },
});
