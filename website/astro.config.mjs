import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

const isGitHubPages = process.env.GITHUB_PAGES === "true";

export default defineConfig({
  site: isGitHubPages
    ? "https://abdallahnagy.github.io"
    : "https://powertools.dev",
  base: isGitHubPages ? "/PowerTools" : "/",
  // Pages build to folders (contact/index.html), so GitHub Pages serves them
  // at /contact/. Linking and canonicalizing with the slash avoids redirects
  // and duplicate URLs in search results.
  trailingSlash: "always",
  integrations: [sitemap()]
});
