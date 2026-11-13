import { resolve, sep } from "node:path";
import type { Plugin } from "vite";

export const packageRoot = process.cwd(); // npm scripts run from the package folder
const desktopSrc = resolve(packageRoot, "../../desktop/src") + sep;
const anchor = resolve(packageRoot, "src/index.ts");

/**
 * The kit's source lives under desktop/, so Node resolution from those files would find
 * desktop/node_modules. Resolve every bare import from there as if it were written in
 * packages/ui/src, so the package builds with only its own node_modules installed.
 */
export function resolveFromPackage(): Plugin {
  return {
    name: "powertools-resolve-from-package",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer || !importer.replaceAll("/", sep).startsWith(desktopSrc)) return null;
      if (source.startsWith(".") || source.startsWith("/") || /^[a-zA-Z]:/.test(source)) return null;
      return this.resolve(source, anchor, { ...options, skipSelf: true });
    },
  };
}
