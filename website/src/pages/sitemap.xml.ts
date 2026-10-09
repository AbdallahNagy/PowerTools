import type { APIRoute } from "astro";

// Every public page, in the trailing-slash form GitHub Pages serves and the
// canonical links use. Add new pages here so search engines find them.
const pages = ["/", "/xrmtoolbox-alternative/", "/download/", "/contact/"];

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
