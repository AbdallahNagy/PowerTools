// Starts Vitest from a working directory with an uppercase drive letter.
//
// On Windows the VS Code terminal and Git Bash can report the working directory as d:\ rather than D:\.
// Vitest then loads "vitest" twice, once under each spelling, and every suite fails with
// "Vitest failed to find the runner". Starting it from D:\ avoids that.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export function normalizeDriveLetter(path, platform = process.platform) {
  return platform === "win32" && /^[a-z]:/.test(path) ? path[0].toUpperCase() + path.slice(1) : path;
}

function main() {
  const cwd = normalizeDriveLetter(process.cwd());
  const vitest = join(dirname(createRequire(`${cwd}/`).resolve("vitest/package.json")), "vitest.mjs");
  const result = spawnSync(process.execPath, [vitest, ...process.argv.slice(2)], { cwd, stdio: "inherit" });
  process.exit(result.status ?? 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
