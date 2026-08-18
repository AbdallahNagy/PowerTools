import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/smoke",
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  timeout: 120_000,
  reporter: [
    ["list"],
    ["html", { open: "never" }],
  ],
  use: {
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev:react -- --host 127.0.0.1 --port 5123 --strictPort",
    url: "http://127.0.0.1:5123/",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
