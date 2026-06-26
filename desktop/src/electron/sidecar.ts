import { ChildProcess, spawn } from "child_process";
import { app } from "electron";
import { randomBytes } from "crypto";
import net from "net";
import path from "path";
import { isDev } from "./utils.js";

/**
 * Manages the lifecycle of the bundled PowerTools.API process (the "sidecar").
 *
 * The sidecar is a self-contained ASP.NET Core minimal API that binds a
 * loopback port and brokers Dataverse calls on behalf of the renderer. Its
 * existence and configuration are private to this module:
 *
 *   • A free ephemeral port is chosen at runtime (no fixed port collisions).
 *   • A 32-byte per-launch shared secret protects the loopback port from
 *     other local processes; the renderer sends it via `X-Local-Secret`.
 *   • Electron's PID is passed via `--parentPid` so the sidecar self-exits
 *     if Electron crashes without a clean shutdown.
 *   • Readiness is detected by waiting for the sidecar to print
 *     `LISTENING <port>` on stdout (no polling, no fixed sleeps).
 */

interface SidecarHandle {
  baseUrl: string;
  secret: string;
}

let handle: SidecarHandle | null = null;
let child: ChildProcess | null = null;
let stopping = false;

const READY_TIMEOUT_MS = 30_000;

/** Resolves once the sidecar is bound and ready to accept requests. */
export async function start(): Promise<SidecarHandle> {
  if (handle) return handle;

  const port = await pickFreePort();
  const secret = randomBytes(32).toString("hex");
  const baseUrl = `http://127.0.0.1:${port}`;

  const { command, args, cwd } = resolveSpawn(port, secret);

  child = spawn(command, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    env: { ...process.env, DOTNET_NOLOGO: "1", DOTNET_CLI_TELEMETRY_OPTOUT: "1" },
  });

  child.stdout?.on("data", (chunk: Buffer) =>
    process.stdout.write(`[sidecar] ${chunk}`)
  );
  child.stderr?.on("data", (chunk: Buffer) =>
    process.stderr.write(`[sidecar err] ${chunk}`)
  );
  child.on("exit", (code, signal) => {
    if (!stopping) {
      console.error(
        `[sidecar] exited unexpectedly (code=${code}, signal=${signal})`
      );
    }
    child = null;
  });

  await waitForReady(child);
  handle = { baseUrl, secret };
  return handle;
}

/** Terminates the sidecar process. Safe to call multiple times. */
export function stop(): void {
  stopping = true;
  if (!child || child.exitCode !== null) return;
  try {
    child.kill();
  } catch (err) {
    console.error("[sidecar] kill failed:", err);
  }
}

export function getHandle(): SidecarHandle | null {
  return handle;
}

// ─── helpers ──────────────────────────────────────────────────────────────

function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        reject(new Error("Failed to determine a free loopback port."));
      }
    });
  });
}

function resolveSpawn(port: number, secret: string): {
  command: string;
  args: string[];
  cwd: string;
} {
  const sharedArgs = [
    "--port", String(port),
    "--secret", secret,
    "--parentPid", String(process.pid),
  ];

  if (isDev()) {
    // Inner loop: `dotnet run` against the source project. Requires the
    // .NET 9 SDK on the contributor's machine (already true for anyone
    // editing the C# project).
    const projectDir = path.resolve(
      app.getAppPath(),
      "..",
      "api",
      "PowerTools",
      "PowerTools.API"
    );
    return {
      command: "dotnet",
      args: [
        "run",
        "--project", projectDir,
        "--no-launch-profile",
        "--",
        ...sharedArgs,
      ],
      cwd: projectDir,
    };
  }

  // Production: self-contained single-file executable bundled via
  // electron-builder.extraResources at `<resources>/api/`.
  const exeName =
    process.platform === "win32" ? "PowerTools.API.exe" : "PowerTools.API";
  const exePath = path.join(process.resourcesPath, "api", exeName);
  return {
    command: exePath,
    args: sharedArgs,
    cwd: path.dirname(exePath),
  };
}

function waitForReady(proc: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err); else resolve();
    };

    const timer = setTimeout(
      () => finish(new Error(`Sidecar did not become ready within ${READY_TIMEOUT_MS}ms.`)),
      READY_TIMEOUT_MS
    );

    let buffered = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      buffered += chunk.toString();
      if (/^LISTENING\b/m.test(buffered)) finish();
    });
    proc.once("exit", (code, signal) =>
      finish(new Error(`Sidecar exited before ready (code=${code}, signal=${signal}).`))
    );
    proc.once("error", finish);
  });
}
