import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export interface IsolatedUserDataDir {
  readonly path: string;
  remove(): Promise<void>;
}

export async function createIsolatedUserDataDir(): Promise<IsolatedUserDataDir> {
  const tempRoot = resolve(tmpdir());
  const createdPath = await mkdtemp(join(tempRoot, "power-tools-smoke-"));

  return {
    path: createdPath,
    async remove() {
      const resolvedPath = resolve(createdPath);
      const relativePath = relative(tempRoot, resolvedPath);

      if (
        relativePath === "" ||
        relativePath === ".." ||
        relativePath.startsWith(`..${sep}`) ||
        isAbsolute(relativePath)
      ) {
        throw new Error(`Refusing to remove smoke profile outside the OS temp directory: ${resolvedPath}`);
      }

      await rm(resolvedPath, { force: true, recursive: true });
    },
  };
}
