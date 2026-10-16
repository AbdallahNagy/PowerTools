import type { APIRoute } from "astro";
import { PUBLIC_TOOLS, toolPath } from "../lib/tools";

// Every public page, in the trailing-slash form the site serves and the
// canonical links use. Add new pages here so search engines find them.
// Tool pages come from the public catalog, so new tools are listed automatically.
const pages = [
  "/",
  "/tools/",
  ...PUBLIC_TOOLS.map((tool) => toolPath(tool.id)),
  "/request-tool/",
  "/download/",
  "/changelog/",
  "/contact/"
];

export const GET: APIRoute = ({ site }) => {
  const urls = pages
    .map((path) => `  <url><loc>${new URL(path, site).href}</loc></url>`)
    .join("\n");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } }
  );
};
