// Ships the tools marked `unreleased: true` in the public tool catalog by
// removing the flag, so the website and the README list them once the release
// that contains them is published. Prepare Release runs this, then
// scripts/sync-readme-tools.mjs. See docs/releasing.md.
//
// Usage:
//   node scripts/release-tools.mjs   update publicCatalog.ts and print the released tool ids

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(root, "desktop", "src", "ui", "tools", "publicCatalog.ts");

// The flag line inside a catalog entry. The interface declares it as
// `unreleased?: true;`, which this does not match.
const FLAG_LINE = /^[ \t]*unreleased: true,?[ \t]*\r?\n/gm;
const FLAGGED_ID = /id: "([^"]+)"[^{}]*?^[ \t]*unreleased: true,?[ \t]*$/gm;

/** The catalog source without unreleased flags, and the ids that had one. */
export function releaseTools(source) {
  const released = [...source.matchAll(FLAGGED_ID)].map((match) => match[1]);
  return { source: source.replace(FLAG_LINE, ""), released };
}

function main() {
  const { source, released } = releaseTools(readFileSync(catalogPath, "utf8"));
  if (released.length === 0) {
    console.log("No unreleased tools in the public catalog.");
    return 0;
  }

  writeFileSync(catalogPath, source);
  console.log(`Released tools: ${released.join(", ")}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
