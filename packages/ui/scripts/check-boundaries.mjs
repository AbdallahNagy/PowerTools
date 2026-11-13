// Fails the build if the bundled module graph reaches app-private code, or if a module
// came from anywhere other than the kit source and this package's own node_modules.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(packageRoot, "dist");
const repoRoot = resolve(packageRoot, "../..");
const forbidden = ["desktop/src/ui/platform/", "desktop/src/ui/shell/", "desktop/src/ui/tools/", "desktop/src/electron/"];

// CodeMirror is only for tools that import the code-editor entry; no other file may bundle it.
const editorLibraries = ["node_modules/@codemirror/", "node_modules/@lezer/", "node_modules/codemirror/"];
const editorFiles = (map) => map === "code-editor.js.map" || map.startsWith("CodeMirrorEditor-");

const maps = readdirSync(dist).filter((name) => name.endsWith(".js.map"));
if (maps.length === 0) {
  console.error("check-boundaries: no source maps in dist; run vite build first.");
  process.exit(1);
}

const problems = [];
let moduleCount = 0;
for (const map of maps) {
  const { sources } = JSON.parse(readFileSync(join(dist, map), "utf8"));
  for (const source of sources) {
    moduleCount += 1;
    const absolute = resolve(dist, source).replaceAll("\\", "/");
    const relative = absolute.startsWith(repoRoot.replaceAll("\\", "/")) ? absolute.slice(repoRoot.length + 1) : absolute;
    if (forbidden.some((prefix) => relative.startsWith(prefix))) {
      problems.push(`${map}: ${relative} is app-private code`);
    }
    if (!editorFiles(map) && editorLibraries.some((library) => relative.includes(library))) {
      problems.push(`${map}: ${relative} puts CodeMirror outside the code-editor entry`);
    }
    if (relative.startsWith("desktop/node_modules/")) {
      problems.push(`${map}: ${relative} resolved from desktop/node_modules instead of packages/ui/node_modules`);
    }
  }
}

if (problems.length > 0) {
  console.error(`check-boundaries failed:\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`check-boundaries: ${moduleCount} bundled modules, none under platform, shell, tools or electron, and CodeMirror only in the code-editor entry.`);
