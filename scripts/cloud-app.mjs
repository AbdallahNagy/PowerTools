#!/usr/bin/env node
// Launches the full desktop app (Vite renderer, Electron main, and the
// `dotnet run` API sidecar) in development mode with an isolated profile,
// waits until the sidecar is listening and the main window has rendered,
// then saves a screenshot. Meant for headless Linux cloud sessions:
//
//   xvfb-run -a node scripts/cloud-app.mjs [--out shot.png] [--keep] [--tool "FetchXML Builder"]
//
//   --out   screenshot path (default: desktop/test-results/cloud-app.png)
//   --keep  leave the app running until Ctrl+C instead of exiting
//   --tool  click the welcome-page card whose title matches before the shot
//
// Run scripts/cloud-setup.sh first.
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "desktop");
const require = createRequire(join(desktopDir, "package.json"));
const { _electron: electron } = require("@playwright/test");

const { values: args } = parseArgs({
  options: {
    out: { type: "string", default: join(desktopDir, "test-results", "cloud-app.png") },
    keep: { type: "boolean", default: false },
    tool: { type: "string" },
  },
});

const rendererUrl = "http://localhost:5123/";

async function waitForRenderer(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch("http://127.0.0.1:5123/")).ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Vite dev server did not start on port 5123.");
}

// The renderer and Electron main must be current before launch.
await new Promise((ok, fail) => {
  const p = spawn("npm", ["run", "transpile:electron"], { cwd: desktopDir, stdio: "inherit" });
  p.once("exit", (code) => (code === 0 ? ok() : fail(new Error(`transpile:electron exited ${code}`))));
});

const vite = spawn("npm", ["run", "dev:react", "--", "--host", "127.0.0.1", "--port", "5123", "--strictPort"], {
  cwd: desktopDir,
  stdio: "ignore",
  detached: true,
});
const userData = await mkdtemp(join(tmpdir(), "power-tools-cloud-"));
let app;

async function shutdown(code) {
  try {
    await app?.close();
  } catch {
    // Already closed.
  }
  try {
    process.kill(-vite.pid);
  } catch {
    // Already stopped.
  }
  await rm(userData, { recursive: true, force: true });
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

try {
  await waitForRenderer();

  app = await electron.launch({
    args: [`--user-data-dir=${userData}`, "--host-resolver-rules=MAP localhost 127.0.0.1", "--no-sandbox", "."],
    cwd: desktopDir,
    env: { ...process.env, NODE_ENV: "development", SENTRY_DSN: "" },
  });

  let resolveSidecar;
  const sidecarReady = new Promise((r) => (resolveSidecar = r));
  app.process().stdout.on("data", (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);
    // sidecar.ts echoes API stdout per chunk, so the prefix may be on an earlier line.
    if (/^(\[sidecar\] )?LISTENING \d+/m.test(text)) resolveSidecar();
  });
  app.process().stderr.on("data", (chunk) => process.stderr.write(chunk));

  // A splash window opens first; poll for the main renderer window.
  let window;
  for (const deadline = Date.now() + 60_000; !window && Date.now() < deadline; ) {
    window = app.windows().find((w) => w.url() === rendererUrl);
    if (!window) await new Promise((r) => setTimeout(r, 250));
  }
  if (!window) throw new Error("Main window did not open.");

  await window.getByRole("heading", { level: 1, name: "PowerTools" }).waitFor({ timeout: 60_000 });
  await Promise.race([
    sidecarReady,
    new Promise((_, fail) => setTimeout(() => fail(new Error("Sidecar did not report LISTENING within 120s.")), 120_000)),
  ]);
  console.log("[cloud-app] sidecar listening, main window rendered");

  if (args.tool) {
    await window.getByRole("button").filter({ hasText: args.tool }).first().click();
    await window.waitForTimeout(1_500);
  }

  await mkdir(dirname(args.out), { recursive: true });
  await window.screenshot({ path: args.out });
  console.log(`[cloud-app] screenshot: ${resolve(args.out)}`);

  if (args.keep) {
    console.log("[cloud-app] running; Ctrl+C to stop");
    await new Promise(() => {});
  }
  await shutdown(0);
} catch (error) {
  console.error(`[cloud-app] ${error.message}`);
  await shutdown(1);
}
