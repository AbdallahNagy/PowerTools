#!/usr/bin/env node
// Live Dataverse checks for the tool-building pipeline.
//
// Reads a non-production Dataverse environment and an Entra app registration
// from environment variables, gets a token with the client credentials flow,
// and either calls the Dataverse Web API (read only) or calls the local
// sidecar the same way the desktop app does. Tokens, secrets, and the sidecar
// shared secret are never printed.
//
// Setup and rules: desktop/docs/live-dataverse-environment.md
//
// Usage:
//   node scripts/dataverse-live.mjs check [--json]
//   node scripts/dataverse-live.mjs webapi <relative path>
//   node scripts/dataverse-live.mjs sidecar start | status | stop
//   node scripts/dataverse-live.mjs call <METHOD> <path> [--body <json> | --body-file <file>]
//
// Exit codes: 0 success, 1 failure, 2 live environment not configured.

import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Node's built-in fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY is set.
// Re-run once with it so the script works behind a proxy (for example a
// Claude Code cloud session) as well as on a developer machine.
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const child = spawnSync(process.execPath, ["--disable-warning=UNDICI-EHPA", ...process.argv.slice(1)], {
    stdio: "inherit",
    env: { ...process.env, NODE_USE_ENV_PROXY: "1" },
  });
  process.exit(child.status ?? 1);
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiProject = join(repoRoot, "api", "PowerTools", "PowerTools.API", "PowerTools.API.csproj");
const stateFile = join(tmpdir(), "powertools-live-sidecar.json");
const sidecarLog = join(tmpdir(), "powertools-live-sidecar.log");

const REQUIRED_VARS = [
  "DATAVERSE_URL",
  "DATAVERSE_TENANT_ID",
  "DATAVERSE_CLIENT_ID",
  "DATAVERSE_CLIENT_SECRET",
];

const EXIT_NOT_CONFIGURED = 2;

class NotConfiguredError extends Error {}

function readConfig() {
  const missing = REQUIRED_VARS.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new NotConfiguredError(
      `Live Dataverse environment is not configured. Missing: ${missing.join(", ")}. ` +
        "See desktop/docs/live-dataverse-environment.md.",
    );
  }

  const url = process.env.DATAVERSE_URL.trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(url)) {
    throw new Error("DATAVERSE_URL must be an https URL, for example https://contoso-dev.crm.dynamics.com.");
  }

  return {
    url,
    tenantId: process.env.DATAVERSE_TENANT_ID.trim(),
    clientId: process.env.DATAVERSE_CLIENT_ID.trim(),
    clientSecret: process.env.DATAVERSE_CLIENT_SECRET,
    authorityHost: (process.env.DATAVERSE_AUTHORITY_HOST?.trim() || "https://login.microsoftonline.com").replace(
      /\/+$/,
      "",
    ),
  };
}

async function getToken(config) {
  const response = await fetch(`${config.authorityHost}/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: `${config.url}/.default`,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    const reason = payload.error_description?.split("\r\n")[0] ?? payload.error ?? `HTTP ${response.status}`;
    throw new Error(`Token request failed: ${reason}`);
  }
  return payload.access_token;
}

async function webApiGet(config, token, path) {
  const relative = path.replace(/^\/+/, "");
  const response = await fetch(`${config.url}/api/data/v9.2/${relative}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      Prefer: 'odata.include-annotations="*"',
    },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, ok: response.ok, body };
}

function describeError(result) {
  const message = result.body?.error?.message ?? (typeof result.body === "string" ? result.body : "");
  return `HTTP ${result.status}${message ? `: ${message}` : ""}`;
}

async function check(args) {
  const config = readConfig();
  const token = await getToken(config);

  const who = await webApiGet(config, token, "WhoAmI");
  if (!who.ok) throw new Error(`WhoAmI failed: ${describeError(who)}`);

  const version = await webApiGet(config, token, "RetrieveVersion");
  const org = await webApiGet(
    config,
    token,
    `organizations(${who.body.OrganizationId})?$select=name,languagecode`,
  );
  const user = await webApiGet(
    config,
    token,
    `systemusers(${who.body.UserId})?$select=fullname,applicationid,isdisabled`,
  );

  const summary = {
    configured: true,
    environmentUrl: config.url,
    organizationName: org.ok ? org.body.name : null,
    organizationId: who.body.OrganizationId,
    version: version.ok ? version.body.Version : null,
    callerUserId: who.body.UserId,
    callerName: user.ok ? user.body.fullname : null,
  };

  if (args.includes("--json")) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log("Live Dataverse environment: connected");
  console.log(`  URL:          ${summary.environmentUrl}`);
  console.log(`  Organization: ${summary.organizationName ?? "(not readable)"} (${summary.organizationId})`);
  console.log(`  Version:      ${summary.version ?? "(not readable)"}`);
  console.log(`  Caller:       ${summary.callerName ?? "(not readable)"} (${summary.callerUserId})`);
}

async function webapi(args) {
  const path = args[0];
  if (!path) throw new Error("Usage: webapi <relative path>, for example webapi \"EntityDefinitions(LogicalName='account')?$select=LogicalName\"");
  if (/^https?:/i.test(path)) throw new Error("Pass a path relative to /api/data/v9.2/, not a full URL.");

  const config = readConfig();
  const token = await getToken(config);
  const result = await webApiGet(config, token, path);
  console.log(`HTTP ${result.status}`);
  console.log(typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2));
  if (!result.ok) process.exitCode = 1;
}

