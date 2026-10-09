import type { APIRoute } from "astro";

// Points crawlers at the sitemap. Crawlers only read robots.txt at a host's
// root, so this takes effect once the site runs on its own domain; on
// GitHub Pages, submit the sitemap in Google Search Console instead.
export const GET: APIRoute = ({ site }) => {
  const sitemapUrl = new URL(
    `${import.meta.env.BASE_URL.replace(/\/$/, "")}/sitemap-index.xml`,
    site
  ).href;

  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
};
