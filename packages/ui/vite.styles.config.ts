import { copyFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import { packageRoot, resolveFromPackage } from "./vite.shared";

/** Drops the JS stub and copies theme.css from the desktop source. */
function finishStyles(): Plugin {
  return {
    name: "powertools-finish-styles",
    closeBundle() {
      rmSync(resolve(packageRoot, "dist/styles-entry.js"), { force: true });
      copyFileSync(resolve(packageRoot, "../../desktop/src/ui/styles/theme.css"), resolve(packageRoot, "dist/theme.css"));
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [resolveFromPackage(), tailwindcss(), finishStyles()],
  build: {
    rollupOptions: {
      input: "src/styles-entry.ts",
      output: {
        entryFileNames: "styles-entry.js",
        assetFileNames: (asset) => (asset.names.some((name) => name.endsWith(".css")) ? "styles.css" : "assets/[name]-[hash][extname]"),
      },
    },
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
});