function readState() {
  if (!existsSync(stateFile)) return null;
  try {
    return JSON.parse(readFileSync(stateFile, "utf8"));
  } catch {
    return null;
  }
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

function hasDotnet() {
  return spawnSync("dotnet", ["--version"], { stdio: "ignore", shell: process.platform === "win32" }).status === 0;
}

async function sidecarStart() {
  const existing = readState();
  if (existing && isRunning(existing.pid)) {
    console.log(`Sidecar already running on http://127.0.0.1:${existing.port} (pid ${existing.pid}).`);
    return;
  }

  if (!hasDotnet()) {
    throw new Error("dotnet is not installed. Install the .NET 9 SDK (or newer); see desktop/docs/live-dataverse-environment.md.");
  }

  console.log("Building the sidecar...");
  const build = spawnSync("dotnet", ["build", apiProject, "-nologo", "-v", "q"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (build.status !== 0) throw new Error("dotnet build failed.");

  const port = await freePort();
  const secret = randomBytes(32).toString("hex");
  const log = openSync(sidecarLog, "w");
  const child = spawn(
    "dotnet",
    ["run", "--no-build", "--no-launch-profile", "--project", apiProject, "--", "--port", String(port), "--secret", secret],
    {
      detached: true,
      stdio: ["ignore", log, log],
      // The API targets net9.0. Roll forward lets a machine with only a newer
      // runtime (for example .NET 10 from the Ubuntu archive) run it.
      env: { ...process.env, DOTNET_ROLL_FORWARD: process.env.DOTNET_ROLL_FORWARD ?? "Major" },
      shell: process.platform === "win32",
    },
  );
  child.unref();

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const output = readFileSync(sidecarLog, "utf8");
    if (output.includes(`LISTENING ${port}`)) {
      writeFileSync(stateFile, JSON.stringify({ pid: child.pid, port, secret }), { mode: 0o600 });
      console.log(`Sidecar listening on http://127.0.0.1:${port} (pid ${child.pid}). Log: ${sidecarLog}`);
      return;
    }
    if (child.exitCode !== null || !isRunning(child.pid)) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  try {
    process.kill(-child.pid);
  } catch {
    // Already gone.
  }
  throw new Error(`Sidecar did not start. Last log lines:\n${readFileSync(sidecarLog, "utf8").split("\n").slice(-20).join("\n")}`);
}

function sidecarStatus() {
  const state = readState();
  if (state && isRunning(state.pid)) {
    console.log(`Sidecar running on http://127.0.0.1:${state.port} (pid ${state.pid}). Log: ${sidecarLog}`);
  } else {
    console.log("Sidecar not running.");
    process.exitCode = 1;
  }
}

function sidecarStop() {
  const state = readState();
  if (state && isRunning(state.pid)) {
    try {
      process.kill(process.platform === "win32" ? state.pid : -state.pid);
    } catch {
      process.kill(state.pid);
    }
    console.log(`Stopped sidecar (pid ${state.pid}).`);
  } else {
    console.log("Sidecar not running.");
  }
  rmSync(stateFile, { force: true });
}

async function call(args) {
  const [method, path, ...rest] = args;
  if (!method || !path) {
    throw new Error("Usage: call <METHOD> <path> [--body <json> | --body-file <file>]");
  }

  let body;
  const bodyIndex = rest.indexOf("--body");
  const bodyFileIndex = rest.indexOf("--body-file");
  if (bodyIndex >= 0) body = rest[bodyIndex + 1];
  if (bodyFileIndex >= 0) body = readFileSync(rest[bodyFileIndex + 1], "utf8");
  if (body !== undefined) JSON.parse(body); // Fail early on invalid JSON.

  const state = readState();
  if (!state || !isRunning(state.pid)) {
    throw new Error("Sidecar not running. Run: node scripts/dataverse-live.mjs sidecar start");
  }

  const config = readConfig();
  const token = await getToken(config);
  const response = await fetch(`http://127.0.0.1:${state.port}${path.startsWith("/") ? path : `/${path}`}`, {
    method: method.toUpperCase(),
    headers: {
      "X-Local-Secret": state.secret,
      Authorization: `Bearer ${token}`,
      "X-Environment-Url": config.url,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body,
  });

  const text = await response.text();
  console.log(`HTTP ${response.status}`);
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    if (text) console.log(text);
  }
  if (!response.ok) process.exitCode = 1;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "check":
      return check(args);
    case "webapi":
      return webapi(args);
    case "sidecar":
      if (args[0] === "start") return sidecarStart();
      if (args[0] === "status") return sidecarStatus();
      if (args[0] === "stop") return sidecarStop();
      throw new Error("Usage: sidecar start | status | stop");
    case "call":
      return call(args);
    default:
      console.log(
        "Usage: node scripts/dataverse-live.mjs <check [--json] | webapi <path> | sidecar start|status|stop | call <METHOD> <path> [--body <json>]>",
      );
      process.exitCode = command ? 1 : 0;
  }
}

main().catch((error) => {
  if (error instanceof NotConfiguredError) {
    console.error(error.message);
    process.exit(EXIT_NOT_CONFIGURED);
  }
  console.error(error.message);
  process.exit(1);
});
