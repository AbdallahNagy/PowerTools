import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const packagesDir = fileURLToPath(new URL("../../../packages/", import.meta.url));

/**
 * Builds the reference community tool and the two packages it depends on, in dependency order, so the
 * smoke suite never runs against a stale or missing `packages/reference-tool/dist/`.
 */
export default function globalSetup(): void {
  for (const name of ["sdk", "ui", "reference-tool"]) {
    const cwd = join(packagesDir, name);
    const run = (command: string) => {
      try {
        execSync(command, { cwd, stdio: "inherit" });
      } catch {
        throw new Error(`"${command}" failed in packages/${name}. Run it there by hand to see the error.`);
      }
    };
    if (!existsSync(join(cwd, "node_modules"))) run("npm install");
    run("npm run build");
  }
}
