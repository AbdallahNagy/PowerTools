import { defineConfig } from "astro/config";

const isGitHubPages = process.env.GITHUB_PAGES === "true";

export default defineConfig({
  site: isGitHubPages
    ? "https://abdallahnagy.github.io"
    : "https://powertools.dev",
  base: isGitHubPages ? "/PowerTools" : "/"
});
