import { PUBLIC_TOOLS, type PublicTool } from "../../../desktop/src/ui/tools/publicCatalog";

export { PUBLIC_TOOLS, type PublicTool };

// The desktop sidebar icons, one per tool folder. The folder name is the tool id.
const iconModules = import.meta.glob<string>(
  "../../../desktop/src/ui/tools/*/*-icon.svg",
  { eager: true, query: "?url", import: "default" }
);

const iconsById = new Map(
  Object.entries(iconModules).map(([path, url]) => [
    path.split("/").at(-2) ?? "",
    url
  ])
);

/** URL of the tool's sidebar icon, or undefined when the folder has none. */
export const toolIconUrl = (id: string) => iconsById.get(id);

/** Site-relative path of a tool page, in the trailing-slash form the site serves. */
export const toolPath = (id: string) => `/tools/${id}/`;
